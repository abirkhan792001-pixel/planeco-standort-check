import type { SupabaseClient } from '@supabase/supabase-js';
import { MIN_FILL_MS, PRIVACY_NOTICE_VERSION, isReservedEmailDomain } from '@/lib/config/app';
import { ATTRIBUTION_KEYS } from '@/lib/attribution/types';
import { errInfo } from '@/lib/log';
import { buildAddressKey, normalizeEmail, normalizePhone } from './normalize';
import { decideDuplicate, findMatches, NO_DUPLICATE, type DedupeKeys, type DuplicateDecision } from './dedupe';
import { fieldErrors, leadPayloadSchema, type LeadPayload } from './schema';
import type { DeviceType } from './types';

export type CreateLeadResult =
  | { kind: 'created'; id: string; runSideEffects: boolean }
  | { kind: 'replay'; id: string }
  | { kind: 'invalid'; errors: Record<string, string> }
  | { kind: 'fallback' }
  | { kind: 'unavailable' };

export type CreateLeadContext = {
  now: Date;
  userAgent: string | null;
  getDb: () => SupabaseClient;
  sendFallback: (p: LeadPayload) => Promise<boolean>;
};

export function deviceType(ua: string | null): DeviceType {
  if (!ua) return 'unknown';
  if (/ipad|tablet/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) return 'tablet';
  if (/mobi|iphone|android/i.test(ua)) return 'mobile';
  return 'desktop';
}

export function spamReason(p: LeadPayload): 'honeypot' | 'too_fast' | null {
  if (p.website.trim()) return 'honeypot';
  if (p.fillMs < MIN_FILL_MS) return 'too_fast';
  return null;
}

/** Postgres data/constraint errors (SQLSTATE class 22/23): the row itself is bad, the DB is up. */
export function isDataError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && (code.startsWith('22') || code.startsWith('23'));
}

/** `?test=1` or a reserved email domain. One rule for the stored flag and for duplicate matching. */
export function isTestLead(p: Pick<LeadPayload, 'isTest' | 'email'>): boolean {
  return p.isTest || isReservedEmailDomain(p.email);
}

export function dedupeKeysFromPayload(p: LeadPayload): DedupeKeys {
  return {
    email_normalized: normalizeEmail(p.email),
    phone_e164: normalizePhone(p.phone).e164,
    address_key: buildAddressKey({ street: p.street, houseNumber: p.houseNumber, postalCode: p.postalCode, addressUnknown: p.addressUnknown }),
  };
}

export function buildLeadInsert(
  p: LeadPayload,
  o: { now: Date; userAgent: string | null; spam: string | null; decision: DuplicateDecision },
): Record<string, unknown> {
  const phone = normalizePhone(p.phone);
  const known = !p.addressUnknown;
  const attribution = Object.fromEntries(
    [...ATTRIBUTION_KEYS, 'landing_path', 'referrer'].map((k) => [k, (p.attribution as Record<string, string | null | undefined>)[k] || null]),
  );
  const base = {
    idempotency_key: p.idempotencyKey,
    is_test: isTestLead(p),
    first_name: p.firstName,
    last_name: p.lastName,
    email: p.email,
    email_normalized: normalizeEmail(p.email),
    phone_raw: p.phone,
    phone_e164: phone.e164,
    phone_valid: phone.valid,
    phone_extension: phone.extension,
    reachability: p.reachability,
    address_unknown: p.addressUnknown,
    street: known ? p.street : null,
    house_number: known && p.houseNumber ? p.houseNumber : null,
    postal_code: known ? p.postalCode : null,
    city: known ? p.city : null,
    plot_note: p.plotNote || null,
    address_key: buildAddressKey({ street: p.street, houseNumber: p.houseNumber, postalCode: p.postalCode, addressUnknown: p.addressUnknown }),
    project_type: p.projectType,
    privacy_notice_version: PRIVACY_NOTICE_VERSION,
    ...attribution,
    device_type: deviceType(o.userAgent),
  };

  if (o.spam) {
    return {
      ...base, spam_suspected: true, spam_reason: o.spam, status: 'nicht_qualifiziert', disqualify_reason: 'spam',
      email_status: 'skipped', email_skip_reason: 'spam', enrichment_status: 'skipped',
    };
  }

  const d = o.decision;
  return {
    ...base,
    spam_suspected: false,
    status: d.assignedTo ? 'in_bearbeitung' : 'neu',
    duplicate_of: d.duplicateOf,
    duplicate_reason: d.duplicateOf ? d.duplicateReason : null,
    related_lead_id: d.relatedLeadId,
    assigned_to: d.assignedTo,
    assigned_at: d.assignedTo ? o.now.toISOString() : null,
    email_status: 'pending',
    enrichment_status: 'pending',
  };
}

export async function createLead(body: unknown, ctx: CreateLeadContext): Promise<CreateLeadResult> {
  const parsed = leadPayloadSchema.safeParse(body);
  if (!parsed.success) return { kind: 'invalid', errors: fieldErrors(parsed.error) };
  const p = parsed.data;
  const spam = spamReason(p);

  try {
    const db = ctx.getDb();
    const existing = await db.from('leads').select('id').eq('idempotency_key', p.idempotencyKey).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return { kind: 'replay', id: existing.data.id as string };

    const keys = dedupeKeysFromPayload(p);
    const decision = spam ? NO_DUPLICATE : decideDuplicate(keys, await findMatches(db, keys, isTestLead(p)), ctx.now);
    const row = buildLeadInsert(p, { now: ctx.now, userAgent: ctx.userAgent, spam, decision });

    const inserted = await db.from('leads').insert(row).select('id').single();
    if (inserted.error) {
      if (inserted.error.code === '23505') {
        const again = await db.from('leads').select('id').eq('idempotency_key', p.idempotencyKey).single();
        if (!again.error && again.data) return { kind: 'replay', id: again.data.id as string };
      }
      throw inserted.error;
    }
    return { kind: 'created', id: inserted.data.id as string, runSideEffects: !spam };
  } catch (err) {
    // Log code + message only: Postgres `details` can contain the failing row (PII).
    console.error('createLead: database failure', errInfo(err));
    if (isDataError(err)) {
      return { kind: 'invalid', errors: { form: 'Ihre Angaben konnten nicht gespeichert werden. Bitte prüfen Sie Ihre Eingaben.' } };
    }
    if (spam) return { kind: 'fallback' };
    // sendFallbackMail catches all errors internally and resolves to boolean.
    const delivered = await ctx.sendFallback(p);
    return delivered ? { kind: 'fallback' } : { kind: 'unavailable' };
  }
}
