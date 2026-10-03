import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processConfirmation, processEnrichment } from '@/lib/leads/side-effects';
import { MAX_EMAIL_ATTEMPTS, MAX_ENRICHMENT_ATTEMPTS } from '@/lib/config/app';
import { buildSummary, emailRetryFilter, hasTimeBudget, maintenanceCutoffs } from '@/lib/maintenance/windows';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function logQueryError(what: string, error: { code?: string; message: string }) {
  console.error(what, { code: error.code, message: error.message }); // codes/messages only, no lead data
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const startedAt = Date.now();
  const db = createAdminClient();
  const now = new Date();
  const cutoffs = maintenanceCutoffs(now);

  // 1) Keep-alive: a real query keeps the Supabase free project from pausing.
  const { count, error } = await db.from('leads').select('id', { count: 'exact', head: true });
  if (error) {
    logQueryError('maintenance keep-alive failed', error);
    return NextResponse.json({ error: 'db' }, { status: 500 });
  }

  // 2) Pending confirmations that are too old to be useful are closed, not sent.
  const expired = await db.from('leads').update({ email_status: 'skipped', email_skip_reason: 'too_late' })
    .eq('email_status', 'pending').lt('created_at', cutoffs.emailSince).select('id');
  if (expired.error) logQueryError('maintenance expire failed', expired.error);

  // 3) Retry confirmations (pending, failed, or a stale 'sending' claim).
  // processConfirmation enforces the attempt cap and claims atomically; the cron never bypasses it.
  const { data: mails, error: mailsError } = await db.from('leads').select('id').or(emailRetryFilter(cutoffs.staleClaimBefore))
    .lt('email_attempts', MAX_EMAIL_ATTEMPTS).gte('created_at', cutoffs.emailSince).order('created_at').limit(20);
  if (mailsError) logQueryError('maintenance mail query failed', mailsError);
  let emailsRetried = 0;
  for (const { id } of mails ?? []) {
    if (!hasTimeBudget(startedAt, Date.now())) break; // the rest is picked up by the next run
    emailsRetried++;
    await processConfirmation(db, id as string, now).catch((e) => console.error('retry mail', id, e));
  }

  // 4) Retry enrichment (sequential; the Nominatim client spaces requests itself).
  const { data: geos, error: geosError } = await db.from('leads').select('id').in('enrichment_status', ['pending', 'failed'])
    .lt('enrichment_attempts', MAX_ENRICHMENT_ATTEMPTS).gte('created_at', cutoffs.enrichSince).order('created_at').limit(15);
  if (geosError) logQueryError('maintenance enrichment query failed', geosError);
  let enrichmentsRetried = 0;
  for (const { id } of geos ?? []) {
    if (!hasTimeBudget(startedAt, Date.now())) break;
    enrichmentsRetried++;
    await processEnrichment(db, id as string, now).catch((e) => console.error('retry enrichment', id, e));
  }

  const summary = buildSummary({ leads: count, emailsRetried, enrichmentsRetried, expired: expired.data?.length });
  console.log('maintenance', summary);
  return NextResponse.json(summary);
}
