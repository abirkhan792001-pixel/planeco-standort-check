import { describe, it, expect } from 'vitest';
import { buildLeadInsert, deviceType, spamReason, dedupeKeysFromPayload, isDataError } from '@/lib/leads/create';
import { parseJsonBody } from '@/lib/leads/body';
import { leadPayloadSchema } from '@/lib/leads/schema';
import { NO_DUPLICATE } from '@/lib/leads/dedupe';
import { validPayload } from '../fixtures/payload';

const p = leadPayloadSchema.parse(validPayload);
const now = new Date('2026-10-01T08:00:10Z');

describe('spamReason', () => {
  it('honeypot', () => expect(spamReason({ ...p, website: 'http://spam' })).toBe('honeypot'));
  it('too fast (< 3 s)', () => expect(spamReason({ ...p, fillMs: 1000 })).toBe('too_fast'));
  it('human', () => expect(spamReason({ ...p, fillMs: 10_000 })).toBeNull());
});

describe('isDataError', () => {
  it.each([[{ code: '23514' }, true], [{ code: '22021' }, true], [{ code: 'PGRST301' }, false], [new Error('fetch failed'), false], [{ code: '08006' }, false], [null, false], ['23514', false]])(
    '%j -> %s', (e, r) => expect(isDataError(e)).toBe(r));
});

describe('parseJsonBody', () => {
  it('parses valid JSON', () => expect(parseJsonBody('{"a":1}')).toEqual({ ok: true, body: { a: 1 } }));
  it('400 on bad JSON', () => expect(parseJsonBody('{nope')).toEqual({ ok: false, status: 400 }));
  it('413 when over 16000 bytes (UTF-8, not chars)', () => {
    expect(parseJsonBody(JSON.stringify({ a: 'x'.repeat(16_000) }))).toEqual({ ok: false, status: 413 });
    expect(parseJsonBody(JSON.stringify({ a: 'ä'.repeat(8_000) }))).toEqual({ ok: false, status: 413 });
    expect(parseJsonBody(JSON.stringify({ a: 'x'.repeat(100) })).ok).toBe(true);
  });
});

describe('deviceType', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148', 'mobile'],
    ['Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile Safari/537.36', 'mobile'],
    ['Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', 'tablet'],
    ['Mozilla/5.0 (Linux; Android 15; SM-X710) Safari/537.36', 'tablet'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'desktop'],
    [null, 'unknown'],
  ])('%s → %s', (ua, t) => expect(deviceType(ua)).toBe(t));
});

describe('dedupeKeysFromPayload', () => {
  it('normalizes', () => expect(dedupeKeysFromPayload(p)).toEqual({
    email_normalized: 'thomas@example.com', phone_e164: '+4940123456', address_key: 'hauptstrasse|14|01067',
  }));
});

describe('buildLeadInsert', () => {
  it('maps a normal lead', () => {
    const row = buildLeadInsert(p, { now, userAgent: null, spam: null, decision: NO_DUPLICATE });
    expect(row).toMatchObject({
      idempotency_key: p.idempotencyKey, first_name: 'Thomas', email_normalized: 'thomas@example.com',
      phone_e164: '+4940123456', street: 'Hauptstraße', postal_code: '01067', project_type: 'neubau',
      utm_source: 'facebook', privacy_notice_version: '2026-09-v1', is_test: true, status: 'neu',
      email_status: 'pending', enrichment_status: 'pending', spam_suspected: false,
    });
  });
  it('is_test is true for reserved domains or ?test=1', () => {
    expect(buildLeadInsert({ ...p, email: 'a@gmail.com' }, { now, userAgent: null, spam: null, decision: NO_DUPLICATE }).is_test).toBe(false);
    expect(buildLeadInsert({ ...p, email: 'a@gmail.com', isTest: true }, { now, userAgent: null, spam: null, decision: NO_DUPLICATE }).is_test).toBe(true);
  });
  it('stores no address fields when the address is unknown', () => {
    const q = leadPayloadSchema.parse({ ...validPayload, addressUnknown: true, street: 'x', postalCode: '01067', city: 'y', plotNote: 'Lindenweg 3, Neustadt' });
    const row = buildLeadInsert(q, { now, userAgent: null, spam: null, decision: NO_DUPLICATE });
    expect(row).toMatchObject({ street: null, house_number: null, postal_code: null, city: null, address_key: null, plot_note: 'Lindenweg 3, Neustadt' });
  });
  it('spam is closed immediately and skips side effects', () => {
    const row = buildLeadInsert(p, { now, userAgent: null, spam: 'honeypot', decision: NO_DUPLICATE });
    expect(row).toMatchObject({
      spam_suspected: true, spam_reason: 'honeypot', status: 'nicht_qualifiziert', disqualify_reason: 'spam',
      email_status: 'skipped', email_skip_reason: 'spam', enrichment_status: 'skipped',
    });
  });
  it('copies the duplicate decision', () => {
    const row = buildLeadInsert(p, { now, userAgent: null, spam: null, decision: { duplicateOf: 'r1', duplicateReason: ['phone'], relatedLeadId: null, assignedTo: 'u1' } });
    expect(row).toMatchObject({ duplicate_of: 'r1', duplicate_reason: ['phone'], assigned_to: 'u1', status: 'in_bearbeitung' });
    expect(row.assigned_at).toBe(now.toISOString());
  });
});
