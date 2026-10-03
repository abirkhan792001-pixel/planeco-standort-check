import { describe, it, expect } from 'vitest';
import { formatBerlin } from '@/lib/format';

describe('formatBerlin', () => {
  it('summer time (UTC+2)', () => expect(formatBerlin('2026-10-01T07:05:00Z')).toBe('01.10.2026 09:05'));
  it('winter time (UTC+1)', () => expect(formatBerlin('2026-11-02T07:05:00Z')).toBe('02.11.2026 08:05'));
  it('midnight is 00, not 24', () => expect(formatBerlin('2026-10-01T22:05:00Z')).toBe('02.10.2026 00:05'));
  it('null', () => expect(formatBerlin(null)).toBe(''));
});
