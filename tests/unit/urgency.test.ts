import { describe, expect, it } from 'vitest';
import { REACHABILITY_HOURS } from '@/lib/labels';
import { REACHABILITY, type Reachability } from '@/lib/leads/types';
import { reachableUntil, REACHABILITY_WINDOWS, waitingTime } from '@/lib/dashboard/urgency';
import { makeLeadRow } from '../fixtures/lead-row';

// 2026-10-09 is in CEST (UTC+2): 08:00Z = 10:00 Berlin.
const at = (iso: string) => Date.parse(iso);
const created = '2026-10-09T08:00:00Z';

describe('waitingTime', () => {
  const wait = (o: Parameters<typeof makeLeadRow>[0], now: string) => waitingTime(makeLeadRow({ created_at: created, ...o }), at(now));

  it('counts minutes, hours, then days', () => {
    expect(wait({}, '2026-10-09T08:00:20Z')).toEqual({ text: 'gerade eingegangen', tone: 'grey' });
    expect(wait({}, '2026-10-09T08:12:00Z')).toEqual({ text: 'wartet 12 Min.', tone: 'grey' });
    expect(wait({}, '2026-10-09T13:30:00Z')).toEqual({ text: 'wartet 5 Std.', tone: 'grey' });
    expect(wait({}, '2026-10-12T09:00:00Z')).toEqual({ text: 'wartet 3 Tage', tone: 'red' });
  });
  it('turns ochre at 24 h and brick at 48 h', () => {
    expect(wait({}, '2026-10-10T07:59:00Z')?.tone).toBe('grey');
    expect(wait({}, '2026-10-10T08:00:00Z')).toEqual({ text: 'wartet 24 Std.', tone: 'amber' });
    expect(wait({}, '2026-10-11T08:00:00Z')).toEqual({ text: 'wartet 2 Tage', tone: 'red' });
  });
  it('only for leads that still need a first call', () => {
    const later = '2026-10-12T08:00:00Z';
    expect(wait({ assigned_to: 'u1' }, later)).toBeNull();
    expect(wait({ status: 'in_bearbeitung' }, later)).toBeNull();
    expect(wait({ duplicate_of: 'root' }, later)).toBeNull();
    expect(wait({ spam_suspected: true }, later)).toBeNull();
  });
  it('a clock behind created_at never shows negative time', () => {
    expect(wait({}, '2026-10-09T07:59:00Z')?.text).toBe('gerade eingegangen');
  });
});

describe('reachableUntil (Berlin wall-clock)', () => {
  const until = (reachability: Reachability[], now: string, status: 'neu' | 'gewonnen' = 'neu') =>
    reachableUntil(makeLeadRow({ reachability, status }), at(now));

  it('inside a chosen window returns its end hour', () => {
    expect(until(['vormittags'], '2026-10-09T08:00:00Z')).toBe(12); // 10:00
    expect(until(['abends'], '2026-10-09T16:30:00Z')).toBe(20); // 18:30
  });
  it('window ends are exclusive and other windows do not count', () => {
    expect(until(['vormittags'], '2026-10-09T10:00:00Z')).toBeNull(); // 12:00
    expect(until(['nachmittags'], '2026-10-09T08:00:00Z')).toBeNull(); // 10:00
    expect(until([], '2026-10-09T08:00:00Z')).toBeNull();
  });
  it('adjacent windows run together', () => {
    expect(until(['vormittags', 'nachmittags'], '2026-10-09T08:00:00Z')).toBe(17);
    expect(until(['abends', 'vormittags', 'nachmittags'], '2026-10-09T08:00:00Z')).toBe(20);
  });
  it('uses Berlin time in winter too (CET, UTC+1)', () => {
    expect(until(['vormittags'], '2026-12-01T07:30:00Z')).toBe(12); // 08:30
    expect(until(['vormittags'], '2026-12-01T06:30:00Z')).toBeNull(); // 07:30
  });
  it('closed leads are never "reachable now"', () => {
    expect(until(['vormittags'], '2026-10-09T08:00:00Z', 'gewonnen')).toBeNull();
  });
  it('windows match the hours the form shows', () => {
    for (const s of REACHABILITY) {
      const [from, to] = REACHABILITY_WINDOWS[s];
      expect(REACHABILITY_HOURS[s]).toBe(`${from}–${to} Uhr`);
    }
  });
});
