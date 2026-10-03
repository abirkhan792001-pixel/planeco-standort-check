import { describe, it, expect } from 'vitest';
import { applyFilters, sortRows, nextSort, DEFAULT_FILTERS, filtersFromSearchParams, filtersToSearchParams } from '@/lib/dashboard/filters';
import { CHANNEL_GROUPS } from '@/lib/attribution/types';
import { deriveLeadViews } from '@/lib/leads/derive';
import { makeLeadRow } from '../fixtures/lead-row';

const views = deriveLeadViews([
  makeLeadRow({ id: '1', created_at: '2026-10-01T08:00:00Z', last_name: 'Ahrens', status: 'neu' }),
  makeLeadRow({ id: '2', created_at: '2026-10-01T09:00:00Z', last_name: 'Beckmann', assigned_to: 'me', status: 'in_bearbeitung', gclid: 'g' }),
  makeLeadRow({ id: '3', duplicate_of: '1', last_name: 'Ahrens' }),
  makeLeadRow({ id: '4', spam_suspected: true, status: 'nicht_qualifiziert', disqualify_reason: 'spam' }),
  makeLeadRow({ id: '5', is_test: true, last_name: 'Klöpper', phone_raw: '0451 9988776' }),
  makeLeadRow({ id: '6', last_name: 'Lübeck', phone_raw: '+49 451 9988123', phone_e164: '+494519988123' }),
], [], 'x');

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe('applyFilters', () => {
  it('defaults: roots only, no spam, tests visible', () => expect(ids(applyFilters(views, DEFAULT_FILTERS, 'me'))).toEqual(['1', '2', '5', '6']));
  it('all submissions shows duplicates', () => expect(ids(applyFilters(views, { ...DEFAULT_FILTERS, allSubmissions: true }, 'me'))).toEqual(['1', '2', '3', '5', '6']));
  it('spam toggle', () => expect(ids(applyFilters(views, { ...DEFAULT_FILTERS, showSpam: true }, 'me'))).toContain('4'));
  it('mine / unassigned', () => {
    expect(ids(applyFilters(views, { ...DEFAULT_FILTERS, mine: true }, 'me'))).toEqual(['2']);
    expect(ids(applyFilters(views, { ...DEFAULT_FILTERS, unassigned: true }, 'me'))).toEqual(['1', '5', '6']);
  });
  it('hide tests', () => expect(ids(applyFilters(views, { ...DEFAULT_FILTERS, hideTest: true }, 'me'))).toEqual(['1', '2', '6']));
  it('search matches name (umlaut) and phone', () => {
    expect(ids(applyFilters(views, { ...DEFAULT_FILTERS, q: 'klöpper' }, 'me'))).toEqual(['5']);
    expect(ids(applyFilters(views, { ...DEFAULT_FILTERS, q: '9988776' }, 'me'))).toEqual(['5']);
  });
  it('national phone search ("0451 998") also finds the +49 form', () => {
    expect(ids(applyFilters(views, { ...DEFAULT_FILTERS, q: '0451 998' }, 'me'))).toEqual(['5', '6']);
    expect(ids(applyFilters(views, { ...DEFAULT_FILTERS, q: '0451 9988123' }, 'me'))).toEqual(['6']);
    expect(ids(applyFilters(views, { ...DEFAULT_FILTERS, q: '0049 451 9988123' }, 'me'))).toEqual(['6']);
  });
  it('status filter', () => expect(ids(applyFilters(views, { ...DEFAULT_FILTERS, statuses: ['in_bearbeitung'] }, 'me'))).toEqual(['2']));
  it('Kanal filter (channel group)', () => {
    expect(ids(applyFilters(views, { ...DEFAULT_FILTERS, channelGroup: 'Paid Search' }, 'me'))).toEqual(['2']);
    expect(ids(applyFilters(views, { ...DEFAULT_FILTERS, channelGroup: 'Direkt/Unbekannt' }, 'me'))).toEqual(['1', '5', '6']);
  });
  it('the channel group list covers every group', () => {
    expect(CHANNEL_GROUPS).toContain('Paid Search');
    expect(CHANNEL_GROUPS).toContain('Direkt/Unbekannt');
    expect(new Set(CHANNEL_GROUPS).size).toBe(10);
  });
});

