/**
 * Spec §21.4 "Edge cases beyond the samples". One describe per sub-table, one `it` per row id; every test name starts
 * with the row id. Inputs live in tests/fixtures/edge-cases.ts, named by row id.
 *
 * Covered by existing tests (not duplicated here):
 *   A-1   evaluate.test.ts          "evaluateGeocode — A-1 cadastral_only"
 *   A-2   evaluate.test.ts          "#5 Groß Grönau: street not found → PLZ-level" (street_not_found, precision postcode)
 *   A-3   evaluate.test.ts          "evaluateGeocode — A-3 house numbers" (matching against hits); the address KEY is pinned below
 *   A-4   evaluate.test.ts          "#2 free text Neustadt: ambiguous across states"; service-area.test.ts "ambiguous or missing
 *                                   coordinates are unclear"
 *   A-5   evaluate.test.ts          "flags an unknown PLZ" and "A-5: unknown PLZ keeps the geocoded hit"
 *   A-6   evaluate.test.ts          "A-6: city/PLZ contradiction ..." (same municipality); the cross-municipality case is below
 *   A-9   enrichment-errors.test.ts "enrichmentErrorCode (A-9)" (rate_limited / timeout); the 1 req/s slot is in nominatim.ts
 *   A-11  service-area.test.ts      "assessServiceArea — boundaries (A-11)"
 *   E-2   (partly) confirmation.test.ts "skips domains without MX"; the row is re-asserted below
 *   F-7   confirmation.test.ts      "throttles to one mail per address per 24 h" (the only defence; no IP rate limit, §4.3 / S3)
 *
 * Not tested here:
 *   E-1   extended E4 (typo suggestion in the form)            covered by: Task 7 / E4 (not built yet)
 *   E-5   Brevo down or > 5 s, submit < 2 s                    covered by: manual (after() in the route); retry logic in side-effects.ts
 *   E-6   hard bounce                                          not built (§4.3, weakness listed in NOTES)
 *   F-3   formula-injection cells in XLSX / CSV                covered by: Task 12 (XLSX export) and E5
 *   F-7   20 submits from one IP                               not built (§4.3, S3); stored without limit, see above
 *   F-8   submit while offline                                 covered by: manual (Task 7 form)
 *   F-9   consent checkbox                                     not built: the form has no consent box (§4.3)
 *   U-4   in-app browsers strip UTMs                           covered by: manual, documented under-count (S2)
 *   U-7   ad click, return later without params               covered by: manual, accepted trade-off D6
 *   U-8   is_test excluded from the report by default          covered by: Task 13 (channel report)
 *   A-10  OpenPLZ down                                         covered by: manual (PLZ proxy, Task 6/7)
 *   A-12  service-area config changed after leads exist        covered by: manual (verdict computed at read time, D8)
 *   C-1 … C-7  dashboard and concurrency                       covered by: Tasks 10-12 and scripts/claim-race.ts / manual
 *   O-1 … O-3  operations                                      covered by: manual / Task 14 / README "Tested on"
 */
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildAddressKey, normalizeEmail, normalizeHouseNumber, normalizePhone, toAsciiDigits,
} from '@/lib/leads/normalize';
import { fieldErrors, leadPayloadSchema } from '@/lib/leads/schema';
import { buildLeadInsert, createLead, dedupeKeysFromPayload, spamReason, type CreateLeadResult } from '@/lib/leads/create';
import { decideDuplicate, NO_DUPLICATE } from '@/lib/leads/dedupe';
import { isReservedEmailDomain } from '@/lib/config/app';
import { canAttemptEmail, escapeHtml, renderConfirmation, shouldSendConfirmation } from '@/lib/email/confirmation';
import { BrevoError, isPermanentBrevoError, sanitizeDisplayName } from '@/lib/email/errors';
import { evaluateGeocode, type GeoInput } from '@/lib/enrichment/evaluate';
import { assessServiceArea } from '@/lib/geo/service-area';
import { SERVICE_AREA } from '@/lib/config/service-area';
import { captureAttribution } from '@/lib/attribution/capture';
import { classifyChannel } from '@/lib/attribution/classify';
import { HITS_1, PLZ_01067 } from '../fixtures/geo';
import { makeLeadRow } from '../fixtures/lead-row';
import {
  A3, A6_HITS_MUENCHEN, A6_PLZ_20095_HAMBURG, A7, A8, D1, D2, D3, D4, D5, D6, D7, D8, D9, D10, E7, F1, F2, F4,
  NOW, P1, P2, P3, P4, P5, P6, P7, P8, P9, ROOT_ID, U1, U2, U3, U5, U6, makeFakeDb, payload, seedRow, uuid,
} from '../fixtures/edge-cases';

