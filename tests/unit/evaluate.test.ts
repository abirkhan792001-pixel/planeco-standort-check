import { describe, it, expect } from 'vitest';
import { evaluateGeocode, type GeoInput } from '@/lib/enrichment/evaluate';
import { HITS_1, HITS_2, HITS_3, HITS_5, PLZ_01067, PLZ_22765, PLZ_23627, WRONG_STREET_HIT } from '../fixtures/geo';

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
