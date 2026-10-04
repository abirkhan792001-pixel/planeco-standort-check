import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decideDuplicate, findMatches, NO_DUPLICATE, type MatchRow } from '@/lib/leads/dedupe';
import { buildLeadInsert, createLead, isTestLead } from '@/lib/leads/create';
import { leadPayloadSchema } from '@/lib/leads/schema';
import { makeFakeDb, payload, ROOT_ID, seedRow } from '../fixtures/edge-cases';

const now = new Date('2026-10-01T08:00:00Z');
const fakeCtx = (db: ReturnType<typeof makeFakeDb>) => ({
  now, userAgent: null, getDb: () => db as unknown as SupabaseClient, sendFallback: async () => false,
});
const keys = { email_normalized: 't@example.com', phone_e164: '+4940123456', address_key: 'hauptstrasse|14|01067' };
const row = (o: Partial<MatchRow>): MatchRow => ({
  id: 'r1', duplicate_of: null, status: 'neu', assigned_to: null, created_at: '2026-09-30T08:00:00Z',
  email_normalized: 'other@example.com', phone_e164: null, address_key: null, ...o,
});

describe('decideDuplicate', () => {
  it('no matches → not a duplicate', () => expect(decideDuplicate(keys, [], now)).toEqual(NO_DUPLICATE));

  it('sample #4: same phone + address as #1 → duplicate with reasons and inherited owner', () => {
    const d = decideDuplicate(keys, [row({ phone_e164: '+4940123456', address_key: 'hauptstrasse|14|01067', assigned_to: 'userA' })], now);
    expect(d).toEqual({ duplicateOf: 'r1', duplicateReason: ['phone', 'address'], relatedLeadId: null, assignedTo: 'userA' });
  });

  it('links to the root, never to another duplicate', () => {
    const d = decideDuplicate(keys, [
      row({ id: 'root', created_at: '2026-09-20T08:00:00Z' }),
      row({ id: 'dup', duplicate_of: 'root', email_normalized: 't@example.com' }),
    ], now);
    expect(d.duplicateOf).toBe('root');
    expect(d.duplicateReason).toEqual(['email']);
  });

  it('older than 90 days → related, not duplicate', () => {
    const d = decideDuplicate(keys, [row({ email_normalized: 't@example.com', created_at: '2026-06-01T08:00:00Z' })], now);
    expect(d).toEqual({ ...NO_DUPLICATE, relatedLeadId: 'r1' });
  });

  it('closed root (verloren) → related, so the returning person is worked again', () => {
    const d = decideDuplicate(keys, [row({ email_normalized: 't@example.com', status: 'verloren' })], now);
    expect(d.duplicateOf).toBeNull();
    expect(d.relatedLeadId).toBe('r1');
  });

  it('picks the earliest root when several people share keys', () => {
    const d = decideDuplicate(keys, [
      row({ id: 'late', created_at: '2026-09-29T08:00:00Z', email_normalized: 't@example.com' }),
      row({ id: 'early', created_at: '2026-09-10T08:00:00Z', phone_e164: '+4940123456' }),
    ], now);
    expect(d.duplicateOf).toBe('early');
    expect(d.duplicateReason).toEqual(['phone']);
  });
});

describe('decideDuplicate — earliest ELIGIBLE root (third submission)', () => {
  it('closed root A, newer open root B (related to A), C matches both → duplicate of B with B\'s reasons and owner', () => {
    const d = decideDuplicate(keys, [
      row({ id: 'A', created_at: '2026-09-01T08:00:00Z', status: 'verloren', email_normalized: 't@example.com', phone_e164: '+4940123456' }),
      row({ id: 'B', created_at: '2026-09-20T08:00:00Z', status: 'in_bearbeitung', assigned_to: 'userB', email_normalized: 't@example.com' }),
    ], now);
    expect(d).toEqual({ duplicateOf: 'B', duplicateReason: ['email'], relatedLeadId: null, assignedTo: 'userB' });
  });

  it('root A older than 90 days + open root B → duplicate of B', () => {
    const d = decideDuplicate(keys, [
      row({ id: 'A', created_at: '2026-06-01T08:00:00Z', email_normalized: 't@example.com' }),
      row({ id: 'B', created_at: '2026-09-20T08:00:00Z', email_normalized: 't@example.com' }),
    ], now);
    expect(d).toEqual({ duplicateOf: 'B', duplicateReason: ['email'], relatedLeadId: null, assignedTo: null });
  });

  it('skips an ineligible earliest root even when the eligible root is reached via one of its duplicates', () => {
    const d = decideDuplicate(keys, [
      row({ id: 'A', created_at: '2026-09-01T08:00:00Z', status: 'gewonnen', email_normalized: 't@example.com' }),
      row({ id: 'B', created_at: '2026-09-20T08:00:00Z' }),
      row({ id: 'B-dup', duplicate_of: 'B', created_at: '2026-09-25T08:00:00Z', address_key: 'hauptstrasse|14|01067' }),
    ], now);
    expect(d).toMatchObject({ duplicateOf: 'B', duplicateReason: ['address'], relatedLeadId: null });
  });

  it('no eligible root → related to the EARLIEST root', () => {
    const d = decideDuplicate(keys, [
      row({ id: 'B', created_at: '2026-09-20T08:00:00Z', status: 'nicht_qualifiziert', email_normalized: 't@example.com' }),
      row({ id: 'A', created_at: '2026-05-01T08:00:00Z', email_normalized: 't@example.com' }),
    ], now);
    expect(d).toEqual({ ...NO_DUPLICATE, relatedLeadId: 'A' });
  });
});