const OWN_HOST = 'planeco-standort-check.vercel.app';
const parse = (o: Record<string, unknown> = {}) => leadPayloadSchema.parse(payload(o));
const insert = (o: Record<string, unknown>, spam: string | null = null, decision = NO_DUPLICATE) =>
  buildLeadInsert(parse(o), { now: NOW, userAgent: null, spam, decision });
const ctx = (db: ReturnType<typeof makeFakeDb>) => ({
  now: NOW, userAgent: null, getDb: () => db as unknown as SupabaseClient, sendFallback: async () => false,
});
const idOf = (r: CreateLeadResult) => ('id' in r ? r.id : null);
const known = (o: Partial<GeoInput>): GeoInput => ({ addressUnknown: false, street: null, houseNumber: null, postalCode: null, city: null, ...o });
const mailCtx = { mx: 'yes' as const, sentToSameAddressLast24h: false, now: NOW };

describe('21.4.1 Duplicates (D-1 … D-10)', () => {
  it('D-1: same phone, different email → duplicate of the root, reason phone', () => {
    const d = decideDuplicate(dedupeKeysFromPayload(parse(D1.payload)), [D1.root], NOW);
    expect(d).toEqual({ duplicateOf: ROOT_ID, duplicateReason: ['phone'], relatedLeadId: null, assignedTo: null });
  });

  it('D-2: same email, different name and plot (a couple) → duplicate of the root, reason email only', () => {
    const d = decideDuplicate(dedupeKeysFromPayload(parse(D2.payload)), [D2.root], NOW);
    expect(d).toEqual({ duplicateOf: ROOT_ID, duplicateReason: ['email'], relatedLeadId: null, assignedTo: null });
  });

  it('D-3: same plot, different name, email and phone (siblings) → duplicate of the root, reason address; both rows kept', () => {
    const d = decideDuplicate(dedupeKeysFromPayload(parse(D3.payload)), [D3.root], NOW);
    expect(d).toEqual({ duplicateOf: ROOT_ID, duplicateReason: ['address'], relatedLeadId: null, assignedTo: null });
    const row = insert(D3.payload, null, d);
    expect(row).toMatchObject({ duplicate_of: ROOT_ID, duplicate_reason: ['address'], first_name: 'Julia', last_name: 'Schmidt' });
  });

  it('D-4: the same payload twice (double tap) → exactly one row, the second response returns the same lead id', async () => {
    expect(insert(D4.payload).idempotency_key).toBe(uuid(4));

    const db = makeFakeDb();
    const first = await createLead(D4.payload, ctx(db));
    const second = await createLead(D4.payload, ctx(db));
    expect(first.kind).toBe('created');
    expect(second.kind).toBe('replay');
    expect(idOf(second)).toBe(idOf(first));
    expect(db.rows).toHaveLength(1);

    // Both requests in flight at once: the unique index turns the loser into a replay of the winner.
    const raced = makeFakeDb();
    const [a, b] = await Promise.all([createLead(D4.payload, ctx(raced)), createLead(D4.payload, ctx(raced))]);
    expect([a.kind, b.kind].sort()).toEqual(['created', 'replay']);
    expect(idOf(a)).toBe(idOf(b));
    expect(raced.rows).toHaveLength(1);
  });

  it('D-5: same person after 91 days → new root, linked via related_lead_id', () => {
    const keys = dedupeKeysFromPayload(parse());
    const d = decideDuplicate(keys, [D5.root], NOW);
    expect(d).toEqual({ ...NO_DUPLICATE, relatedLeadId: ROOT_ID });
    expect(insert({}, null, d)).toMatchObject({ duplicate_of: null, related_lead_id: ROOT_ID, status: 'neu', assigned_to: null });
  });

  it('D-6: same person after 89 days, root closed → related_lead_id, not hidden as a duplicate', () => {
    const keys = dedupeKeysFromPayload(parse());
    for (const status of D6.closedStatuses) {
      const d = decideDuplicate(keys, [D6.root(status)], NOW);
      expect(d, status).toEqual({ ...NO_DUPLICATE, relatedLeadId: ROOT_ID });
      expect(insert({}, null, d).duplicate_of, status).toBeNull();
    }
    // Control: the same age with an open root is an ordinary duplicate.
    expect(decideDuplicate(keys, [D6.root('in_bearbeitung')], NOW)).toMatchObject({ duplicateOf: ROOT_ID, relatedLeadId: null });
  });

  it('D-7: a duplicate that arrives while the root is claimed by user A inherits owner A', () => {
    const keys = dedupeKeysFromPayload(parse());
    const d = decideDuplicate(keys, [D7.root], NOW);
    expect(d).toMatchObject({ duplicateOf: ROOT_ID, assignedTo: D7.userA });
    expect(insert({}, null, d)).toMatchObject({
      duplicate_of: ROOT_ID, assigned_to: D7.userA, status: 'in_bearbeitung', assigned_at: NOW.toISOString(),
    });
    // Control: an unclaimed root gives the duplicate no owner.
    expect(decideDuplicate(keys, [{ ...D7.root, assigned_to: null, status: 'neu' }], NOW).assignedTo).toBeNull();
  });

  it('D-8: same name, everything else different → not a duplicate (the name alone never matches)', async () => {
    const keys = dedupeKeysFromPayload(parse(D8.payload));
    expect(Object.keys(keys).sort()).toEqual(['address_key', 'email_normalized', 'phone_e164']);
    const db = makeFakeDb([D8.existing]);
    const r = await createLead(D8.payload, ctx(db));
    expect(r.kind).toBe('created');
    expect(db.rows).toHaveLength(2);
    expect(db.rows[1]).toMatchObject({ first_name: 'Thomas', last_name: 'Müller', duplicate_of: null, duplicate_reason: null, related_lead_id: null, status: 'neu' });
  });

  it('D-9: email differing only in case or whitespace ("Thomas@GMX.de ") → duplicate', async () => {
    const parsed = parse(D9.payload);
    expect(parsed.email).toBe('Thomas@GMX.de');
    expect(normalizeEmail('Thomas@GMX.de ')).toBe('thomas@gmx.de');
    const keys = dedupeKeysFromPayload(parsed);
    expect(keys.email_normalized).toBe('thomas@gmx.de');
    expect(decideDuplicate(keys, [D9.root], NOW)).toMatchObject({ duplicateOf: ROOT_ID, duplicateReason: ['email'] });

    const db = makeFakeDb([D9.root]);
    expect((await createLead(D9.payload, ctx(db))).kind).toBe('created');
    expect(db.rows[1]).toMatchObject({ duplicate_of: ROOT_ID, duplicate_reason: ['email'], email_normalized: 'thomas@gmx.de' });
  });

  it('D-10: plus-addressing is NOT folded: name+x@gmail.com vs name@gmail.com is not a duplicate', async () => {
    expect(normalizeEmail(D10.withTag)).toBe('name+x@gmail.com');
    expect(normalizeEmail(D10.withTag)).not.toBe(normalizeEmail(D10.plain));
    // New lead has the tag, the existing one does not.
    const db = makeFakeDb([D10.root]);
    expect((await createLead(payload({ email: D10.withTag }), ctx(db))).kind).toBe('created');
    expect(db.rows[1]).toMatchObject({ duplicate_of: null, duplicate_reason: null, related_lead_id: null });
    // And the other way round.
    const reverse = makeFakeDb([{ ...D10.root, email_normalized: 'name+x@gmail.com' }]);
    expect((await createLead(payload({ email: D10.plain }), ctx(reverse))).kind).toBe('created');
    expect(reverse.rows[1]).toMatchObject({ duplicate_of: null, duplicate_reason: null });
  });
});

