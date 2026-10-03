import { describe, it, expect } from 'vitest';
import { applyFilters, sortRows, DEFAULT_FILTERS, filtersFromSearchParams, filtersToSearchParams } from '@/lib/dashboard/filters';
import { deriveLeadViews } from '@/lib/leads/derive';
import { makeLeadRow } from '../fixtures/lead-row';

const views = deriveLeadViews([
  makeLeadRow({ id: '1', created_at: '2026-10-01T08:00:00Z', last_name: 'Ahrens', status: 'neu' }),
  makeLeadRow({ id: '2', created_at: '2026-10-01T09:00:00Z', last_name: 'Beckmann', assigned_to: 'me', status: 'in_bearbeitung' }),
  makeLeadRow({ id: '3', duplicate_of: '1', last_name: 'Ahrens' }),
  makeLeadRow({ id: '4', spam_suspected: true, status: 'nicht_qualifiziert', disqualify_reason: 'spam' }),
  makeLeadRow({ id: '5', is_test: true, last_name: 'Klöpper', phone_raw: '0451 9988776' }),
], [], 'x');

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe('applyFilters', () => {
  it('defaults: roots only, no spam, tests visible', () => expect(ids(applyFilters(views, DEFAULT_FILTERS, 'me'))).toEqual(['1', '2', '5']));
  it('all submissions shows duplicates', () => expect(ids(applyFilters(views, { ...DEFAULT_FILTERS, allSubmissions: true }, 'me'))).toEqual(['1', '2', '3', '5']));
  it('spam toggle', () => expect(ids(applyFilters(views, { ...DEFAULT_FILTERS, showSpam: true }, 'me'))).toContain('4'));
  it('mine / unassigned', () => {
    expect(ids(applyFilters(views, { ...DEFAULT_FILTERS, mine: true }, 'me'))).toEqual(['2']);
    expect(ids(applyFilters(views, { ...DEFAULT_FILTERS, unassigned: true }, 'me'))).toEqual(['1', '5']);
  });
  it('hide tests', () => expect(ids(applyFilters(views, { ...DEFAULT_FILTERS, hideTest: true }, 'me'))).toEqual(['1', '2']));
  it('search matches name (umlaut) and phone', () => {
    expect(ids(applyFilters(views, { ...DEFAULT_FILTERS, q: 'klöpper' }, 'me'))).toEqual(['5']);
    expect(ids(applyFilters(views, { ...DEFAULT_FILTERS, q: '9988776' }, 'me'))).toEqual(['5']);
  });
  it('status filter', () => expect(ids(applyFilters(views, { ...DEFAULT_FILTERS, statuses: ['in_bearbeitung'] }, 'me'))).toEqual(['2']));
});

describe('sortRows', () => {
  it('created_at desc by default', () => expect(sortRows(views.slice(0, 2), 'created_at', 'desc').map((r) => r.id)).toEqual(['2', '1']));
  it('name asc', () => expect(sortRows(views.slice(0, 2), 'name', 'asc').map((r) => r.last_name)).toEqual(['Ahrens', 'Beckmann']));
});

describe('search params round trip', () => {
  it('keeps every field', () => {
    const f = { ...DEFAULT_FILTERS, statuses: ['neu' as const], areas: ['inside' as const], mine: true, q: 'x', sort: 'name' as const, dir: 'asc' as const };
    expect(filtersFromSearchParams(filtersToSearchParams(f))).toEqual(f);
  });
});
