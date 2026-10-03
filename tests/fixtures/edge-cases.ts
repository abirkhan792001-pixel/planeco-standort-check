import type { MatchRow } from '@/lib/leads/dedupe';
import type { NominatimHit, OpenPlzLocality } from '@/lib/enrichment/types';
import { validPayload } from './payload';

/**
 * Inputs for tests/unit/edge-cases.test.ts (spec §21.4). Constants are named by row id: D1, P5, ...
 * Plain data and small pure helpers only: no network, no database.
 */

export const NOW = new Date('2026-10-01T08:00:00Z');
export const daysBefore = (days: number, from: Date = NOW) => new Date(from.getTime() - days * 86_400_000).toISOString();
export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** A payload that passes the schema, with per-row overrides. */
export const payload = (o: Record<string, unknown> = {}): Record<string, unknown> => ({ ...validPayload, ...o });

// ---------------------------------------------------------------------------------------------------------------------
// In-memory stand-in for the Supabase client: only what createLead/findMatches use.
// ---------------------------------------------------------------------------------------------------------------------

export type SeedRow = MatchRow & { idempotency_key: string; first_name: string; last_name: string; spam_suspected: boolean };
export const ROOT_ID = '11111111-1111-4111-8111-111111111111';

export const seedRow = (o: Partial<SeedRow> = {}): SeedRow => ({
  id: ROOT_ID, created_at: daysBefore(1), idempotency_key: uuid(900), duplicate_of: null, status: 'neu', assigned_to: null,
  first_name: 'Thomas', last_name: 'Ahrens', email_normalized: 'root@gmx.de', phone_e164: null, address_key: null, spam_suspected: false,
  ...o,
});

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code: string; message: string } | null };

export function makeFakeDb(seed: Row[] = []) {
  const rows: Row[] = seed.map((r) => ({ ...r }));
  let seq = 100;

  class Query implements PromiseLike<Result> {
    private filters: Array<(r: Row) => boolean> = [];
    private pending: Row | null = null;
    private max: number | null = null;
    private mode: 'many' | 'maybe' | 'one' = 'many';

    select() { return this; }
    insert(row: Row) { this.pending = row; return this; }
    eq(col: string, v: unknown) { this.filters.push((r) => r[col] === v); return this; }
    in(col: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[col])); return this; }
    order() { return this; }
    limit(n: number) { this.max = n; return this; }
    maybeSingle() { this.mode = 'maybe'; return this; }
    single() { this.mode = 'one'; return this; }

    then<A = Result, B = never>(
      ok?: ((v: Result) => A | PromiseLike<A>) | null,
      fail?: ((e: unknown) => B | PromiseLike<B>) | null,
    ): PromiseLike<A | B> {
      return Promise.resolve(this.run()).then(ok, fail);
    }

    private run(): Result {
      if (this.pending) {
        const row = this.pending;
        if (rows.some((r) => r.idempotency_key === row.idempotency_key)) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        }
        const stored = { ...row, id: uuid(++seq), created_at: NOW.toISOString() };
        rows.push(stored);
        return { data: stored, error: null };
      }
      let out = rows.filter((r) => this.filters.every((f) => f(r)));
      out.sort((a, b) => Date.parse(String(a.created_at)) - Date.parse(String(b.created_at)));
      if (this.max !== null) out = out.slice(0, this.max);
      if (this.mode === 'maybe') return { data: out[0] ?? null, error: null };
      if (this.mode === 'one') return out[0] ? { data: out[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      return { data: out, error: null };
    }
  }

  return { rows, from: (table: string) => { void table; return new Query(); } };
}

// ---------------------------------------------------------------------------------------------------------------------
// 21.4.1 Duplicates
// ---------------------------------------------------------------------------------------------------------------------

/** D-1: same phone as an existing lead, different email. */
export const D1 = {
  payload: payload({ email: 't.ahrens@web.de' }),
  root: seedRow({ email_normalized: 'thomas@gmx.de', phone_e164: '+4940123456' }),
};