describe('21.4.2 Phone (P-1 … P-9)', () => {
  it('P-1: "+49 (0)40 123456" → +4940123456 (the (0) is dropped)', () => {
    expect(normalizePhone(P1.raw).e164).toBe(P1.e164);
  });

  it('P-2: Austrian +43 number is not forced to +49', () => {
    expect(normalizePhone(P2.raw).e164).toBe(P2.e164);
  });

  it('P-3: Swiss +41 number is kept', () => {
    expect(normalizePhone(P3.raw).e164).toBe(P3.e164);
  });

  it('P-4: "0048 …" (00 prefix, Poland) → +48', () => {
    expect(normalizePhone(P4.raw).e164).toBe(P4.e164);
  });

  it('P-5: extension is stored separately (Decided): phone_e164 +4940123456, phone_extension 12', () => {
    expect(normalizePhone(P5.raw)).toMatchObject({ e164: P5.e164, extension: P5.extension });
    // Single trailing hyphen group of 1-4 digits, only after a digit group of >= 5 digits.
    expect(normalizePhone('0170-5551234')).toMatchObject({ e164: '+491705551234', extension: null });
    expect(normalizePhone('(040) 55-51-23-45')).toMatchObject({ e164: '+494055512345', extension: null });
    expect(normalizePhone('040 55-51234').extension).toBeNull();
    expect(normalizePhone('040 123456-1234').extension).toBe('1234');
    expect(normalizePhone('040 123456-12345').extension).toBeNull();
    expect(normalizePhone('040 12345-6')).toMatchObject({ e164: '+494012345', extension: '6' });
    expect(normalizePhone('0401-2345').extension).toBeNull();
    // Explicit markers keep working and now fill the extension too.
    for (const raw of ['040 123456 ext. 12', '040123456 x12', '040 123456 Durchwahl 12', '040 123456 DW 12']) {
      expect(normalizePhone(raw), raw).toMatchObject({ e164: '+4940123456', extension: '12' });
    }
    // A marker group longer than 6 digits is not an extension: it is dropped from the number and not stored.
    expect(normalizePhone('040 123456 x1234567')).toMatchObject({ e164: '+4940123456', extension: null });
    // The row gets its own column; the dedupe key ignores the extension.
    expect(insert({ phone: P5.raw })).toMatchObject({ phone_raw: P5.raw, phone_e164: '+4940123456', phone_extension: '12' });
    expect(insert({ phone: '040 123456' }).phone_extension).toBeNull();
    expect(dedupeKeysFromPayload(parse({ phone: P5.raw })).phone_e164).toBe(dedupeKeysFromPayload(parse({ phone: '040 123456' })).phone_e164);
  });

  it('P-6: "0170/555 12 34", "0170-5551234", "0170.5551234" all → +491705551234', () => {
    for (const raw of P6.variants) expect(normalizePhone(raw).e164, raw).toBe(P6.e164);
  });

  it('P-7: keine / - / 123 are rejected by the schema; 0000000 gets through and is stored with e164 null, valid false', async () => {
    for (const phone of P7.rejectedBySchema) {
      const r = leadPayloadSchema.safeParse(payload({ phone }));
      expect(r.success, phone).toBe(false);
      if (!r.success) expect(fieldErrors(r.error).phone, phone).toBeDefined();
      expect(normalizePhone(phone), phone).toEqual({ e164: null, valid: false, extension: null });
    }
    for (const phone of P7.allZeros) {
      expect(normalizePhone(phone), phone).toEqual({ e164: null, valid: false, extension: null });
    }
    expect(leadPayloadSchema.safeParse(payload({ phone: '0000000' })).success).toBe(true);
    expect(insert({ phone: '0000000' })).toMatchObject({ phone_raw: '0000000', phone_e164: null, phone_valid: false, phone_extension: null });
    const db = makeFakeDb();
    expect((await createLead(payload({ phone: '0000000' }), ctx(db))).kind).toBe('created');
    expect(db.rows[0]).toMatchObject({ phone_e164: null, phone_valid: false });
  });

  it('P-8: an email address in the phone field fails the schema on phone', () => {
    for (const phone of P8.emails) {
      const r = leadPayloadSchema.safeParse(payload({ phone }));
      expect(r.success, phone).toBe(false);
      if (!r.success) expect(fieldErrors(r.error).phone, phone).toBe('Bitte eine Telefonnummer angeben, unter der wir Sie erreichen');
    }
  });

  it('P-9: full-width and Arabic-Indic digits are normalized to ASCII, never a crash', () => {
    for (const raw of [P9.fullWidth, P9.arabicIndic, P9.easternArabicIndic]) {
      expect(toAsciiDigits(raw), raw).toBe(P9.ascii);
      expect(normalizePhone(raw), raw).toMatchObject({ e164: P9.e164 });
      expect(leadPayloadSchema.safeParse(payload({ phone: raw })).success, raw).toBe(true);
    }
    expect(toAsciiDigits('+49 abc')).toBe('+49 abc');
    for (const raw of ['‏١٢', '\u{1F600}\u{1F600}\u{1F600}', '\ud83d', '＋４９ ４０ １２３４５６', '٠']) {
      expect(() => normalizePhone(raw), raw).not.toThrow();
      expect(() => leadPayloadSchema.safeParse(payload({ phone: raw })), raw).not.toThrow();
    }
  });
});

