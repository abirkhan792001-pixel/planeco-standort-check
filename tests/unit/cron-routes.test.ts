import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

type Result = { data?: unknown; count?: number | null; error?: { code?: string; message: string } | null };

/** Chainable, awaitable stand-in for a PostgREST builder; every `from()` consumes the next queued result. */
const queue: Result[] = [];
const calls: { method: string; args: unknown[] }[][] = [];
function builder(result: Result) {
  const log: { method: string; args: unknown[] }[] = [];
  calls.push(log);
  const q: unknown = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') return (res: (v: Result) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ error: null, ...result }).then(res, rej);
      return (...args: unknown[]) => { log.push({ method: prop, args }); return q; };
    },
  });
  return q;
}
const from = vi.fn(() => builder(queue.shift() ?? { error: null }));
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

const SECRET = 'test-cron-secret';
const req = (authorization?: string) =>
  new Request('http://localhost/api/cron/maintenance', { headers: authorization ? { authorization } : {} });

beforeEach(() => {
  queue.length = 0;
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

  it('keeps the DB alive, retries through processConfirmation/processEnrichment and returns the summary', async () => {
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

  it('closes old pending mails as too_late, and selects pending/failed/stale-sending under the attempt cap', async () => {
    queue.push({ count: 1 }, { data: [] }, { data: [] }, { data: [] });
    await cron(req(`Bearer ${SECRET}`));
    const [, expire, mailQuery, geoQuery] = calls;
    expect(expire.find((c) => c.method === 'update')!.args[0]).toEqual({ email_status: 'skipped', email_skip_reason: 'too_late' });
    expect(expire.find((c) => c.method === 'eq')!.args).toEqual(['email_status', 'pending']);
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

  it('one crashing retry does not stop the others', async () => {
    queue.push({ count: 3 }, { data: [] }, { data: [{ id: 'a' }, { id: 'b' }] }, { data: [{ id: 'c' }, { id: 'd' }] });
    processConfirmation.mockRejectedValueOnce(new Error('boom'));
    processEnrichment.mockRejectedValueOnce(new Error('boom'));
    const res = await cron(req(`Bearer ${SECRET}`));
    expect(await res.json()).toEqual({ leads: 3, emailsRetried: 2, enrichmentsRetried: 2, expired: 0 });
    expect(processConfirmation).toHaveBeenCalledTimes(2);
    expect(processEnrichment).toHaveBeenCalledTimes(2);
  });

  it('stops starting new retries once the time budget is spent', async () => {
    queue.push({ count: 9 }, { data: [] }, { data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }, { data: [{ id: 'g' }] });
    let clock = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    processConfirmation.mockImplementationOnce(async () => { clock += 51_000; }); // the first mail uses up the budget
    const res = await cron(req(`Bearer ${SECRET}`));
    const body = await res.json();
    expect(body.emailsRetried).toBe(1);
    expect(body.enrichmentsRetried).toBe(0);
    expect(processConfirmation).toHaveBeenCalledTimes(1);
    expect(processEnrichment).not.toHaveBeenCalled();
  });
});

describe('GET /api/health', () => {
  it('reports ok with counts only, one count per backlog bucket', async () => {
    queue.push({ count: 2 }, { count: 1 }, { count: 4 }, { count: 3 });
    const res = await health();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, backlog: { emailFailed: 2, emailStaleSending: 1, enrichmentFailed: 4, pendingOlderThan24h: 3 } });
    expect(JSON.stringify(body)).not.toMatch(/@|id"/);
  });

  it('queries failed, stale-sending, failed-enrichment and pending-older-than-24h leads', async () => {
    queue.push({ count: 0 }, { count: 0 }, { count: 0 }, { count: 0 });
    await health();
    const [failed, stale, enrich, pending] = calls;
    expect(failed.find((c) => c.method === 'eq')!.args).toEqual(['email_status', 'failed']);
    expect(stale.find((c) => c.method === 'eq')!.args).toEqual(['email_status', 'sending']);
    expect(stale.find((c) => c.method === 'lt')!.args[0]).toBe('email_claimed_at');
    expect(enrich.find((c) => c.method === 'eq')!.args).toEqual(['enrichment_status', 'failed']);
    expect(pending.find((c) => c.method === 'lt')!.args[0]).toBe('created_at');
    expect(pending.find((c) => c.method === 'or')!.args[0]).toBe('email_status.eq.pending,enrichment_status.eq.pending');
  });

  it('stays ok:true with zero backlog when counts come back null', async () => {
    queue.push({ count: null }, { count: null }, { count: null }, { count: null });
    const body = await (await health()).json();
    expect(body).toEqual({ ok: true, backlog: { emailFailed: 0, emailStaleSending: 0, enrichmentFailed: 0, pendingOlderThan24h: 0 } });
  });

  it('returns 503 {ok:false} when any query fails', async () => {
    queue.push({ count: 0 }, { count: 0 }, { error: { code: '57P01', message: 'terminating' } }, { count: 0 });
    const res = await health();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });
});
