import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { EMAIL_CLAIM_STALE_MINUTES, MAX_ENRICHMENT_ATTEMPTS, emailDomain, isReservedEmailDomain } from '@/lib/config/app';
import { canAttemptEmail, renderConfirmation, shouldSendConfirmation } from '@/lib/email/confirmation';
import { hasMx } from '@/lib/email/mx';
import { sendTransactional } from '@/lib/email/brevo';
import { isPermanentBrevoError, sanitizeDisplayName, type BrevoError } from '@/lib/email/errors';
import { enrichmentErrorCode } from '@/lib/enrichment/errors';
import { evaluateGeocode } from '@/lib/enrichment/evaluate';
import { searchFreeText, searchPostalCodeCentroid, searchStructured } from '@/lib/enrichment/nominatim';
import { lookupPostalCode } from '@/lib/enrichment/openplz';
import { errInfo } from '@/lib/log';
import { createAdminClient } from '@/lib/supabase/admin';
import { logEvent } from './events';
import type { LeadRow } from './types';

async function loadLead(db: SupabaseClient, id: string): Promise<LeadRow> {
  const { data, error } = await db.from('leads').select('*').eq('id', id).single();
  if (error) throw error;
  return data as LeadRow;
}

function logDbError(what: string, id: string, error: { code?: string; message: string }) {
  console.error(what, id, errInfo(error));
}

