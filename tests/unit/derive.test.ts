import { describe, it, expect } from 'vitest';
import { deriveLeadViews, missingRootIds } from '@/lib/leads/derive';
import { makeLeadRow } from '../fixtures/lead-row';

const OWN = 'planeco-standort-check.vercel.app';

describe('deriveLeadViews', () => {
  it('derives channel, area, owner, group size and labels', () => {
    const root = makeLeadRow({ id: 'r', gclid: 'x', assigned_to: 'uA', enrichment_status: 'done', geo_lat: 53.5767, geo_lon: 9.9488, geo_precision: 'street', geo_flags: ['plz_mismatch'] });
    const dup = makeLeadRow({ id: 'd', duplicate_of: 'r' });
    const [v] = deriveLeadViews([root, dup], [{ id: 'uA', display_name: 'Vertrieb A' }], OWN);
    expect(v.channel.channel).toBe('Google Ads');
    expect(v.area).toMatchObject({ verdict: 'inside', hub: 'Hamburg' });
    expect(v.addressQuality).toBe('street');
    expect(v.ownerName).toBe('Vertrieb A');
    expect(v.groupSize).toBe(2);
    expect(v.plotLabel).toBe('Hauptstraße 14, 01067 Dresden');
  });
  it('ambiguous wins over precision; pending while not enriched', () => {
    const views = deriveLeadViews([
      makeLeadRow({ id: 'a', enrichment_status: 'done', geo_flags: ['ambiguous'], geo_precision: 'none' }),
      makeLeadRow({ id: 'b' }),
    ], [], OWN);
    expect(views.map((v) => v.addressQuality)).toEqual(['ambiguous', 'pending']);
  });
  it('spam (enrichment skipped) has no address verdict', () => {
    const [v] = deriveLeadViews([makeLeadRow({ enrichment_status: 'skipped', spam_suspected: true })], [], OWN);
    expect(v.addressQuality).toBe('n/a');
  });
  it('unknown address label', () => {
    const [v] = deriveLeadViews([makeLeadRow({ address_unknown: true, street: null, plot_note: 'Lindenweg 3, Neustadt' })], [], OWN);
    expect(v.plotLabel).toBe('Adresse unbekannt: Lindenweg 3, Neustadt');
  });
});

describe('missingRootIds (1000-row window)', () => {
  it('returns each duplicate_of id that is not in the window, once', () => {
    const rows = [
      makeLeadRow({ id: 'a' }),
      makeLeadRow({ id: 'b', duplicate_of: 'a' }),
      makeLeadRow({ id: 'c', duplicate_of: 'old' }),
      makeLeadRow({ id: 'd', duplicate_of: 'old' }),
      makeLeadRow({ id: 'e', duplicate_of: 'older' }),
    ];
    expect(missingRootIds(rows)).toEqual(['old', 'older']);
  });
  it('is empty when every root is present', () => expect(missingRootIds([makeLeadRow({ id: 'a' })])).toEqual([]));
});