describe('21.4.3 Email (E-2, E-3, E-4, E-7)', () => {
  it('E-2: valid syntax but no MX record → skipped / no_mx, not retried', () => {
    expect(shouldSendConfirmation(makeLeadRow(), { ...mailCtx, mx: 'no' })).toEqual({ send: false, reason: 'no_mx', retryable: false });
  });

  it('E-3: @example.com and @test.de are test leads and never get a mail', () => {
    for (const email of ['max@example.com', 'max@test.de', 'max@mail.test.de']) {
      expect(isReservedEmailDomain(email), email).toBe(true);
      expect(insert({ email }).is_test, email).toBe(true);
      expect(shouldSendConfirmation(makeLeadRow({ email, email_normalized: email }), mailCtx), email).toMatchObject({ send: false, reason: 'test_domain' });
    }
    // Only the exact domain and its subdomains, not look-alikes.
    for (const email of ['max@attest.de', 'max@contest.de', 'max@test.com', 'max@gmx.de']) {
      expect(isReservedEmailDomain(email), email).toBe(false);
    }
  });

  it('E-4: Brevo 429 stays retryable; after 24 h the lead is skipped as too_late', () => {
    expect(isPermanentBrevoError(new BrevoError(429, 'Too Many Requests'))).toBe(false);
    expect(canAttemptEmail({ email_status: 'failed', email_attempts: 2, email_claimed_at: null }, NOW)).toBe(true);
    expect(canAttemptEmail({ email_status: 'failed', email_attempts: 3, email_claimed_at: null }, NOW)).toBe(false);
    const created = (hoursAgo: number) => makeLeadRow({ created_at: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(), email_status: 'failed' });
    expect(shouldSendConfirmation(created(24 + 1 / 60), mailCtx)).toEqual({ send: false, reason: 'too_late', retryable: false });
    expect(shouldSendConfirmation(created(48), mailCtx)).toMatchObject({ send: false, reason: 'too_late' });
    expect(shouldSendConfirmation(created(23.9), mailCtx)).toEqual({ send: true });
  });

  it('E-7: an IDN domain (müller.de) is rejected with the dedicated message, which wins over the generic one (Decided)', () => {
    const r = leadPayloadSchema.safeParse(payload({ email: E7.email }));
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).email).toBe(E7.message);
    for (const email of ['max@bücher.example', 'info@straße.de', ' max@müller.de ']) {
      const bad = leadPayloadSchema.safeParse(payload({ email }));
      expect(bad.success, email).toBe(false);
      if (!bad.success) expect(fieldErrors(bad.error).email, email).toBe(E7.message);
    }
    // Everything else keeps the generic message; the ASCII punycode form is a normal address.
    for (const email of ['nope', 'max@', 'müller@example.com']) {
      const bad = leadPayloadSchema.safeParse(payload({ email }));
      expect(bad.success, email).toBe(false);
      if (!bad.success) expect(fieldErrors(bad.error).email, email).toBe(E7.genericMessage);
    }
    expect(leadPayloadSchema.safeParse(payload({ email: 'max@xn--mller-kva.de' })).success).toBe(true);
  });
});