type Call = { method: string; args: unknown[] };

/** Records every builder call; each awaited query returns the next queued rows. */
function recordingDb(results: MatchRow[][]) {
  const chains: Call[][] = [];
  const from = (table: string) => {
    const chain: Call[] = [{ method: 'from', args: [table] }];
    chains.push(chain);
    const data = results.shift() ?? [];
    const q: unknown = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') return (ok: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok);
        return (...args: unknown[]) => { chain.push({ method: prop, args }); return q; };
      },
    });
    return q;
  };
  return { chains, db: { from } as unknown as SupabaseClient };
}

describe('findMatches — test and real leads never link', () => {
  for (const isTest of [true, false]) {
    it(`filters is_test = ${isTest} on all three key queries and the missing-roots query`, async () => {
      const { chains, db } = recordingDb([
        [row({ id: 'dup', duplicate_of: 'root-elsewhere', email_normalized: 't@example.com' })], // email
        [], // phone
        [], // address
        [row({ id: 'root-elsewhere', created_at: '2026-09-01T08:00:00Z' })], // missing roots
      ]);
      const found = await findMatches(db, keys, isTest);
      expect(found.map((m) => m.id).sort()).toEqual(['dup', 'root-elsewhere']);
      expect(chains).toHaveLength(4);
      for (const chain of chains) {
        expect(chain, JSON.stringify(chain)).toContainEqual({ method: 'eq', args: ['is_test', isTest] });
      }
      expect(chains[3]).toContainEqual({ method: 'in', args: ['id', ['root-elsewhere']] });
    });
  }

  it('end to end: a real lead with the same phone as a test lead is not linked, and vice versa', async () => {
    const testRoot = seedRow({ is_test: true, phone_e164: '+4940123456', email_normalized: 'seed@example.com' });
    const realDb = makeFakeDb([testRoot]);
    const real = await createLead(payload({ email: 'echt@gmx.de', isTest: false }), fakeCtx(realDb));
    expect(real.kind).toBe('created');
    expect(realDb.rows[1]).toMatchObject({ is_test: false, duplicate_of: null, related_lead_id: null });

    const realRoot = seedRow({ is_test: false, phone_e164: '+4940123456', email_normalized: 'echt@gmx.de' });
    const testDb = makeFakeDb([realRoot]);
    await createLead(payload({ email: 'echt@gmx.de', isTest: true }), fakeCtx(testDb));
    expect(testDb.rows[1]).toMatchObject({ is_test: true, duplicate_of: null, related_lead_id: null });

    // Control: same is_test on both sides still links.
    const sameDb = makeFakeDb([realRoot]);
    await createLead(payload({ email: 'echt@gmx.de', isTest: false }), fakeCtx(sameDb));
    expect(sameDb.rows[1]).toMatchObject({ is_test: false, duplicate_of: ROOT_ID });
  });
});

describe('isTestLead', () => {
  const p = leadPayloadSchema.parse(payload({ email: 'echt@gmx.de', isTest: false }));
  it('real address without ?test=1 → false', () => expect(isTestLead(p)).toBe(false));
  it('?test=1 → true', () => expect(isTestLead({ ...p, isTest: true })).toBe(true));
  it.each(['a@example.com', 'a@test.de', 'a@foo.test', 'a@sub.example.org'])('reserved domain %s → true', (email) =>
    expect(isTestLead({ ...p, email })).toBe(true));
  it('buildLeadInsert uses the same rule', () => {
    for (const q of [p, { ...p, isTest: true }, { ...p, email: 'a@example.com' }]) {
      expect(buildLeadInsert(q, { now, userAgent: null, spam: null, decision: NO_DUPLICATE }).is_test).toBe(isTestLead(q));
    }
  });
});
