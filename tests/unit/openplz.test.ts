import { describe, it, expect } from 'vitest';
import { toLocalitySummary } from '@/lib/enrichment/openplz';
import { PLZ_23627, PLZ_22765 } from '../fixtures/geo';

describe('toLocalitySummary', () => {
  it('maps OpenPLZ to our summary with ISO state codes', () => {
    expect(toLocalitySummary(PLZ_23627[0])).toEqual({
      name: 'Groß Grönau', municipality: 'Groß Grönau', municipalityKey: '01053041', district: 'Herzogtum Lauenburg', stateCode: 'DE-SH',
    });
  });
  it('handles Hamburg (no district)', () => {
    expect(toLocalitySummary(PLZ_22765[0])).toMatchObject({ name: 'Hamburg', district: null, stateCode: 'DE-HH' });
  });
});