/** D-2: a couple sharing one email, but different name, phone and plot. */
export const D2 = {
  payload: payload({
    firstName: 'Anna', lastName: 'Meyer', email: 'familie.meyer@gmx.de', phone: '0171 2223344',
    street: 'Gartenweg', houseNumber: '7', postalCode: '22880', city: 'Wedel',
  }),
  root: seedRow({
    first_name: 'Peter', last_name: 'Meyer', email_normalized: 'familie.meyer@gmx.de', phone_e164: '+4940111111', address_key: 'lindenweg|3|21465',
  }),
};

/** D-3: siblings asking about the parents' land: same plot, different name, email and phone. */
export const D3 = {
  payload: payload({
    firstName: 'Julia', lastName: 'Schmidt', email: 'julia.schmidt@web.de', phone: '0172 3334455',
    street: 'Lindenweg', houseNumber: '3', postalCode: '21465', city: 'Reinbek',
  }),
  root: seedRow({
    first_name: 'Karl', last_name: 'Schmidt', email_normalized: 'karl.schmidt@gmx.de', phone_e164: '+4940222222', address_key: 'lindenweg|3|21465',
  }),
};

/** D-4: the same payload posted twice (double tap) with one idempotency key. */
export const D4 = { payload: payload({ idempotencyKey: uuid(4) }) };

/** D-5 / D-6: the same person (same email) resubmits after 91 / 89 days. */
export const D5 = { root: seedRow({ created_at: daysBefore(91), email_normalized: 'thomas@example.com' }) };
export const D6 = {
  closedStatuses: ['gewonnen', 'verloren', 'nicht_qualifiziert'] as const,
  root: (status: MatchRow['status']) => seedRow({ created_at: daysBefore(89), status, email_normalized: 'thomas@example.com' }),
};

/** D-7: the root is claimed by user A. */
const USER_A = '22222222-2222-4222-8222-222222222222';
export const D7 = {
  userA: USER_A,
  root: seedRow({ status: 'in_bearbeitung', assigned_to: USER_A, email_normalized: 'thomas@example.com' }),
};

/** D-8: "Thomas Müller" twice, nothing else in common. */
export const D8 = {
  existing: seedRow({
    first_name: 'Thomas', last_name: 'Müller', email_normalized: 'tm@gmx.de', phone_e164: '+4915112345678', address_key: 'bahnhofstrasse|1|12345',
  }),
  payload: payload({
    firstName: 'Thomas', lastName: 'Müller', email: 'thomas.mueller@web.de', phone: '040 987654',
    street: 'Hauptstraße', houseNumber: '14', postalCode: '01067', city: 'Dresden',
  }),
};

/** D-9: email differs only in case and surrounding whitespace. */
export const D9 = {
  payload: payload({ email: 'Thomas@GMX.de ', phone: '0151 9998887', street: 'Gartenweg', houseNumber: '7', postalCode: '22880', city: 'Wedel' }),
  root: seedRow({ email_normalized: 'thomas@gmx.de', phone_e164: '+4915112345678', address_key: 'bahnhofstrasse|1|12345' }),
};

/** D-10: plus-addressing is not folded. */
export const D10 = {
  withTag: 'name+x@gmail.com',
  plain: 'name@gmail.com',
  root: seedRow({ email_normalized: 'name@gmail.com', phone_e164: '+4915112345678', address_key: 'bahnhofstrasse|1|12345' }),
};

// ---------------------------------------------------------------------------------------------------------------------
// 21.4.2 Phone
// ---------------------------------------------------------------------------------------------------------------------

export const P1 = { raw: '+49 (0)40 123456', e164: '+4940123456' };
export const P2 = { raw: '+43 1 5321234', e164: '+4315321234' };
export const P3 = { raw: '+41 44 668 18 00', e164: '+41446681800' };
export const P4 = { raw: '0048 22 1234567', e164: '+48221234567' };
export const P5 = { raw: '040 123456-12', e164: '+4940123456', extension: '12' };
export const P6 = { variants: ['0170/555 12 34', '0170-5551234', '0170.5551234'], e164: '+491705551234' };
export const P7 = { rejectedBySchema: ['keine', '-', '123'], allZeros: ['0000000', '000000', '+00 0000 0000', '00 000 000 000'] };
export const P8 = { emails: ['thomas@example.com', 'kunde1234567@example.com'] };

