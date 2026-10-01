import { describe, it, expect } from 'vitest';
import {
  normalizeEmail, normalizePhone, normalizeStreet, normalizeHouseNumber, buildAddressKey, foldGerman, normalizePlace,
} from '@/lib/leads/normalize';

describe('normalizePhone (case samples)', () => {
  it.each([
    ['+49 40 / 123 456', '+4940123456'],
    ['004940123456', '+4940123456'],
    ['0170 5551234', '+491705551234'],
    ['040 55512345', '+494055512345'],
    ['0451 9988776', '+494519988776'],
  ])('%s → %s', (raw, e164) => {
    expect(normalizePhone(raw).e164).toBe(e164);
  });

  it('treats samples #1 and #4 as the same number', () => {
    expect(normalizePhone('+49 40 / 123 456').e164).toBe(normalizePhone('004940123456').e164);
  });

  it('returns null for fewer than 6 digits', () => {
    expect(normalizePhone('12345')).toEqual({ e164: null, valid: false });
  });

  it('never throws on garbage', () => {
    expect(normalizePhone('abc').e164).toBeNull();
  });

  it('strips extension markers before processing', () => {
    expect(normalizePhone('040 123456 ext. 12').e164).toBe('+4940123456');
    expect(normalizePhone('040123456 x12').e164).toBe('+4940123456');
    expect(normalizePhone('040 123456 Durchwahl 12').e164).toBe('+4940123456');
    expect(normalizePhone('040 123456 DW 12').e164).toBe('+4940123456');
  });

  it('preserves hyphens in normal phone number formatting', () => {
    expect(normalizePhone('(040) 55-51-23-45').e164).toBe('+494055512345');
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases', () => expect(normalizeEmail('  Thomas.Ahrens@GMX.de ')).toBe('thomas.ahrens@gmx.de'));
});

describe('normalizeStreet', () => {
  it.each(['Osterstraße', 'Osterstr.', 'osterstrasse', 'Oster Straße', 'Osterstr'])('%s → osterstrasse', (s) => {
    expect(normalizeStreet(s)).toBe('osterstrasse');
  });
  it('does not touch "str" inside a word', () => expect(normalizeStreet('Strandweg')).toBe('strandweg'));
  it('folds umlauts', () => expect(normalizeStreet('Am Mühlenteich')).toBe('ammuehlenteich'));
  it('handles "str." before digits', () => expect(normalizeStreet('Hauptstr.14')).toBe('hauptstrasse14'));
  it('handles "str." before punctuation', () => expect(normalizeStreet('Hauptstr./Ecke')).toBe('hauptstrasseecke'));
  it('handles "Strandstraße" normalization', () => expect(normalizeStreet('Strandstraße')).toBe('strandstrasse'));
  it('handles decomposed umlauts with NFC normalization', () => {
    // Create decomposed ü (u + combining diaeresis)
    const decomposed = 'Mühlenweg';
    expect(normalizeStreet(decomposed)).toBe('muehlenweg');
  });
});

describe('normalizeHouseNumber', () => {
  it('lowercases and removes spaces', () => expect(normalizeHouseNumber(' 14 A ')).toBe('14a'));
});

describe('buildAddressKey', () => {
  it('builds a stable key', () => {
    expect(buildAddressKey({ street: 'Hauptstraße', houseNumber: '14', postalCode: '01067', addressUnknown: false }))
      .toBe('hauptstrasse|14|01067');
  });
  it('is null when the address is unknown or incomplete', () => {
    expect(buildAddressKey({ street: 'x', houseNumber: '1', postalCode: '01067', addressUnknown: true })).toBeNull();
    expect(buildAddressKey({ street: '', houseNumber: '1', postalCode: '01067', addressUnknown: false })).toBeNull();
    expect(buildAddressKey({ street: 'Weg', houseNumber: '1', postalCode: '', addressUnknown: false })).toBeNull();
  });
  it('builds the same key for "Hauptstr." as for "Hauptstraße"', () => {
    const key1 = buildAddressKey({ street: 'Hauptstr.', houseNumber: '14', postalCode: '01067', addressUnknown: false });
    const key2 = buildAddressKey({ street: 'Hauptstraße', houseNumber: '14', postalCode: '01067', addressUnknown: false });
    expect(key1).toBe(key2);
    expect(key1).toBe('hauptstrasse|14|01067');
  });
});

describe('foldGerman / normalizePlace', () => {
  it('folds ß and umlauts', () => expect(foldGerman('Groß Grönau')).toBe('gross groenau'));
  it('normalizes places for comparison', () => expect(normalizePlace('Groß  Grönau')).toBe('grossgroenau'));
});
