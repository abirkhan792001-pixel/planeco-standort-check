import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

type Result = {
  data?: unknown;
  count?: number | null;
  status?: number;
  error?: { code?: string; message: string } | null;
  /** The awaited builder rejects instead of resolving. */
  throws?: Error;
};

/**
 * Chainable, awaitable stand-in for a PostgREST builder; every `from()` on `leads` consumes the next queued result,
 * every `from('lead_events')` consumes `eventQueue` (so the per-lead event inserts do not shift the lead results).
 * The first logged call of each builder is `from` with its table name.
 */
const queue: Result[] = [];
const eventQueue: Result[] = [];
const calls: { method: string; args: unknown[] }[][] = [];
function builder(table: string, result: Result) {
  const log: { method: string; args: unknown[] }[] = [{ method: 'from', args: [table] }];
  calls.push(log);
  const q: unknown = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (res: (v: Result) => unknown, rej: (e: unknown) => unknown) =>
          (result.throws ? Promise.reject(result.throws) : Promise.resolve({ error: null, ...result })).then(res, rej);
      }
      return (...args: unknown[]) => { log.push({ method: prop, args }); return q; };
    },
  });
  return q;
}
const from = vi.fn((table: string) => builder(table, (table === 'lead_events' ? eventQueue : queue).shift() ?? { error: null }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }));

type Job = (db: unknown, id: string, now: Date) => Promise<void>;
const processConfirmation = vi.fn<Job>(async () => {});
const processEnrichment = vi.fn<Job>(async () => {});
vi.mock('@/lib/leads/side-effects', () => ({
  processConfirmation: (db: unknown, id: string, now: Date) => processConfirmation(db, id, now),
  processEnrichment: (db: unknown, id: string, now: Date) => processEnrichment(db, id, now),
}));

import { GET as cron } from '@/app/api/cron/maintenance/route';
import { GET as health } from '@/app/api/health/route';
import { EMAIL_EXPIRY_PATCH, maintenanceCutoffs } from '@/lib/maintenance/windows';

const SECRET = 'test-cron-secret';
const req = (authorization?: string) =>
  new Request('http://localhost/api/cron/maintenance', { headers: authorization ? { authorization } : {} });

