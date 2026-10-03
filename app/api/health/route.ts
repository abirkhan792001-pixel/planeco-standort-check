import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildBacklog, maintenanceCutoffs } from '@/lib/maintenance/windows';

export const dynamic = 'force-dynamic';

/**
 * Liveness + backlog. `ok` means the database answered; the backlog counts (never lead data) make a missed or
 * failing daily job visible: failed jobs, stale mail claims, and leads still pending after 24 h.
 */
export async function GET() {
  try {
    const db = createAdminClient();
    const cutoffs = maintenanceCutoffs(new Date());
    const head = { count: 'exact', head: true } as const;
    const [emailFailed, emailStaleSending, enrichmentFailed, pendingOld] = await Promise.all([
      db.from('leads').select('id', head).eq('email_status', 'failed'),
      db.from('leads').select('id', head).eq('email_status', 'sending').lt('email_claimed_at', cutoffs.staleClaimBefore),
      db.from('leads').select('id', head).eq('enrichment_status', 'failed'),
      db.from('leads').select('id', head).lt('created_at', cutoffs.pendingBefore).or('email_status.eq.pending,enrichment_status.eq.pending'),
    ]);
    for (const r of [emailFailed, emailStaleSending, enrichmentFailed, pendingOld]) if (r.error) throw r.error;
    return NextResponse.json({
      ok: true,
      backlog: buildBacklog({
        emailFailed: emailFailed.count,
        emailStaleSending: emailStaleSending.count,
        enrichmentFailed: enrichmentFailed.count,
        pendingOlderThan24h: pendingOld.count,
      }),
    });
  } catch (err) {
    console.error('health check failed', err);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
