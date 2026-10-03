import { describe, it, expect } from 'vitest';
import { berlinDate, formatBerlin } from '@/lib/format';

describe('formatBerlin', () => {
  it('summer time (UTC+2)', () => expect(formatBerlin('2026-10-01T07:05:00Z')).toBe('01.10.2026 09:05'));
  it('winter time (UTC+1)', () => expect(formatBerlin('2026-11-02T07:05:00Z')).toBe('02.11.2026 08:05'));
  it('midnight is 00, not 24', () => expect(formatBerlin('2026-10-01T22:05:00Z')).toBe('02.10.2026 00:05'));
  it('null', () => expect(formatBerlin(null)).toBe(''));
});

describe('berlinDate (yyyy-mm-dd in Europe/Berlin)', () => {
  it('rolls over at Berlin midnight, not UTC midnight (summer, UTC+2)', () => expect(berlinDate(new Date('2026-10-03T23:30:00Z'))).toBe('2026-10-04'));
  it('stays on the same day before Berlin midnight', () => expect(berlinDate(new Date('2026-10-03T21:30:00Z'))).toBe('2026-10-03'));
  it('winter time (UTC+1)', () => expect(berlinDate(new Date('2026-11-02T23:30:00Z'))).toBe('2026-11-03'));
  it('pads month and day', () => expect(berlinDate(new Date('2026-01-05T10:00:00Z'))).toBe('2026-01-05'));
});
