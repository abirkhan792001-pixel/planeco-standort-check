import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AddressBadge, AreaBadge } from '@/components/badges';
import { deriveLeadViews } from '@/lib/leads/derive';
import { makeLeadRow } from '../fixtures/lead-row';

const text = (html: string) => html.replace(/<[^>]+>/g, '');
const area = (a: Parameters<typeof AreaBadge>[0]['area']) => text(renderToStaticMarkup(createElement(AreaBadge, { area: a })));
const address = (o: Parameters<typeof makeLeadRow>[0]) =>
  text(renderToStaticMarkup(createElement(AddressBadge, { lead: deriveLeadViews([makeLeadRow(o)], [], 'x')[0] })));

describe('AreaBadge wording (shared with the export via lib/labels)', () => {
  it('verdicts without distance', () => {
    expect(area({ verdict: 'unclear' })).toBe('Unklar – bitte prüfen');
    expect(area({ verdict: 'pending' })).toBe('Wird geprüft');
    expect(area({ verdict: 'failed' })).toBe('Prüfung fehlgeschlagen');
    expect(area({ verdict: 'n/a' })).toBe('—');
  });
  it('inside and edge append hub and km', () => {
    expect(area({ verdict: 'inside', hub: 'Lübeck', distanceKm: 12 })).toBe('Im Gebiet · Lübeck 12 km');
    expect(area({ verdict: 'edge', hub: 'Lübeck', distanceKm: 61 })).toBe('Randlage · Lübeck 61 km');
  });
  it('outside names the nearest hub', () => {
    expect(area({ verdict: 'outside', hub: 'Lübeck', distanceKm: 120 })).toBe('Außerhalb · nächster Hub: Lübeck 120 km');
  });
});

describe('AddressBadge wording', () => {
  it('finished enrichment uses the shared quality texts', () => {
    expect(address({ enrichment_status: 'done', geo_precision: 'house' })).toBe('Hausgenau');
    expect(address({ enrichment_status: 'done', geo_precision: 'postcode' })).toBe('Nur PLZ-genau');
  });
  it('pending shows an ellipsis in the badge, spam a dash', () => {
    expect(address({})).toBe('…');
    expect(address({ enrichment_status: 'skipped' })).toBe('—');
  });
  it('flags add a warning sign', () => {
    expect(address({ enrichment_status: 'done', geo_precision: 'street', geo_flags: ['plz_mismatch'] })).toBe('Straßengenau ⚠');
  });
});
