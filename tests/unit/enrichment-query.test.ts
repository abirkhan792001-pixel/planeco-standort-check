import { describe, it, expect } from 'vitest';
import { buildStructuredQuery, buildUserAgent } from '@/lib/enrichment/query';
import { EnrichmentConfigError, enrichmentErrorCode } from '@/lib/enrichment/errors';

const addr = { street: 'Hauptstraße', houseNumber: '14', postalCode: '01067', city: 'Dresden' };

describe('buildStructuredQuery (A-5)', () => {
  it('sends postalcode only when the PLZ is known to OpenPLZ', () => {
    expect(buildStructuredQuery(addr, true)).toEqual({
      street: '14 Hauptstraße', postalcode: '01067', city: 'Dresden', country: 'de', limit: '5',
    });
    const unknown = buildStructuredQuery({ ...addr, postalCode: '99999' }, false);
    expect(unknown).toEqual({ street: '14 Hauptstraße', city: 'Dresden', country: 'de', limit: '5' });
    expect('postalcode' in unknown).toBe(false);
  });
  it('never sends an empty postalcode, even if "known"', () => {
    expect('postalcode' in buildStructuredQuery({ ...addr, postalCode: '' }, true)).toBe(false);
  });
  it('without a house number the street stands alone', () => {
    expect(buildStructuredQuery({ ...addr, houseNumber: null }, true).street).toBe('Hauptstraße');
  });
});

describe('buildUserAgent (I3)', () => {
  it('builds "standort-check-case/1.0 (+base; contact)"', () => {
    expect(buildUserAgent('https://example.test', 'ops@example.test')).toBe('standort-check-case/1.0 (+https://example.test; ops@example.test)');
  });
  it('trims the contact', () => {
    expect(buildUserAgent('https://example.test', '  ops@example.test \n')).toBe('standort-check-case/1.0 (+https://example.test; ops@example.test)');
  });
  it.each([undefined, '', '   ', '\r\n'])('throws a config error for a missing contact (%j)', (contact) => {
    let caught: unknown;
    try { buildUserAgent('https://example.test', contact); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(EnrichmentConfigError);
    expect(enrichmentErrorCode(caught)).toBe('config_missing_contact');
  });
  it('strips CR/LF from both parts (no header injection)', () => {
    const ua = buildUserAgent('https://example.test\r\nX-Evil: 1', 'ops@example.test\r\nX-Evil: 2');
    expect(ua).not.toMatch(/[\r\n]/);
    expect(ua.startsWith('standort-check-case/1.0 (+')).toBe(true);
  });
});