beforeEach(() => {
  queue.length = 0;
  eventQueue.length = 0;
  calls.length = 0;
  from.mockClear();
  processConfirmation.mockClear();
  processEnrichment.mockClear();
  vi.stubEnv('CRON_SECRET', SECRET);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const leadCalls = () => calls.filter((c) => c[0].args[0] === 'leads');
const eventCalls = () => calls.filter((c) => c[0].args[0] === 'lead_events');

describe('GET /api/cron/maintenance', () => {
  it('rejects a missing, wrong or malformed secret with 401 and touches nothing', async () => {
    for (const header of [undefined, 'Bearer nope', SECRET, `Basic ${SECRET}`]) {
      const res = await cron(req(header));
      expect(res.status).toBe(401);
    }
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects every request when CRON_SECRET is not configured, even "Bearer undefined"', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await cron(req('Bearer undefined'))).status).toBe(401);
    expect((await cron(req('Bearer '))).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it('keeps the DB alive, retries through processConfirmation/processEnrichment and returns the summary (no errors key)', async () => {
    queue.push(
      { count: 42 }, // keep-alive
      { data: [{ id: 'old-1' }, { id: 'old-2' }] }, // expired
      { data: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }] }, // mails
      { data: [{ id: 'g1' }] }, // enrichments
    );
    const res = await cron(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ leads: 42, emailsRetried: 3, enrichmentsRetried: 1, expired: 2 });
    expect(processConfirmation.mock.calls.map((c) => c[1])).toEqual(['m1', 'm2', 'm3']);
    expect(processEnrichment.mock.calls.map((c) => c[1])).toEqual(['g1']);
    // one shared clock for the run
    expect(processConfirmation.mock.calls[0][2]).toBeInstanceOf(Date);
    expect(processConfirmation.mock.calls[0][2]).toBe(processEnrichment.mock.calls[0][2]);
  });

  it('expires pending, failed and stale-sending mails older than 24 h as skipped/too_late (keeping email_last_error)', async () => {
    queue.push({ count: 1 }, { data: [] }, { data: [] }, { data: [] });
    await cron(req(`Bearer ${SECRET}`));
    const [, expire] = leadCalls();
    const update = expire.find((c) => c.method === 'update')!;
    expect(update.args[0]).toEqual(EMAIL_EXPIRY_PATCH);
    expect(update.args[0]).not.toHaveProperty('email_last_error');
    const or = expire.find((c) => c.method === 'or')!.args[0] as string;
    expect(or).toContain('email_status.in.(pending,failed)');
    expect(or).toMatch(/and\(email_status\.eq\.sending,email_claimed_at\.lt\.\d{4}-\d\d-\d\dT/);
    expect(expire.find((c) => c.method === 'lt')!.args[0]).toBe('created_at');
    expect(expire.some((c) => c.method === 'eq')).toBe(false); // not only 'pending' any more
  });

  it('uses the same 24 h cutoff for the expiry and for the retry selection', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-03T04:00:00.000Z'));
      queue.push({ count: 1 }, { data: [] }, { data: [] }, { data: [] });
      await cron(req(`Bearer ${SECRET}`));
      const [, expire, mailQuery] = leadCalls();
      const { emailSince, staleClaimBefore } = maintenanceCutoffs(new Date('2026-10-03T04:00:00.000Z'));
      expect(expire.find((c) => c.method === 'lt')!.args).toEqual(['created_at', emailSince]);
      expect(mailQuery.find((c) => c.method === 'gte')!.args).toEqual(['created_at', emailSince]);
      expect(expire.find((c) => c.method === 'or')!.args[0]).toBe(mailQuery.find((c) => c.method === 'or')!.args[0]);
      expect(expire.find((c) => c.method === 'or')!.args[0]).toContain(staleClaimBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  it('writes an email_skipped / too_late lead_event for every expired lead', async () => {
    queue.push({ count: 5 }, { data: [{ id: 'old-1' }, { id: 'old-2' }] }, { data: [] }, { data: [] });
    await cron(req(`Bearer ${SECRET}`));
    const inserts = eventCalls().map((c) => c.find((x) => x.method === 'insert')!.args[0]);
    expect(inserts).toEqual([
      { lead_id: 'old-1', type: 'email_skipped', data: { reason: 'too_late' } },
      { lead_id: 'old-2', type: 'email_skipped', data: { reason: 'too_late' } },
    ]);
  });

  it('writes no event when nothing expired', async () => {
    queue.push({ count: 5 }, { data: [] }, { data: [] }, { data: [] });
    await cron(req(`Bearer ${SECRET}`));
    expect(eventCalls()).toHaveLength(0);
  });

  it('selects pending/failed/stale-sending mails and pending/failed enrichments under the attempt caps', async () => {
    queue.push({ count: 1 }, { data: [] }, { data: [] }, { data: [] });
    await cron(req(`Bearer ${SECRET}`));
    const [, , mailQuery, geoQuery] = leadCalls();
    const or = mailQuery.find((c) => c.method === 'or')!.args[0] as string;
    expect(or).toContain('email_status.in.(pending,failed)');
    expect(or).toMatch(/and\(email_status\.eq\.sending,email_claimed_at\.lt\.\d{4}-\d\d-\d\dT/);
    expect(mailQuery.find((c) => c.method === 'lt')!.args).toEqual(['email_attempts', 3]);
    expect(geoQuery.find((c) => c.method === 'in')!.args).toEqual(['enrichment_status', ['pending', 'failed']]);
    expect(geoQuery.find((c) => c.method === 'lt')!.args).toEqual(['enrichment_attempts', 3]);
  });

  it('returns 500 and does no retries when the keep-alive query fails', async () => {
    queue.push({ error: { code: 'XX000', message: 'down' } });
    const res = await cron(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'db' });
    expect(processConfirmation).not.toHaveBeenCalled();
    expect(processEnrichment).not.toHaveBeenCalled();
  });

  describe('error status', () => {
    it('a failing expiry query counts as an error, answers 500 and still processes the retries', async () => {
      queue.push({ count: 4 }, { error: { code: '57014', message: 'timeout' } }, { data: [{ id: 'm1' }] }, { data: [{ id: 'g1' }] });
      const res = await cron(req(`Bearer ${SECRET}`));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ leads: 4, emailsRetried: 1, enrichmentsRetried: 1, expired: 0, errors: 1 });
      expect(processConfirmation).toHaveBeenCalledTimes(1);
      expect(processEnrichment).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith('maintenance expire failed', { code: '57014', message: 'timeout' });
    });

    it('counts every failing select (mails and enrichments) and reports the number', async () => {
      queue.push({ count: 4 }, { data: [] }, { error: { code: 'A', message: 'a' } }, { error: { code: 'B', message: 'b' } });
      const res = await cron(req(`Bearer ${SECRET}`));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ leads: 4, emailsRetried: 0, enrichmentsRetried: 0, expired: 0, errors: 2 });
    });

    it('a retry job that crashes counts as an error but does not stop the others', async () => {
      queue.push({ count: 3 }, { data: [] }, { data: [{ id: 'a' }, { id: 'b' }] }, { data: [{ id: 'c' }, { id: 'd' }] });
      processConfirmation.mockRejectedValueOnce(new Error('boom'));
      processEnrichment.mockRejectedValueOnce(new Error('boom'));
      const res = await cron(req(`Bearer ${SECRET}`));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ leads: 3, emailsRetried: 2, enrichmentsRetried: 2, expired: 0, errors: 2 });
      expect(processConfirmation).toHaveBeenCalledTimes(2);
      expect(processEnrichment).toHaveBeenCalledTimes(2);
    });

    it('a clean run has no errors key and answers 200', async () => {
      queue.push({ count: 3 }, { data: [] }, { data: [] }, { data: [] });
      const res = await cron(req(`Bearer ${SECRET}`));
      expect(res.status).toBe(200);
      expect(await res.json()).not.toHaveProperty('errors');
    });
  });

  describe('time budget', () => {
    function fakeClock(start = 1_000_000) {
      let clock = start;
      vi.spyOn(Date, 'now').mockImplementation(() => clock);
      return { advance: (ms: number) => { clock += ms; } };
    }

    it('stops starting new jobs once 35 s are spent (no more mails, no enrichment)', async () => {
      queue.push({ count: 9 }, { data: [] }, { data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }, { data: [{ id: 'g' }] });
      const clock = fakeClock();
      processConfirmation.mockImplementationOnce(async () => { clock.advance(35_000); }); // the first mail uses up the budget
      const body = await (await cron(req(`Bearer ${SECRET}`))).json();
      expect(body.emailsRetried).toBe(1);
      expect(body.enrichmentsRetried).toBe(0);
      expect(processConfirmation).toHaveBeenCalledTimes(1);
      expect(processEnrichment).not.toHaveBeenCalled();
    });

    it('still starts jobs just under 35 s, including the enrichment (20 s headroom to the 60 s limit)', async () => {
      queue.push({ count: 9 }, { data: [] }, { data: [{ id: 'a' }, { id: 'b' }] }, { data: [{ id: 'g' }] });
      const clock = fakeClock();
      processConfirmation.mockImplementationOnce(async () => { clock.advance(20_000); });
      processConfirmation.mockImplementationOnce(async () => { clock.advance(14_999); }); // 34.999 s elapsed
      const res = await cron(req(`Bearer ${SECRET}`));
      expect(await res.json()).toMatchObject({ emailsRetried: 2, enrichmentsRetried: 1 });
      expect(processEnrichment).toHaveBeenCalledTimes(1);
    });
  });
});