describe('21.4.4 Address and enrichment (A-3, A-6, A-7, A-8)', () => {
  it('A-3: 14a = 14 A, 14-16 keeps the range (en/em dash folded), 14/1 works', () => {
    const key = (houseNumber: string) => buildAddressKey({ street: 'Hauptstraße', houseNumber, postalCode: '01067', addressUnknown: false });
    expect(key(A3.letter)).toBe('hauptstrasse|14a|01067');
    expect(key(A3.spacedLetter)).toBe(key(A3.letter));
    expect(key(A3.range)).toBe('hauptstrasse|14-16|01067');
    expect(key(A3.range)).not.toBe(key(A3.simple));
    expect(key(A3.enDashRange)).toBe(key(A3.range));
    expect(key(A3.emDashRange)).toBe(key(A3.range));
    expect(key(A3.slash)).toBe('hauptstrasse|14/1|01067');
    expect(normalizeHouseNumber(' 14 – 16 ')).toBe('14-16');
    for (const houseNumber of Object.values(A3)) {
      expect(leadPayloadSchema.safeParse(payload({ houseNumber })).success, houseNumber).toBe(true);
    }
  });

  it('A-6: PLZ and town contradict each other → flagged; the geocoded municipality wins and carries no key/district of the other one', () => {
    const r = evaluateGeocode(
      known({ street: 'Marienplatz', houseNumber: '1', postalCode: '20095', city: 'München' }), A6_PLZ_20095_HAMBURG, A6_HITS_MUENCHEN,
    );
    expect(r.flags).toEqual(expect.arrayContaining(['city_plz_mismatch', 'plz_mismatch']));
    expect(r).toMatchObject({
      precision: 'house', municipality: 'München', stateCode: 'DE-BY', foundPostcode: '80331', municipalityKey: null, district: null,
    });
    // Control: a hit in the municipality OpenPLZ named keeps its key and district.
    const same = evaluateGeocode(known({ street: 'Hauptstraße', houseNumber: '14', postalCode: '01067', city: 'Dresden' }), PLZ_01067, HITS_1);
    expect(same).toMatchObject({ municipality: 'Dresden', municipalityKey: '14612000', district: 'Dresden, Stadt' });
  });

  it('A-7: a 4-digit foreign PLZ is rejected with the Germany-only message; a foreign 5-digit PLZ ends unclear', () => {
    const r = leadPayloadSchema.safeParse(payload(A7.innsbruck));
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).postalCode).toBe(A7.message);

    expect(leadPayloadSchema.safeParse(payload(A7.paris)).success).toBe(true);
    const g = evaluateGeocode(known(A7.paris), [], []);
    expect(g.flags).toContain('plz_not_found');
    expect(assessServiceArea({ enrichment_status: 'done', geo_lat: g.lat, geo_lon: g.lon, geo_flags: g.flags }, SERVICE_AREA).verdict).toBe('unclear');
  });

  it('A-8: Osterstr. / OSTERSTRASSE / oster straße / Osterstrasse → one address key', () => {
    const keys = new Set(
      A8.streets.map((street) => buildAddressKey({ street, houseNumber: A8.houseNumber, postalCode: A8.postalCode, addressUnknown: false })),
    );
    expect([...keys]).toEqual(['osterstrasse|88|22765']);
  });
});

