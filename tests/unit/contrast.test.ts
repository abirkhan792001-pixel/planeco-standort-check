import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.resolve(process.cwd(), 'app/globals.css'), 'utf8');

function token(name: string): string {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!m) throw new Error(`--color-${name} missing in app/globals.css`);
  return m[1];
}

/** WCAG 2.x relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = '#FFFFFF';

describe('contrast helper', () => {
  it('black on white is 21:1', () => expect(contrast('#000000', WHITE)).toBeCloseTo(21, 5));
  it('#777777 on white is just under AA', () => expect(contrast('#777777', WHITE)).toBeCloseTo(4.48, 2));
  it('a missing token fails loudly', () => expect(() => token('does-not-exist')).toThrow(/missing/));
});

describe('brand tokens meet WCAG AA (spec §3.1)', () => {
  it.each([
    ['ink on cream', 'ink', 'cream'],
    ['ink on paper', 'ink', 'paper'],
    ['muted on cream', 'muted', 'cream'],
  ])('%s ≥ 4.5', (_label, fg, bg) => expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5));

  it('ink on white ≥ 4.5', () => expect(contrast(token('ink'), WHITE)).toBeGreaterThanOrEqual(4.5));
  it('muted on white ≥ 4.5', () => expect(contrast(token('muted'), WHITE)).toBeGreaterThanOrEqual(4.5));
  it('white CTA text on terracotta-deep ≥ 4.5', () => expect(contrast(WHITE, token('terracotta-deep'))).toBeGreaterThanOrEqual(4.5));
  it('terracotta-deep headline accent on cream ≥ 3 (large text)', () =>
    expect(contrast(token('terracotta-deep'), token('cream'))).toBeGreaterThanOrEqual(3));
  it('brand terracotta is NOT safe for text (why terracotta-deep exists)', () =>
    expect(contrast(WHITE, token('terracotta'))).toBeLessThan(3));
});
