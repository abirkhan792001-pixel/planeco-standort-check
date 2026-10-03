import { describe, it, expect } from 'vitest';
import { buildChannelReport, rateConfidence, MIN_SAMPLE } from '@/lib/report';
import { deriveLeadViews } from '@/lib/leads/derive';
import { makeLeadRow } from '../fixtures/lead-row';

const HH = { enrichment_status: 'done' as const, geo_lat: 53.57, geo_lon: 9.95 };
const DD = { enrichment_status: 'done' as const, geo_lat: 51.06, geo_lon: 13.74 };
/** Enrichment finished but no coordinates: the area verdict is `unclear`. */
const NOGEO = { enrichment_status: 'done' as const, geo_lat: null, geo_lon: null };

const views = deriveLeadViews([
  makeLeadRow({ id: '1', gclid: 'g', utm_campaign: 'brand', ...HH, status: 'qualifiziert', assigned_at: '2026-10-01T10:00:00Z' }),
  makeLeadRow({ id: '2', gclid: 'g', utm_campaign: 'brand', ...DD, status: 'nicht_qualifiziert', disqualify_reason: 'ausserhalb_gebiet', assigned_at: '2026-10-01T12:00:00Z' }),
  makeLeadRow({ id: '3', gclid: 'g', utm_campaign: 'brand', duplicate_of: '1' }),
  makeLeadRow({ id: '4', utm_source: 'facebook', utm_medium: 'paid_social', utm_campaign: 'hh', ...HH, status: 'gewonnen' }),
  makeLeadRow({ id: '5', spam_suspected: true, status: 'nicht_qualifiziert', disqualify_reason: 'spam' }),
  makeLeadRow({ id: '6', is_test: true, utm_source: 'facebook', utm_medium: 'paid_social', utm_campaign: 'hh' }),
], [], 'x');

describe('buildChannelReport', () => {
  it('aggregates roots per channel/campaign, excluding spam, duplicates and (optionally) tests', () => {
    const rows = buildChannelReport(views, { includeTest: false });
    const google = rows.find((r) => r.channel === 'Google Ads')!;
    expect(google).toMatchObject({ campaign: 'brand', leads: 2, inside: 1, located: 2, qualified: 1, decided: 2, won: 0, topReason: 'ausserhalb_gebiet' });
    expect(google.avgHoursToClaim).toBeCloseTo(3);
    const meta = rows.find((r) => r.channel === 'Meta Ads')!;
    expect(meta).toMatchObject({ leads: 1, qualified: 1, decided: 1, won: 1 });
    expect(rows.reduce((s, r) => s + r.leads, 0)).toBe(3);
  });
  it('can include test data', () => {
    expect(buildChannelReport(views, { includeTest: true }).find((r) => r.channel === 'Meta Ads')!.leads).toBe(2);
  });
  it('returns no rows for no input', () => {
    expect(buildChannelReport([], { includeTest: false })).toEqual([]);
    expect(buildChannelReport([], { includeTest: true })).toEqual([]);
  });
  it('returns no rows when only spam, duplicates and hidden tests remain', () => {
    const only = deriveLeadViews([
      makeLeadRow({ id: 'a', spam_suspected: true }),
      makeLeadRow({ id: 'b', duplicate_of: 'x' }),
      makeLeadRow({ id: 'c', is_test: true }),
    ], [], 'x');
    expect(buildChannelReport(only, { includeTest: false })).toEqual([]);
  });
  it('keeps zero denominators at 0 and the optional fields at null', () => {
    const [row] = buildChannelReport(deriveLeadViews([makeLeadRow({ id: 'z', ...NOGEO })], [], 'x'), { includeTest: false });
    expect(row).toMatchObject({ leads: 1, inside: 0, located: 0, unclear: 1, qualified: 0, decided: 0, won: 0, topReason: null, avgHoursToClaim: null });
  });
  it('counts leads with an unclear area verdict, outside the in-area denominator', () => {
    const [row] = buildChannelReport(deriveLeadViews([
      makeLeadRow({ id: '1', ...HH }),
      makeLeadRow({ id: '2', ...NOGEO }),
      makeLeadRow({ id: '3', ...NOGEO, geo_lat: 53.57, geo_lon: 9.95, geo_flags: ['ambiguous'] }),
    ], [], 'x'), { includeTest: false });
    expect(row).toMatchObject({ leads: 3, unclear: 2, inside: 1, located: 1 });
  });
  it('sorts by group, then channel, then campaign, so groups never interleave', () => {
    const g = (id: string, c: string) => makeLeadRow({ id, gclid: 'g', utm_campaign: c });
    const m = (id: string, c: string) => makeLeadRow({ id, utm_source: 'facebook', utm_medium: 'paid_social', utm_campaign: c });
    const ms = (id: string, c: string) => makeLeadRow({ id, msclkid: 'm', utm_campaign: c });
    const rows = buildChannelReport(deriveLeadViews([
      // Meta is in the middle by lead count (2); by count the old order was Google brand, Meta, Google zeta.
      g('1', 'brand'), g('2', 'brand'), g('3', 'brand'),
      m('4', 'hh'), m('5', 'hh'),
      g('6', 'zeta'),
      ms('7', 'alpha'),
    ], [], 'x'), { includeTest: false });
    expect(rows.map((r) => [r.group, r.channel, r.campaign])).toEqual([
      ['Paid Search', 'Google Ads', 'brand'],
      ['Paid Search', 'Google Ads', 'zeta'],
      ['Paid Search', 'Microsoft Ads', 'alpha'],
      ['Paid Social', 'Meta Ads', 'hh'],
    ]);
  });
  it('orders campaigns German-aware (Ä sorts with A, not after Z)', () => {
    const rows = buildChannelReport(deriveLeadViews([
      makeLeadRow({ id: '1', gclid: 'g', utm_campaign: 'zebra' }),
      makeLeadRow({ id: '2', gclid: 'g', utm_campaign: 'Äpfel' }),
      makeLeadRow({ id: '3', gclid: 'g', utm_campaign: 'berlin' }),
    ], [], 'x'), { includeTest: false });
    expect(rows.map((r) => r.campaign)).toEqual(['Äpfel', 'berlin', 'zebra']);
  });
});

describe('rateConfidence', () => {
  it('greys the in-area rate by its own denominator (located), not by lead count', () => {
    expect(rateConfidence({ located: MIN_SAMPLE - 1, decided: MIN_SAMPLE })).toEqual({ areaThin: true, qualThin: false });
    expect(rateConfidence({ located: MIN_SAMPLE, decided: MIN_SAMPLE })).toEqual({ areaThin: false, qualThin: false });
  });
  it('greys the qualification rate by its own denominator (decided), not by lead count', () => {
    expect(rateConfidence({ located: MIN_SAMPLE, decided: MIN_SAMPLE - 1 })).toEqual({ areaThin: false, qualThin: true });
    expect(rateConfidence({ located: 0, decided: 0 })).toEqual({ areaThin: true, qualThin: true });
  });
  it('flags a channel with many leads but few decided ones', () => {
    const [row] = buildChannelReport(deriveLeadViews(
      Array.from({ length: 25 }, (_, i) => makeLeadRow({
        id: String(i), gclid: 'g', ...HH, status: i < 3 ? 'qualifiziert' : 'neu',
      })),
      [], 'x',
    ), { includeTest: false });
    expect(row.leads).toBe(25);
    expect(rateConfidence(row)).toEqual({ areaThin: false, qualThin: true });
  });
});
