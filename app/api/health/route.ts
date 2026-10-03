import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildBacklog, countOrNull, maintenanceCutoffs } from '@/lib/maintenance/windows';

export const dynamic = 'force-dynamic';

const head = { count: 'exact', head: true } as const;
/** The endpoint is public and polled by the keep-alive workflow: let the CDN absorb bursts. */
const OK_HEADERS = { 'Cache-Control': 'public, s-maxage=30' };
const DOWN_HEADERS = { 'Cache-Control': 'no-store' };

type CountResult = { count: number | null; status?: number; error: { code?: string; message: string } | null };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** One backlog count. Never throws: a failing count is `null` (and logged) and must not flip `ok`. */
async function backlogCount(name: string, query: PromiseLike<CountResult>): Promise<number | null> {
  try {
    const r = await query;
    if (r.error) console.error('health backlog count failed', { count: name, status: r.status, code: r.error.code, message: r.error.message });
    return countOrNull(r);
  } catch (err) {
    console.error('health backlog count failed', { count: name, message: errorMessage(err) });
    return null;
  }
}

function down() {
  return NextResponse.json({ ok: false }, { status: 503, headers: DOWN_HEADERS });
}

/**
 * Liveness + backlog. `ok` means the database answered one cheap query; only that query failing gives 503.
 * The backlog counts (never lead data) make a missed or failing daily job visible: failed jobs, stale mail claims,
 * and leads still pending after 24 h. Each count is independent: one that fails is `null`, the rest are still reported.
 */
export async function GET() {
  let db: ReturnType<typeof createAdminClient>;
  try {
    db = createAdminClient();
    const live = await db.from('leads').select('id', head);
    if (live.error) {
      console.error('health liveness failed', { status: live.status, code: live.error.code, message: live.error.message });
      return down();
    }
  } catch (err) {
    console.error('health liveness failed', { message: errorMessage(err) });
    return down();
  }

  const cutoffs = maintenanceCutoffs(new Date());
  const [emailFailed, emailStaleSending, enrichmentFailed, enrichmentGaveUp, pendingOlderThan24h] = await Promise.all([
    backlogCount('emailFailed', db.from('leads').select('id', head).eq('email_status', 'failed')),
    backlogCount('emailStaleSending', db.from('leads').select('id', head).eq('email_status', 'sending').lt('email_claimed_at', cutoffs.staleClaimBefore)),
    // Younger than ENRICHMENT_MAX_AGE_DAYS: the daily job still retries these.
    backlogCount('enrichmentFailed', db.from('leads').select('id', head).eq('enrichment_status', 'failed').gte('created_at', cutoffs.enrichSince)),
    // Older: no longer retried, reported separately.
    backlogCount('enrichmentGaveUp', db.from('leads').select('id', head).eq('enrichment_status', 'failed').lt('created_at', cutoffs.enrichSince)),
    backlogCount('pendingOlderThan24h', db.from('leads').select('id', head).lt('created_at', cutoffs.pendingBefore).or('email_status.eq.pending,enrichment_status.eq.pending')),
  ]);
  return NextResponse.json(
    { ok: true, backlog: buildBacklog({ emailFailed, emailStaleSending, enrichmentFailed, enrichmentGaveUp, pendingOlderThan24h }) },
    { headers: OK_HEADERS },
  );
}
