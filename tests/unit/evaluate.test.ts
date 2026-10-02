import { describe, it, expect } from 'vitest';
import { evaluateGeocode, type GeoInput } from '@/lib/enrichment/evaluate';
import {
  HITS_1, HITS_2, HITS_3, HITS_5, HITS_OSTERSTRASSE_TWO_PLZ, HITS_WEDEL,
  PLZ_01067, PLZ_22765, PLZ_23627, WRONG_STREET_HIT,
} from '../fixtures/geo';

const known = (o: Partial<GeoInput>): GeoInput => ({ addressUnknown: false, street: null, houseNumber: null, postalCode: null, city: null, ...o });

describe('evaluateGeocode — case samples', () => {
  it('#1 Dresden: house found, but at a different PLZ', () => {
    const r = evaluateGeocode(known({ street: 'Hauptstraße', houseNumber: '14', postalCode: '01067', city: 'Dresden' }), PLZ_01067, HITS_1);
    expect(r).toMatchObject({ precision: 'house', stateCode: 'DE-SN', foundPostcode: '01097', municipality: 'Dresden' });
    expect(r.flags).toEqual(['plz_mismatch']);
    expect(r.lat).toBeCloseTo(51.0589555);
  });

  it('#2 free text Neustadt: ambiguous across states, no coordinates', () => {
    const r = evaluateGeocode({ addressUnknown: true, street: null, houseNumber: null, postalCode: null, city: null }, null, HITS_2);
    expect(r.flags).toEqual(expect.arrayContaining(['address_unknown', 'ambiguous']));
    expect(r.lat).toBeNull();
    expect(r.candidates?.map((c) => c.stateCode).sort()).toEqual(['DE-BW', 'DE-SH', 'DE-SN']);
  });

  it('#3 Hamburg: street-level only, PLZ mismatch, state from ISO code (no `state` key)', () => {
    const r = evaluateGeocode(known({ street: 'Osterstraße', houseNumber: '88', postalCode: '22765', city: 'Hamburg' }), PLZ_22765, HITS_3);
    expect(r).toMatchObject({ precision: 'street', stateCode: 'DE-HH', foundPostcode: '20255', municipality: 'Hamburg' });
    expect(r.flags.sort()).toEqual(['house_not_found', 'plz_mismatch']);
  });

  it('#5 Groß Grönau: street not found → PLZ-level, typed city picks the municipality', () => {
    const r = evaluateGeocode(known({ street: 'Am Mühlenteich', houseNumber: '7', postalCode: '23627', city: 'Groß Grönau' }), PLZ_23627, HITS_5);
    expect(r).toMatchObject({ precision: 'postcode', municipality: 'Groß Grönau', municipalityKey: '01053041', district: 'Herzogtum Lauenburg', stateCode: 'DE-SH', lat: null });
    expect(r.flags.sort()).toEqual(['plz_multiple_municipalities', 'street_not_found']);
  });
});

describe('evaluateGeocode — safety', () => {
  it('rejects a confident hit on a different street (Photon spike)', () => {
    const r = evaluateGeocode(known({ street: 'Osterstraße', houseNumber: '88', postalCode: '22765', city: 'Hamburg' }), PLZ_22765, WRONG_STREET_HIT);
    expect(r.precision).toBe('postcode');
    expect(r.flags).toContain('street_not_found');
  });
  it('flags a typed city that does not belong to the PLZ', () => {
    const r = evaluateGeocode(known({ street: 'Hauptstraße', houseNumber: '14', postalCode: '01067', city: 'Leipzig' }), PLZ_01067, HITS_1);
    expect(r.flags).toContain('city_plz_mismatch');
  });
  it('flags an unknown PLZ', () => {
    const r = evaluateGeocode(known({ street: 'Weg', postalCode: '99999', city: 'X' }), [], []);
    expect(r.flags).toEqual(expect.arrayContaining(['plz_not_found', 'street_not_found']));
    expect(r.precision).toBe('none');
  });
  it('short street names need an exact match (no "Am Born" = "Am Dorn")', () => {
    const hit = [{ ...HITS_1[0], address: { ...HITS_1[0].address, road: 'Am Dorn', postcode: '01067' } }];
    const r = evaluateGeocode(known({ street: 'Am Born', houseNumber: '14', postalCode: '01067', city: 'Dresden' }), PLZ_01067, hit);
    expect(r.flags).toContain('street_not_found');
  });
});

