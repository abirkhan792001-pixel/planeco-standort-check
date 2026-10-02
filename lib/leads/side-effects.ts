import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emailDomain, isReservedEmailDomain } from '@/lib/config/app';
import { renderConfirmation, shouldSendConfirmation } from '@/lib/email/confirmation';
import { hasMx } from '@/lib/email/mx';
import { sendTransactional } from '@/lib/email/brevo';
import { createAdminClient } from '@/lib/supabase/admin';
import { logEvent } from './events';
import type { LeadRow } from './types';

async function loadLead(db: SupabaseClient, id: string): Promise<LeadRow> {
  const { data, error } = await db.from('leads').select('*').eq('id', id).single();
  if (error) throw error;
  return data as LeadRow;
}

export async function processConfirmation(db: SupabaseClient, id: string, now: Date): Promise<void> {
  const lead = await loadLead(db, id);
  if (lead.email_status === 'done' || lead.email_status === 'skipped') return;

  const mx = isReservedEmailDomain(lead.email_normalized) ? 'yes' : await hasMx(emailDomain(lead.email_normalized));
  const since = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const { count, error: countError } = await db.from('leads').select('id', { count: 'exact', head: true })
    .eq('email_normalized', lead.email_normalized).eq('email_status', 'done').gte('email_sent_at', since).neq('id', id);
  if (countError) throw countError;

  const decision = shouldSendConfirmation(lead, { mx, sentToSameAddressLast24h: (count ?? 0) > 0, now });
  const attempts = lead.email_attempts + 1;

  if (!decision.send) {
    if (decision.retryable) {
      await db.from('leads').update({ email_status: 'failed', email_attempts: attempts, email_last_error: decision.reason }).eq('id', id);
      await logEvent(db, id, 'email_failed', { reason: decision.reason, attempts });
    } else {
      await db.from('leads').update({ email_status: 'skipped', email_skip_reason: decision.reason }).eq('id', id);
      await logEvent(db, id, 'email_skipped', { reason: decision.reason });
    }
    return;
  }

  try {
    const mail = renderConfirmation(lead);
    const { messageId } = await sendTransactional({
      to: { email: lead.email, name: `${lead.first_name} ${lead.last_name}` }, ...mail, tags: ['standort-check'],
    });
    await db.from('leads').update({ email_status: 'done', email_attempts: attempts, email_sent_at: new Date().toISOString(), email_last_error: null }).eq('id', id);
    await logEvent(db, id, 'email_sent', { messageId });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 500) : 'unknown';
    await db.from('leads').update({ email_status: 'failed', email_attempts: attempts, email_last_error: message }).eq('id', id);
    await logEvent(db, id, 'email_failed', { error: message, attempts });
  }
}

/** Runs after the HTTP response. Each step is independent: a failing email must not block enrichment. */
export async function runSideEffects(id: string): Promise<void> {
  const db = createAdminClient();
  try {
    await processConfirmation(db, id, new Date());
  } catch (err) {
    console.error('confirmation step crashed', id, err);
  }
}