describe('GET /api/health', () => {
  const COUNTS = (...c: number[]) => c.map((count) => ({ count }));

  it('reports ok with counts only: liveness query first, then one count per backlog bucket', async () => {
    queue.push({ count: 99 }, ...COUNTS(2, 1, 4, 6, 3));
    const res = await health();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      backlog: { emailFailed: 2, emailStaleSending: 1, enrichmentFailed: 4, enrichmentGaveUp: 6, pendingOlderThan24h: 3 },
    });
    expect(JSON.stringify(body)).not.toMatch(/@|id"/);
    expect(from).toHaveBeenCalledTimes(6);
  });

  it('caches a 200 at the CDN for 30 s', async () => {
    queue.push({ count: 1 }, ...COUNTS(0, 0, 0, 0, 0));
    const res = await health();
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=30');
  });

  it('uses a bare head count on leads as the liveness query', async () => {
    queue.push({ count: 1 }, ...COUNTS(0, 0, 0, 0, 0));
    await health();
    const [live] = leadCalls();
    expect(live.map((c) => c.method)).toEqual(['from', 'select']);
    expect(live.find((c) => c.method === 'select')!.args).toEqual(['id', { count: 'exact', head: true }]);
  });

  it('queries failed, stale-sending, failed-enrichment (young), gave-up (old) and pending-older-than-24h leads', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-03T04:00:00.000Z'));
      queue.push({ count: 1 }, ...COUNTS(0, 0, 0, 0, 0));
      await health();
      const [, failed, stale, enrich, gaveUp, pending] = leadCalls();
      const { enrichSince } = maintenanceCutoffs(new Date('2026-10-03T04:00:00.000Z'));
      expect(failed.find((c) => c.method === 'eq')!.args).toEqual(['email_status', 'failed']);
      expect(stale.find((c) => c.method === 'eq')!.args).toEqual(['email_status', 'sending']);
      expect(stale.find((c) => c.method === 'lt')!.args[0]).toBe('email_claimed_at');
      expect(enrich.find((c) => c.method === 'eq')!.args).toEqual(['enrichment_status', 'failed']);
      expect(enrich.find((c) => c.method === 'gte')!.args).toEqual(['created_at', enrichSince]); // still retried
      expect(gaveUp.find((c) => c.method === 'eq')!.args).toEqual(['enrichment_status', 'failed']);
      expect(gaveUp.find((c) => c.method === 'lt')!.args).toEqual(['created_at', enrichSince]); // no longer retried
      expect(pending.find((c) => c.method === 'lt')!.args[0]).toBe('created_at');
      expect(pending.find((c) => c.method === 'or')!.args[0]).toBe('email_status.eq.pending,enrichment_status.eq.pending');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports 0 for a bucket that answered without a count', async () => {
    queue.push({ count: null }, { count: null }, { count: null }, { count: null }, { count: null }, { count: null });
    const body = await (await health()).json();
    expect(body).toEqual({
      ok: true,
      backlog: { emailFailed: 0, emailStaleSending: 0, enrichmentFailed: 0, enrichmentGaveUp: 0, pendingOlderThan24h: 0 },
    });
  });

  it('returns 503 {ok:false} with no-store when the liveness query fails, and runs no backlog counts', async () => {
    queue.push({ error: { code: '57P01', message: 'terminating' }, status: 503 });
    const res = await health();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(from).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('health liveness failed', { status: 503, code: '57P01', message: 'terminating' });
  });

  it('returns 503 when the liveness query throws', async () => {
    queue.push({ throws: new Error('socket hang up') });
    const res = await health();
    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('a failing backlog count becomes null and is logged; ok stays true and the rest is reported', async () => {
    queue.push(
      { count: 1 }, // liveness
      { count: 2 },
      { count: 1 },
      { error: { code: '57014', message: 'canceling statement due to statement timeout' }, status: 500 }, // enrichmentFailed
      { count: 6 },
      { count: 3 },
    );
    const res = await health();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=30');
    expect(await res.json()).toEqual({
      ok: true,
      backlog: { emailFailed: 2, emailStaleSending: 1, enrichmentFailed: null, enrichmentGaveUp: 6, pendingOlderThan24h: 3 },
    });
    expect(console.error).toHaveBeenCalledWith('health backlog count failed', {
      count: 'enrichmentFailed', status: 500, code: '57014', message: 'canceling statement due to statement timeout',
    });
  });

  it('stays 200 ok:true with every count null when all five backlog queries fail or throw', async () => {
    const err = { error: { code: 'X', message: 'x' } };
    queue.push({ count: 1 }, err, err, err, { throws: new Error('network') }, err);
    const res = await health();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      backlog: { emailFailed: null, emailStaleSending: null, enrichmentFailed: null, enrichmentGaveUp: null, pendingOlderThan24h: null },
    });
  });
});