export async function processConfirmation(db: SupabaseClient, id: string, now: Date): Promise<void> {
  const lead = await loadLead(db, id);
  if (lead.email_status === 'done' || lead.email_status === 'skipped') return;
  if (!canAttemptEmail(lead, now)) return;

  // Atomic claim: 'sending' + optimistic attempts lock, so only one worker proceeds.
  // A crashed worker leaves 'sending' behind; the lease expires after EMAIL_CLAIM_STALE_MINUTES.
  const attempts = lead.email_attempts + 1;
  const staleBefore = new Date(now.getTime() - EMAIL_CLAIM_STALE_MINUTES * 60_000).toISOString();
  const { data: claimed, error: claimError } = await db.from('leads')
    .update({ email_status: 'sending', email_claimed_at: now.toISOString(), email_attempts: attempts })
    .eq('id', id).eq('email_attempts', lead.email_attempts)
    .or(`email_status.in.(pending,failed),and(email_status.eq.sending,email_claimed_at.lt.${staleBefore})`)
    .select('id');
  if (claimError) { logDbError('email claim failed', id, claimError); return; }
  if (!claimed || claimed.length === 0) return;

  const update = async (patch: Record<string, unknown>, what: string): Promise<boolean> => {
    const { error } = await db.from('leads').update(patch).eq('id', id);
    if (error) { logDbError(what, id, error); return false; }
    return true;
  };

  const mx = isReservedEmailDomain(lead.email_normalized) ? 'yes' : await hasMx(emailDomain(lead.email_normalized));
  const since = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const { count, error: countError } = await db.from('leads').select('id', { count: 'exact', head: true })
    .eq('email_normalized', lead.email_normalized).eq('email_status', 'done').gte('email_sent_at', since).neq('id', id);
  if (countError) {
    logDbError('email throttle lookup failed', id, countError);
    await update({ email_status: 'failed', email_last_error: 'throttle lookup failed' }, 'email status update failed');
    return;
  }

  const decision = shouldSendConfirmation(lead, { mx, sentToSameAddressLast24h: (count ?? 0) > 0, now });

  if (!decision.send) {
    if (decision.retryable) {
      await update({ email_status: 'failed', email_last_error: decision.reason }, 'email status update failed');
      await logEvent(db, id, 'email_failed', { reason: decision.reason, attempts });
    } else {
      await update({ email_status: 'skipped', email_skip_reason: decision.reason }, 'email status update failed');
      await logEvent(db, id, 'email_skipped', { reason: decision.reason });
    }
    return;
  }

  let messageId: string;
  try {
    const mail = renderConfirmation(lead);
    ({ messageId } = await sendTransactional({
      to: { email: lead.email, name: sanitizeDisplayName(lead.first_name, lead.last_name) }, ...mail, tags: ['standort-check'],
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 500) : 'unknown';
    if (isPermanentBrevoError(err)) {
      await update({ email_status: 'skipped', email_skip_reason: 'rejected_by_provider', email_last_error: message }, 'email status update failed');
      await logEvent(db, id, 'email_skipped', { reason: 'rejected_by_provider', status: (err as BrevoError).status });
    } else {
      await update({ email_status: 'failed', email_last_error: message }, 'email status update failed');
      await logEvent(db, id, 'email_failed', { error: message, attempts });
    }
    return;
  }

  const ok = await update({ email_status: 'done', email_sent_at: new Date().toISOString(), email_last_error: null }, 'email sent but status update failed');
  if (!ok) console.error('email sent but status update failed', id, { messageId });
  await logEvent(db, id, 'email_sent', { messageId });
}

/**
 * Geocodes and verifies the address (OpenPLZ + Nominatim, road-verified). Idempotent: the same input yields the same
 * facts, so no claim is needed; a concurrent duplicate run just writes the same result. Gives up once
 * MAX_ENRICHMENT_ATTEMPTS is reached. Log lines carry codes/messages only, never address data.
 * `_now` keeps the signature parallel to processConfirmation (one clock per run); enriched_at uses the real finish time.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function processEnrichment(db: SupabaseClient, id: string, _now: Date): Promise<void> {
  const lead = await loadLead(db, id);
  if (lead.enrichment_status === 'done' || lead.enrichment_status === 'skipped') return;
  if (lead.enrichment_attempts >= MAX_ENRICHMENT_ATTEMPTS) return;
  const attempts = lead.enrichment_attempts + 1;
  try {
    const plz = !lead.address_unknown && lead.postal_code ? await lookupPostalCode(lead.postal_code) : null;
    // An unknown PLZ (A-5) is left out of the structured query: street + number + city only.
    const plzKnown = plz !== null && plz.length > 0;
    // A blank description would make Nominatim return "Deutschland" itself and fake a locality hit.
    const hits = lead.address_unknown
      ? (lead.plot_note?.trim() ? await searchFreeText(lead.plot_note) : [])
      : await searchStructured({ street: lead.street ?? '', houseNumber: lead.house_number, postalCode: lead.postal_code ?? '', city: lead.city ?? '' }, plzKnown);
    let result = evaluateGeocode(
      {
        addressUnknown: lead.address_unknown, street: lead.street, houseNumber: lead.house_number,
        postalCode: lead.postal_code, city: lead.city, plotNote: lead.plot_note,
      },
      plz, hits,
    );
    let centroid: { lat: number; lon: number } | null = null;
    if (result.precision === 'postcode' && result.lat === null && lead.postal_code) {
      centroid = await searchPostalCodeCentroid(lead.postal_code);
      if (centroid) result = { ...result, lat: centroid.lat, lon: centroid.lon };
    }
    const { error } = await db.from('leads').update({
      enrichment_status: 'done', enrichment_attempts: attempts, enrichment_last_error: null, enriched_at: new Date().toISOString(),
      geo_precision: result.precision, geo_lat: result.lat, geo_lon: result.lon,
      geo_municipality: result.municipality, geo_municipality_key: result.municipalityKey, geo_district: result.district,
      geo_state_code: result.stateCode, geo_found_postcode: result.foundPostcode, geo_flags: result.flags,
      geo_candidates: result.candidates, geo_raw: { openplz: plz, nominatim: hits, centroid },
    }).eq('id', id);
    if (error) throw error;
    await logEvent(db, id, 'enriched', { precision: result.precision, flags: result.flags });
  } catch (err) {
    const message = enrichmentErrorCode(err); // 'rate_limited' | 'timeout' | 'config_missing_contact' | truncated message
    console.error('enrichment failed', id, { code: errInfo(err).code, message, attempts });
    // Never overwrite a 'done' row (e.g. a concurrent run that succeeded while this one failed).
    const { data: marked, error } = await db.from('leads')
      .update({ enrichment_status: 'failed', enrichment_attempts: attempts, enrichment_last_error: message })
      .eq('id', id).neq('enrichment_status', 'done')
      .select('id');
    if (error) logDbError('enrichment status update failed', id, error);
    else if (!marked || marked.length === 0) return; // already done: keep its state and event log untouched
    await logEvent(db, id, 'enrichment_failed', { error: message, attempts });
  }
}

/** Runs after the HTTP response. Each step is independent: a failing email must not block enrichment. */
export async function runSideEffects(id: string): Promise<void> {
  try {
    const db = createAdminClient();
    const now = new Date();
    try {
      await processConfirmation(db, id, now);
    } catch (err) {
      console.error('confirmation step crashed', id, errInfo(err));
    }
    try {
      await processEnrichment(db, id, now);
    } catch (err) {
      console.error('enrichment step crashed', id, errInfo(err));
    }
  } catch (err) {
    console.error('side effects setup failed', id, errInfo(err));
  }
}