const COMBINING_DIAERESIS = String.fromCharCode(0x0308); // "u" + this = decomposed (NFD) "ü"
const EN_DASH = String.fromCharCode(0x2013);

const unknownAddr = (plotNote: string | null): GeoInput =>
  ({ addressUnknown: true, street: null, houseNumber: null, postalCode: null, city: null, plotNote });

describe('evaluateGeocode — A-1 cadastral_only', () => {
  it('"Flurstück 123/4, Gemarkung Wedel": address_unknown + cadastral_only, precision locality', () => {
    const r = evaluateGeocode(unknownAddr('Flurstück 123/4, Gemarkung Wedel'), null, HITS_WEDEL);
    expect(r.flags.sort()).toEqual(['address_unknown', 'cadastral_only']);
    expect(r).toMatchObject({ precision: 'locality', municipality: 'Wedel', stateCode: 'DE-SH' });
  });
  it.each(['FLURSTÜCK 5 in Wedel', 'Flurstueck 5 in Wedel', 'Gemarkung Wedel', 'Wedel, Flur 3', 'Wedel Flur12'])(
    'detects "%s"',
    (note) => expect(evaluateGeocode(unknownAddr(note), null, HITS_WEDEL).flags).toContain('cadastral_only'),
  );
  it('detects a decomposed (NFD) "Flurstück"', () => {
    expect(evaluateGeocode(unknownAddr(`Flurstu${COMBINING_DIAERESIS}ck 5 in Wedel`), null, HITS_WEDEL).flags).toContain('cadastral_only');
  });
  it('does not flag ordinary free text ("Am Flurweg 3", no plotNote)', () => {
    expect(evaluateGeocode(unknownAddr('Am Flurweg 3, Wedel'), null, HITS_WEDEL).flags).toEqual(['address_unknown']);
    expect(evaluateGeocode(unknownAddr(null), null, HITS_WEDEL).flags).toEqual(['address_unknown']);
    expect(evaluateGeocode(unknownAddr('Lindenweg 3, Neustadt'), null, HITS_2).flags.sort()).toEqual(['address_unknown', 'ambiguous']);
  });
  it('stays flagged without hits: precision none', () => {
    const r = evaluateGeocode(unknownAddr('Flurstück 123/4, Gemarkung Wedel'), null, []);
    expect(r.flags.sort()).toEqual(['address_unknown', 'cadastral_only']);
    expect(r.precision).toBe('none');
  });
  it('never applies to a known address', () => {
    const r = evaluateGeocode(known({ street: 'Hauptstraße', houseNumber: '14', postalCode: '01067', city: 'Dresden', plotNote: 'Flurstück 1' }), PLZ_01067, HITS_1);
    expect(r.flags).not.toContain('cadastral_only');
  });
});

describe('evaluateGeocode — M4 PLZ-aware best hit', () => {
  it('prefers the verified hit whose postcode equals the input PLZ (no plz_mismatch)', () => {
    const r = evaluateGeocode(known({ street: 'Osterstraße', houseNumber: '88', postalCode: '22765', city: 'Hamburg' }), PLZ_22765, HITS_OSTERSTRASSE_TWO_PLZ);
    expect(r.flags).not.toContain('plz_mismatch');
    expect(r.flags).toContain('house_not_found');
    expect(r).toMatchObject({ precision: 'street', foundPostcode: '22765', municipality: 'Hamburg', stateCode: 'DE-HH' });
    expect(r.lat).toBeCloseTo(53.553);
    expect(r.lon).toBeCloseTo(9.929);
  });
  it('among PLZ-matching hits, still prefers the house match', () => {
    const base = HITS_OSTERSTRASSE_TWO_PLZ[1];
    const hits = [
      { ...base, lat: '1', lon: '1' },
      { ...base, lat: '2', lon: '2', address: { ...base.address, house_number: '88' } },
    ];
    const r = evaluateGeocode(known({ street: 'Osterstraße', houseNumber: '88', postalCode: '22765', city: 'Hamburg' }), PLZ_22765, hits);
    expect(r).toMatchObject({ precision: 'house', lat: 2, lon: 2 });
    expect(r.flags).toEqual([]);
  });
  it('falls back to a house match (then verified[0]) when no hit has the input PLZ', () => {
    const r = evaluateGeocode(known({ street: 'Osterstraße', houseNumber: '88', postalCode: '22765', city: 'Hamburg' }), PLZ_22765, HITS_3);
    expect(r).toMatchObject({ precision: 'street', foundPostcode: '20255' });
    expect(r.flags.sort()).toEqual(['house_not_found', 'plz_mismatch']);
  });
  it('a multi-postcode hit "20095;20097" matches when one part equals the PLZ', () => {
    const hit = [{ ...HITS_1[0], address: { ...HITS_1[0].address, house_number: '14', postcode: '20095;20097' } }];
    const ok = evaluateGeocode(known({ street: 'Hauptstraße', houseNumber: '14', postalCode: '20097', city: 'Dresden' }), null, hit);
    expect(ok.flags).not.toContain('plz_mismatch');
    const bad = evaluateGeocode(known({ street: 'Hauptstraße', houseNumber: '14', postalCode: '22765', city: 'Dresden' }), null, hit);
    expect(bad.flags).toContain('plz_mismatch');
  });
  it('a multi-postcode hit wins over an earlier non-matching hit', () => {
    const first = HITS_OSTERSTRASSE_TWO_PLZ[0];
    const multi = { ...HITS_OSTERSTRASSE_TWO_PLZ[1], lat: '3', lon: '3', address: { ...HITS_OSTERSTRASSE_TWO_PLZ[1].address, postcode: '22763;22765' } };
    const r = evaluateGeocode(known({ street: 'Osterstraße', houseNumber: null, postalCode: '22765', city: 'Hamburg' }), PLZ_22765, [first, multi]);
    expect(r.lat).toBe(3);
    expect(r.flags).toEqual([]);
  });
});