describe('sortRows', () => {
  it('created_at desc by default', () => expect(sortRows(views.slice(0, 2), 'created_at', 'desc').map((r) => r.id)).toEqual(['2', '1']));
  it('name asc', () => expect(sortRows(views.slice(0, 2), 'name', 'asc').map((r) => r.last_name)).toEqual(['Ahrens', 'Beckmann']));

  const order = (rows: ReturnType<typeof deriveLeadViews>, key: Parameters<typeof sortRows>[1]) => sortRows(rows, key, 'asc').map((r) => r.id);

  it('Kontakt sorts by phone (national numbers normalised to +49)', () => {
    const rows = deriveLeadViews([
      makeLeadRow({ id: 'hh', phone_raw: '040 123456', phone_e164: '+4940123456' }),
      makeLeadRow({ id: 'hl', phone_raw: '0451 998877', phone_e164: null }),
      makeLeadRow({ id: 'b', phone_raw: '+49 30 1234567', phone_e164: '+49301234567' }),
    ], [], 'x');
    expect(order(rows, 'phone')).toEqual(['b', 'hh', 'hl']);
  });
  it('Adresse sorts by quality: house, street, postcode, locality, ambiguous, none, pending, n/a', () => {
    const done = { enrichment_status: 'done' as const };
    const rows = deriveLeadViews([
      makeLeadRow({ id: 'na', enrichment_status: 'skipped' }),
      makeLeadRow({ id: 'pending' }),
      makeLeadRow({ id: 'none', ...done, geo_precision: 'none' }),
      makeLeadRow({ id: 'ambiguous', ...done, geo_precision: 'none', geo_flags: ['ambiguous'] }),
      makeLeadRow({ id: 'locality', ...done, geo_precision: 'locality' }),
      makeLeadRow({ id: 'postcode', ...done, geo_precision: 'postcode' }),
      makeLeadRow({ id: 'street', ...done, geo_precision: 'street' }),
      makeLeadRow({ id: 'house', ...done, geo_precision: 'house' }),
    ], [], 'x');
    expect(order(rows, 'address')).toEqual(['house', 'street', 'postcode', 'locality', 'ambiguous', 'none', 'pending', 'na']);
  });
  it('Vorhaben sorts in form order, empty last', () => {
    const rows = deriveLeadViews([
      makeLeadRow({ id: 'none', project_type: null }),
      makeLeadRow({ id: 'san', project_type: 'sanierung' }),
      makeLeadRow({ id: 'neu', project_type: 'neubau' }),
    ], [], 'x');
    expect(order(rows, 'project')).toEqual(['neu', 'san', 'none']);
  });
  it('Erreichbarkeit sorts by earliest slot, empty last', () => {
    const rows = deriveLeadViews([
      makeLeadRow({ id: 'none', reachability: [] }),
      makeLeadRow({ id: 'abends', reachability: ['abends'] }),
      makeLeadRow({ id: 'vm-ab', reachability: ['abends', 'vormittags'] }),
      makeLeadRow({ id: 'vm', reachability: ['vormittags'] }),
      makeLeadRow({ id: 'nm', reachability: ['nachmittags'] }),
    ], [], 'x');
    expect(order(rows, 'reachability')).toEqual(['vm', 'vm-ab', 'nm', 'abends', 'none']);
  });
  it('Mail sorts by email status', () => {
    const rows = deriveLeadViews([
      makeLeadRow({ id: 'skipped', email_status: 'skipped', email_skip_reason: 'spam' }),
      makeLeadRow({ id: 'failed', email_status: 'failed' }),
      makeLeadRow({ id: 'pending', email_status: 'pending' }),
      makeLeadRow({ id: 'sending', email_status: 'sending' }),
      makeLeadRow({ id: 'done', email_status: 'done' }),
    ], [], 'x');
    expect(order(rows, 'mail')).toEqual(['done', 'sending', 'pending', 'failed', 'skipped']);
  });
  it('Anfragen sorts by group size', () => {
    const rows = deriveLeadViews([
      makeLeadRow({ id: 'big' }), makeLeadRow({ id: 'd1', duplicate_of: 'big' }), makeLeadRow({ id: 'd2', duplicate_of: 'big' }),
      makeLeadRow({ id: 'mid' }), makeLeadRow({ id: 'd3', duplicate_of: 'mid' }),
      makeLeadRow({ id: 'single' }),
    ], [], 'x').filter((r) => !r.duplicate_of);
    expect(order(rows, 'group')).toEqual(['single', 'mid', 'big']);
    expect(sortRows(rows, 'group', 'desc').map((r) => r.id)).toEqual(['big', 'mid', 'single']);
  });
});

describe('nextSort', () => {
  it('first click on a new column sorts ascending', () => {
    expect(nextSort({ sort: 'created_at', dir: 'desc' }, 'name')).toEqual({ sort: 'name', dir: 'asc' });
    expect(nextSort({ sort: 'name', dir: 'desc' }, 'mail')).toEqual({ sort: 'mail', dir: 'asc' });
  });
  it('Eingang starts newest first', () => expect(nextSort({ sort: 'name', dir: 'asc' }, 'created_at')).toEqual({ sort: 'created_at', dir: 'desc' }));
  it('a second click toggles the direction', () => {
    expect(nextSort({ sort: 'name', dir: 'asc' }, 'name')).toEqual({ sort: 'name', dir: 'desc' });
    expect(nextSort({ sort: 'created_at', dir: 'desc' }, 'created_at')).toEqual({ sort: 'created_at', dir: 'asc' });
  });
});

describe('search params round trip', () => {
  it('keeps every field', () => {
    const f = { ...DEFAULT_FILTERS, statuses: ['neu' as const], areas: ['inside' as const, 'failed' as const], channelGroup: 'Paid Social' as const, mine: true, q: 'x', sort: 'name' as const, dir: 'asc' as const };
    expect(filtersFromSearchParams(filtersToSearchParams(f))).toEqual(f);
  });
  it('accepts every column sort key', () => {
    for (const sort of ['created_at', 'name', 'phone', 'plot', 'area', 'address', 'project', 'reachability', 'channel', 'status', 'owner', 'mail', 'group'] as const) {
      expect(filtersFromSearchParams(filtersToSearchParams({ ...DEFAULT_FILTERS, sort })).sort).toBe(sort);
    }
  });
  it('drops an unknown channel group', () => {
    expect(filtersFromSearchParams(new URLSearchParams('channel=Evil')).channelGroup).toBeNull();
  });
});