describe('21.4.5 Form input and abuse (F-1, F-2, F-4, F-5, F-6, F-10)', () => {
  it('F-1: Müller-Lüdenscheidt, Ørsted, Nguyễn Văn An, O\'Brien are accepted and stored unchanged, and render correctly in the mail', () => {
    for (const name of F1.names) {
      const row = insert({ firstName: name, lastName: name });
      expect(row, name).toMatchObject({ first_name: name, last_name: name });
      const mail = renderConfirmation(makeLeadRow({ first_name: name, last_name: 'Ahrens' }));
      expect(mail.text, name).toContain(`Guten Tag ${name} Ahrens`);
      expect(mail.html, name).toContain(escapeHtml(name));
      expect(sanitizeDisplayName(name, 'Ahrens'), name).toBe(`${name} Ahrens`);
    }
  });

  it('F-2: a <script> name is stored as text and escaped in the mail', () => {
    const row = insert({ firstName: F2.name, lastName: F2.name });
    expect(row).toMatchObject({ first_name: F2.name, last_name: F2.name });
    const mail = renderConfirmation(makeLeadRow({ first_name: F2.name, last_name: F2.name }));
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('F-4: a 10 000-character value in any text field is rejected by the server-side schema', () => {
    const fields: Array<[string, Record<string, unknown>]> = [
      ['firstName', { firstName: F4.long }], ['lastName', { lastName: F4.long }], ['email', { email: `${F4.long}@example.com` }],
      ['phone', { phone: F4.long.replace(/x/g, '1') }], ['street', { street: F4.long }], ['houseNumber', { houseNumber: F4.long }],
      ['postalCode', { postalCode: F4.long.replace(/x/g, '1') }], ['city', { city: F4.long }], ['plotNote', { plotNote: F4.long }],
      ['website', { website: F4.long }], ['attribution', { attribution: { utm_source: F4.long } }],
      ['attribution', { attribution: { referrer: F4.long } }], ['attribution', { attribution: { landing_path: F4.long } }],
    ];
    for (const [field, override] of fields) {
      const r = leadPayloadSchema.safeParse(payload(override));
      expect(r.success, field).toBe(false);
      if (!r.success) expect(Object.keys(fieldErrors(r.error)), field).toContain(field);
    }
  });

  it('F-5: whitespace-only required fields are validation errors', () => {
    const blank = '   \t ';
    for (const field of ['firstName', 'lastName', 'email', 'phone', 'street', 'postalCode', 'city']) {
      const r = leadPayloadSchema.safeParse(payload({ [field]: blank }));
      expect(r.success, field).toBe(false);
      if (!r.success) expect(Object.keys(fieldErrors(r.error)), field).toContain(field);
    }
    const unknownAddress = leadPayloadSchema.safeParse(payload({ addressUnknown: true, street: '', postalCode: '', city: '', plotNote: blank }));
    expect(unknownAddress.success).toBe(false);
  });

  it('F-6: honeypot filled or < 3 s → stored as spam (created, no side effects), never linked as a duplicate', async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ website: 'http://spam.example' }, 'honeypot'], [{ fillMs: 1500 }, 'too_fast'], [{ website: 'x', fillMs: 10 }, 'honeypot'],
    ];
    for (const [override, reason] of cases) {
      expect(spamReason(parse(payload(override)))).toBe(reason);
      const db = makeFakeDb([seedRow({ email_normalized: 'thomas@example.com' })]);
      const r = await createLead(payload(override), ctx(db));
      expect(r, reason).toMatchObject({ kind: 'created', runSideEffects: false });
      expect(db.rows[1], reason).toMatchObject({
        spam_suspected: true, spam_reason: reason, status: 'nicht_qualifiziert', disqualify_reason: 'spam',
        email_status: 'skipped', email_skip_reason: 'spam', enrichment_status: 'skipped',
      });
      expect(db.rows[1].duplicate_of ?? null, reason).toBeNull();
    }
    expect(spamReason(parse(payload({ fillMs: 2999 })))).toBe('too_fast');
    expect(spamReason(parse(payload({ fillMs: 3000 })))).toBeNull();
  });

  it('F-10: unknown fields (also status, assigned_to, nested attribution keys) are stripped and never reach the row', () => {
    const extra = payload({
      foo: 1, status: 'gewonnen', assigned_to: 'u1', id: 'x', duplicate_of: 'y', spam_suspected: true,
      attribution: { utm_source: 'facebook', evil: 'x' },
    });
    const parsed = leadPayloadSchema.parse(extra);
    for (const key of ['foo', 'status', 'assigned_to', 'id', 'duplicate_of', 'spam_suspected']) expect(parsed).not.toHaveProperty(key);
    expect(parsed.attribution).not.toHaveProperty('evil');
    expect(parsed.attribution).toMatchObject({ utm_source: 'facebook' });
    const row = buildLeadInsert(parsed, { now: NOW, userAgent: null, spam: null, decision: NO_DUPLICATE });
    expect(row).not.toHaveProperty('foo');
    expect(row).toMatchObject({ status: 'neu', assigned_to: null, duplicate_of: null, spam_suspected: false });
  });
});

