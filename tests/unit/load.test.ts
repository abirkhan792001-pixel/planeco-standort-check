import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { makeLeadRow } from '../fixtures/lead-row';

vi.mock('server-only', () => ({}));

import { LEAD_WINDOW, LIST_COLUMNS, loadLeadWindow } from '@/lib/dashboard/load';

/** PostgREST answers at most this many rows per request, whatever `limit`/`range` asks for (Supabase default max-rows). */
const API_CAP = 1000;

type Call = { select: string; range?: [number, number]; limit?: number; in?: string[]; orderBy: string[] };

/** Fake client over a newest-first table that enforces the API row cap like PostgREST does. */
function fakeClient(table: { id: string; duplicate_of?: string | null }[], opts: { fail?: (call: Call) => boolean; insertedAfterFirstPage?: boolean } = {}) {
  const calls: Call[] = [];
  const client = {
    from: () => ({
      select: (columns: string) => {
        const call: Call = { select: columns, orderBy: [] };
        calls.push(call);
        const builder = {
          order: (column: string) => { call.orderBy.push(column); return builder; },
          range: (from: number, to: number) => { call.range = [from, to]; return builder; },
          limit: (n: number) => { call.limit = n; return builder; },
          in: (_column: string, ids: string[]) => { call.in = ids; return builder; },
          then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
            if (opts.fail?.(call)) return Promise.resolve({ data: null, error: { code: 'XX000', message: 'boom' } }).then(resolve, reject);
            let data = table;
            if (call.in) data = table.filter((r) => call.in!.includes(r.id));
            else if (call.range) {
              // A lead inserted after page 1 was read pushes every later row one position down.
              const shift = opts.insertedAfterFirstPage && call.range[0] > 0 ? 1 : 0;
              const from = call.range[0] - shift;
              data = table.slice(from, Math.min(call.range[1] - shift, from + API_CAP - 1) + 1);
            } else data = table.slice(0, Math.min(call.limit ?? API_CAP, API_CAP));
            return Promise.resolve({ data: data.map((r) => makeLeadRow({ duplicate_of: null, ...r })), error: null }).then(resolve, reject);
          },
        };
        return builder;
      },
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const table = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id-${String(i).padStart(5, '0')}`, duplicate_of: null as string | null }));

describe('loadLeadWindow paging (PostgREST caps a response at 1000 rows)', () => {
  it('collects 1000 + 1000 + 312 = 2312 rows when the limit is larger than the table', async () => {
    const { client, calls } = fakeClient(table(2312));
    const { rows, truncated } = await loadLeadWindow(client, 5000);
    expect(rows).toHaveLength(2312);
    expect(truncated).toBe(false);
    expect(rows.map((r) => r.id)).toEqual(table(2312).map((r) => r.id)); // newest first, no gaps, no repeats
    expect(calls.map((c) => c.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('stops at the limit and reports truncated when more rows exist', async () => {
    const { client } = fakeClient(table(2312));
    const { rows, truncated } = await loadLeadWindow(client, 1500);
    expect(rows).toHaveLength(1500);
    expect(rows[1499].id).toBe('id-01499');
    expect(truncated).toBe(true);
  });

  it('is not truncated when the table holds exactly `limit` rows', async () => {
    const { client } = fakeClient(table(2312));
    const { rows, truncated } = await loadLeadWindow(client, 2312);
    expect(rows).toHaveLength(2312);
    expect(truncated).toBe(false);
  });

  it('the default dashboard window is 1000 rows: exactly 1000 is complete, 1200 is truncated', async () => {
    expect(LEAD_WINDOW).toBe(1000);
    const exact = await loadLeadWindow(fakeClient(table(1000)).client);
    expect(exact.rows).toHaveLength(1000);
    expect(exact.truncated).toBe(false);
    const more = await loadLeadWindow(fakeClient(table(1200)).client);
    expect(more.rows).toHaveLength(1000);
    expect(more.truncated).toBe(true);
  });

  it('orders by created_at and then id so pages never overlap on equal timestamps', async () => {
    const { client, calls } = fakeClient(table(10));
    await loadLeadWindow(client, 5);
    expect(calls[0].orderBy).toEqual(['created_at', 'id']);
  });

  it('drops the repeated row when a lead was inserted between two page requests', async () => {
    const { client } = fakeClient(table(1500), { insertedAfterFirstPage: true });
    const { rows } = await loadLeadWindow(client, 5000);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(rows).toHaveLength(1500);
  });

  it('appends the roots of duplicates that are older than the window', async () => {
    const all = table(300);
    all[5].duplicate_of = 'id-00250';
    const { client, calls } = fakeClient(all);
    const { rows, truncated } = await loadLeadWindow(client, 100);
    expect(truncated).toBe(true);
    expect(rows).toHaveLength(101);
    expect(rows[100].id).toBe('id-00250');
    expect(calls.at(-1)?.in).toEqual(['id-00250']);
  });

  it('throws when a page fails', async () => {
    const { client } = fakeClient(table(2312), { fail: (c) => c.range?.[0] === 1000 });
    await expect(loadLeadWindow(client, 5000)).rejects.toMatchObject({ code: 'XX000' });
  });
});

describe('explicit column list', () => {
  it('selects named columns (no *) and leaves out geo_raw but keeps geo_candidates', async () => {
    const { client, calls } = fakeClient(table(5));
    await loadLeadWindow(client, 5);
    for (const c of calls) {
      expect(c.select).not.toContain('*');
      expect(c.select).toBe(LIST_COLUMNS);
    }
    const cols = LIST_COLUMNS.split(',');
    expect(cols).not.toContain('geo_raw');
    expect(cols).toContain('geo_candidates');
  });

  it('covers every LeadRow column except geo_raw', () => {
    const wanted = Object.keys(makeLeadRow()).filter((k) => k !== 'geo_raw').sort();
    expect(LIST_COLUMNS.split(',').sort()).toEqual(wanted);
  });
});
