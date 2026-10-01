import { describe, it, expect } from 'vitest';
import { decideDuplicate, NO_DUPLICATE, type MatchRow } from '@/lib/leads/dedupe';

const now = new Date('2026-10-01T08:00:00Z');
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
