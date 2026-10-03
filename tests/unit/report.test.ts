import { describe, it, expect } from 'vitest';
import { buildChannelReport } from '@/lib/report';
import { deriveLeadViews } from '@/lib/leads/derive';
import { makeLeadRow } from '../fixtures/lead-row';

const HH = { enrichment_status: 'done' as const, geo_lat: 53.57, geo_lon: 9.95 };
const DD = { enrichment_status: 'done' as const, geo_lat: 51.06, geo_lon: 13.74 };

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
});
