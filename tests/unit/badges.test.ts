import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AddressMatch, AreaVerdict } from '@/components/badges';
import { deriveLeadViews } from '@/lib/leads/derive';
import { makeLeadRow } from '../fixtures/lead-row';

const text = (html: string) => html.replace(/<[^>]+>/g, '');
const area = (a: Parameters<typeof AreaVerdict>[0]['area']) => text(renderToStaticMarkup(createElement(AreaVerdict, { area: a })));
const address = (o: Parameters<typeof makeLeadRow>[0]) =>
  text(renderToStaticMarkup(createElement(AddressMatch, { lead: deriveLeadViews([makeLeadRow(o)], [], 'x')[0] })));

describe('AreaVerdict wording (shared with the export via lib/labels)', () => {
  it('verdicts without distance', () => {
    expect(area({ verdict: 'unclear' })).toBe('Unklar – bitte prüfen');
    expect(area({ verdict: 'pending' })).toBe('Wird geprüft');
    expect(area({ verdict: 'failed' })).toBe('Prüfung fehlgeschlagen');
    expect(area({ verdict: 'n/a' })).toBe('—');
  });
  it('a located verdict is followed by km and the nearest hub', () => {
    expect(area({ verdict: 'inside', hub: 'Lübeck', distanceKm: 12 })).toBe('Im Gebiet 12 km · Lübeck');
    expect(area({ verdict: 'edge', hub: 'Lübeck', distanceKm: 61 })).toBe('Randlage 61 km · Lübeck');
    expect(area({ verdict: 'outside', hub: 'Lübeck', distanceKm: 120 })).toBe('Außerhalb 120 km · Lübeck');
  });
});

describe('AddressMatch wording', () => {
  it('finished enrichment uses the shared quality texts', () => {
    expect(address({ enrichment_status: 'done', geo_precision: 'house' })).toBe('Hausgenau');
    expect(address({ enrichment_status: 'done', geo_precision: 'postcode' })).toBe('Nur PLZ-genau');
  });
  it('pending shows an ellipsis in the cell, spam a dash', () => {
    expect(address({})).toBe('…');
    expect(address({ enrichment_status: 'skipped' })).toBe('—');
  });
  it('flags add a warning sign', () => {
    expect(address({ enrichment_status: 'done', geo_precision: 'street', geo_flags: ['plz_mismatch'] })).toBe('Straßengenau ⚠');
  });
});