describe('evaluateGeocode — A-3 house numbers', () => {
  const withHouse = (house_number: string) => [{ ...HITS_1[0], address: { ...HITS_1[0].address, house_number, postcode: '01067' } }];
  const run = (input: string | null, hit: string) =>
    evaluateGeocode(known({ street: 'Hauptstraße', houseNumber: input, postalCode: '01067', city: 'Dresden' }), PLZ_01067, withHouse(hit));

  it('input "14a" matches hit "14 A"', () => {
    const r = run('14a', '14 A');
    expect(r.precision).toBe('house');
    expect(r.flags).toEqual([]);
  });
  it('input "14 A" matches hit "14a"', () => expect(run('14 A', '14a').precision).toBe('house'));
  it('input "14-16" keeps the range and matches hit "14-16"', () => {
    const r = run('14-16', '14-16');
    expect(r.precision).toBe('house');
    expect(r.flags).toEqual([]);
  });
  it('separator variants of a range match ("14 - 16", en dash)', () => {
    expect(run('14 - 16', '14-16').precision).toBe('house');
    expect(run(`14${EN_DASH}16`, '14-16').precision).toBe('house');
  });
  it('input "14/1" matches hit "14/1" as a whole', () => expect(run('14/1', '14/1').precision).toBe('house'));
  it('input "14" vs hit "14-16" is conservative: street + house_not_found', () => {
    const r = run('14', '14-16');
    expect(r.precision).toBe('street');
    expect(r.flags).toEqual(['house_not_found']);
  });
  it('hit lists "14;16" / "14,16" / "14/16" are still split', () => {
    for (const hit of ['14;16', '14,16', '14/16']) {
      expect(run('16', hit).precision).toBe('house');
      expect(run('14', hit).precision).toBe('house');
    }
  });
});

describe('evaluateGeocode — A-5 / A-6 support', () => {
  it('A-5: unknown PLZ keeps the geocoded hit and flags plz_not_found', () => {
    const r = evaluateGeocode(known({ street: 'Hauptstraße', houseNumber: '14', postalCode: '99999', city: 'Dresden' }), [], HITS_1);
    expect(r.flags).toContain('plz_not_found');
    expect(r).toMatchObject({ precision: 'house', municipality: 'Dresden', stateCode: 'DE-SN' });
  });
  it('A-6: city/PLZ contradiction with a verified hit keeps municipality, state and precision from the hit', () => {
    const r = evaluateGeocode(known({ street: 'Hauptstraße', houseNumber: '14', postalCode: '01067', city: 'Leipzig' }), PLZ_01067, HITS_1);
    expect(r.flags).toContain('city_plz_mismatch');
    expect(r).toMatchObject({ precision: 'house', municipality: 'Dresden', stateCode: 'DE-SN', foundPostcode: '01097' });
    expect(r.lat).toBeCloseTo(51.0589555);
  });
});
