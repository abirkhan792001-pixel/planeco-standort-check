import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/leads/events';
import { processConfirmation, processEnrichment } from '@/lib/leads/side-effects';
import { MAX_EMAIL_ATTEMPTS, MAX_ENRICHMENT_ATTEMPTS } from '@/lib/config/app';
import {
  EMAIL_EXPIRY_PATCH, buildSummary, canStartEnrichment, emailRetryFilter, hasTimeBudget, maintenanceCutoffs, summaryStatus,
} from '@/lib/maintenance/windows';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Keep in sync with FUNCTION_LIMIT_MS in lib/maintenance/windows.ts (segment config must be a literal).
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
  // Every failed query or crashed job is counted: the run still does what it can, then answers 500 so Vercel flags it.
  let errors = 0;
  const queryFailed = (what: string, error: { code?: string; message: string }) => { errors++; logQueryError(what, error); };

  // 1) Keep-alive: a real query keeps the Supabase free project from pausing.
  const { count, error } = await db.from('leads').select('id', { count: 'exact', head: true });
  if (error) {
    logQueryError('maintenance keep-alive failed', error);
    return NextResponse.json({ error: 'db' }, { status: 500 });
  }

  // 2) Confirmations older than EMAIL_MAX_AGE_HOURS are closed, not sent (spec E-4: after 24 h skipped / too_late).
  // That includes failed mails and stale 'sending' claims; email_last_error stays as it is. One event per lead.
  const expired = await db.from('leads').update(EMAIL_EXPIRY_PATCH)
    .or(emailRetryFilter(cutoffs.staleClaimBefore)).lt('created_at', cutoffs.emailSince).select('id');
  if (expired.error) queryFailed('maintenance expire failed', expired.error);
  const expiredIds = (expired.data ?? []).map((r) => r.id as string);
  await Promise.all(expiredIds.map((id) => logEvent(db, id, 'email_skipped', { reason: 'too_late' })));

  // 3) Retry confirmations (pending, failed, or a stale 'sending' claim).
  // processConfirmation enforces the attempt cap and claims atomically; the cron never bypasses it.
  const { data: mails, error: mailsError } = await db.from('leads').select('id').or(emailRetryFilter(cutoffs.staleClaimBefore))
    .lt('email_attempts', MAX_EMAIL_ATTEMPTS).gte('created_at', cutoffs.emailSince).order('created_at').limit(20);
  if (mailsError) queryFailed('maintenance mail query failed', mailsError);
  let emailsRetried = 0;
  for (const { id } of mails ?? []) {
    if (!hasTimeBudget(startedAt, Date.now())) break; // the rest is picked up by the next run
    emailsRetried++;
    await processConfirmation(db, id as string, now).catch((e) => { errors++; console.error('retry mail', id, e); });
  }

  // 4) Retry enrichment (sequential; the Nominatim client spaces requests itself). The slowest job: it also needs headroom.
  const { data: geos, error: geosError } = await db.from('leads').select('id').in('enrichment_status', ['pending', 'failed'])
    .lt('enrichment_attempts', MAX_ENRICHMENT_ATTEMPTS).gte('created_at', cutoffs.enrichSince).order('created_at').limit(15);
  if (geosError) queryFailed('maintenance enrichment query failed', geosError);
  let enrichmentsRetried = 0;
  for (const { id } of geos ?? []) {
    if (!canStartEnrichment(startedAt, Date.now())) break;
    enrichmentsRetried++;
    await processEnrichment(db, id as string, now).catch((e) => { errors++; console.error('retry enrichment', id, e); });
  }

  const summary = buildSummary({ leads: count, emailsRetried, enrichmentsRetried, expired: expiredIds.length, errors });
  const status = summaryStatus(summary);
  (status === 200 ? console.log : console.error)('maintenance', summary);
  return NextResponse.json(summary, { status });
}