describe('21.4.6 Attribution (U-1, U-2, U-3, U-5, U-6)', () => {
  const channel = (search: string, referrer = '') => classifyChannel(captureAttribution(search, referrer, '/').attribution, OWN_HOST);

  it('U-1: Facebook / Paid classifies like facebook / paid', () => {
    expect(channel(U1.mixed)).toEqual(channel(U1.lower));
    expect(channel(U1.mixed)).toEqual({ group: 'Paid Social', channel: 'Meta Ads', campaign: 'hh_test' });
  });

  it('U-2: gclid without UTMs is Google Ads', () => {
    expect(channel(U2.search)).toEqual({ group: 'Paid Search', channel: 'Google Ads', campaign: '(ohne Kampagne)' });
  });

  it('U-3: fbclid without UTMs is Meta but not assumed paid', () => {
    const c = channel(U3.search);
    expect(c.group).toBe('Social (unklar)');
    expect(c.group).not.toMatch(/^Paid/);
  });

  it('U-5: utm_source empty but utm_campaign present → campaign kept, channel "unbekannt"', () => {
    for (const search of [U5.search, U5.blankSource]) {
      expect(channel(search), search).toEqual({ group: 'Campaign', channel: 'unbekannt', campaign: 'hh_test' });
    }
  });

  it('U-6: a 600-character UTM is capped at 500; <script> is kept as inert text (escaped when rendered)', () => {
    const { attribution } = captureAttribution(`?utm_campaign=${U6.long}&utm_source=${encodeURIComponent(U6.script)}`, '', '/');
    expect(attribution.utm_campaign).toHaveLength(500);
    expect(attribution.utm_source).toBe(U6.script);
    // The capped value is exactly what the server-side limit allows; an uncapped one is refused.
    expect(leadPayloadSchema.safeParse(payload({ attribution })).success).toBe(true);
    expect(leadPayloadSchema.safeParse(payload({ attribution: { utm_campaign: U6.long } })).success).toBe(false);
    expect(insert({ attribution })).toMatchObject({ utm_source: U6.script });
    expect(classifyChannel(attribution, OWN_HOST).channel).toBe(U6.script);
    // Never rendered raw in the one place we control here: the mail does not echo attribution at all.
    const mail = renderConfirmation(makeLeadRow({ utm_source: U6.script, utm_campaign: U6.long }));
    expect(mail.html).not.toContain('<script>');
    expect(mail.text).not.toContain(U6.script);
  });
});
