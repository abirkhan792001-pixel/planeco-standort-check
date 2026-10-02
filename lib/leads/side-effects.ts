import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emailDomain, isReservedEmailDomain } from '@/lib/config/app';
import { canAttemptEmail, renderConfirmation, shouldSendConfirmation } from '@/lib/email/confirmation';
import { hasMx } from '@/lib/email/mx';
import { sendTransactional } from '@/lib/email/brevo';
import { isPermanentBrevoError, sanitizeDisplayName, type BrevoError } from '@/lib/email/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { logEvent } from './events';
import type { LeadRow } from './types';

async function loadLead(db: SupabaseClient, id: string): Promise<LeadRow> {
  const { data, error } = await db.from('leads').select('*').eq('id', id).single();
  if (error) throw error;
  return data as LeadRow;
}

function logDbError(what: string, id: string, error: { code?: string; message: string }) {
  console.error(what, id, { code: error.code, message: error.message });
}

export async function processConfirmation(db: SupabaseClient, id: string, now: Date): Promise<void> {
  const lead = await loadLead(db, id);
  if (lead.email_status === 'done' || lead.email_status === 'skipped') return;
  if (!canAttemptEmail(lead)) return;

  // Atomic claim: email_attempts is an optimistic lock, so only one worker proceeds.
  const attempts = lead.email_attempts + 1;
  const { data: claimed, error: claimError } = await db.from('leads').update({ email_attempts: attempts })
    .eq('id', id).eq('email_attempts', lead.email_attempts).in('email_status', ['pending', 'failed']).select('id');
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

/** Runs after the HTTP response. Each step is independent: a failing email must not block enrichment. */
export async function runSideEffects(id: string): Promise<void> {
  try {
    const db = createAdminClient();
    try {
      await processConfirmation(db, id, new Date());
    } catch (err) {
      console.error('confirmation step crashed', id, err);
    }
  } catch (err) {
    console.error('side effects setup failed', id, err);
  }
}