/** P-9: the same number "040 123456" written in other digit scripts. */
const shiftDigits = (s: string, zero: number) => s.replace(/\d/g, (d) => String.fromCharCode(zero + Number(d)));
export const P9 = {
  ascii: '040 123456',
  fullWidth: shiftDigits('040 123456', 0xff10),
  arabicIndic: shiftDigits('040 123456', 0x0660),
  easternArabicIndic: shiftDigits('040 123456', 0x06f0),
  e164: '+4940123456',
};

// ---------------------------------------------------------------------------------------------------------------------
// 21.4.3 Email
// ---------------------------------------------------------------------------------------------------------------------

export const E7 = {
  email: 'max@müller.de',
  message: 'Bitte E-Mail ohne Umlaute in der Domain eingeben',
  genericMessage: 'Bitte eine gültige E-Mail-Adresse angeben',
};

// ---------------------------------------------------------------------------------------------------------------------
// 21.4.4 Address and enrichment
// ---------------------------------------------------------------------------------------------------------------------

const EN_DASH = String.fromCharCode(0x2013);
const EM_DASH = String.fromCharCode(0x2014);
export const A3 = { simple: '14', letter: '14a', spacedLetter: '14 A', range: '14-16', enDashRange: `14${EN_DASH}16`, emDashRange: `14${EM_DASH}16`, slash: '14/1' };

export const A6_PLZ_20095_HAMBURG: OpenPlzLocality[] = [{
  postalCode: '20095', name: 'Hamburg',
  municipality: { key: '02000000', name: 'Hamburg, Freie und Hansestadt', type: 'Kreisfreie Stadt' },
  district: { key: '02000', name: 'Hamburg, Freie und Hansestadt', type: 'Kreisfreie Stadt' },
  federalState: { key: '02', name: 'Hamburg' },
}];

/** A-6: synthetic hit - Marienplatz 1 exists in München (80331), not at the typed PLZ 20095 (Hamburg). */
export const A6_HITS_MUENCHEN: NominatimHit[] = [{
  lat: '48.1374', lon: '11.5755', addresstype: 'building',
  address: { house_number: '1', road: 'Marienplatz', city: 'München', state: 'Bayern', 'ISO3166-2-lvl4': 'DE-BY', postcode: '80331' },
}];

export const A7 = {
  innsbruck: { street: 'Hauptstraße', houseNumber: '1', postalCode: '6020', city: 'Innsbruck' },
  paris: { street: 'Rue de Rivoli', houseNumber: '1', postalCode: '75001', city: 'Paris' },
  message: 'Bitte eine 5-stellige deutsche PLZ angeben – wir prüfen nur Grundstücke in Deutschland',
};

export const A8 = { streets: ['Osterstr.', 'OSTERSTRASSE', 'oster straße', 'Osterstrasse', 'Osterstraße'], houseNumber: '88', postalCode: '22765' };

// ---------------------------------------------------------------------------------------------------------------------
// 21.4.5 Form input and abuse
// ---------------------------------------------------------------------------------------------------------------------

export const F1 = { names: ['Müller-Lüdenscheidt', 'Ørsted', 'Nguyễn Văn An', "O'Brien"] };
export const F2 = { name: '<script>alert(1)</script>' };
export const F4 = { long: 'x'.repeat(10_000) };

// ---------------------------------------------------------------------------------------------------------------------
// 21.4.6 Attribution
// ---------------------------------------------------------------------------------------------------------------------

export const U1 = { mixed: '?utm_source=Facebook&utm_medium=Paid&utm_campaign=hh_test', lower: '?utm_source=facebook&utm_medium=paid&utm_campaign=hh_test' };
export const U2 = { search: '?gclid=EAIaIQobChMI123' };
export const U3 = { search: '?fbclid=IwAR0abc' };
export const U5 = { search: '?utm_source=&utm_campaign=hh_test', blankSource: '?utm_source=%20%20&utm_campaign=hh_test' };
export const U6 = { long: 'a'.repeat(600), script: '<script>alert(1)</script>' };
