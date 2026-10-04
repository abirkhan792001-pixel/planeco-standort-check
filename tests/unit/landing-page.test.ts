import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Home from '@/app/page';
import { NEXT_STEPS } from '@/components/landing/next-steps';

const html = renderToStaticMarkup(createElement(Home));
const text = (s: string) => s.replace(/<[^>]+>/g, '');

describe('landing page (/)', () => {
  it('keeps the prototype banner', () =>
    expect(text(html)).toContain('Case-Study-Prototyp – keine offizielle Seite der Planeco Building GmbH'));

  it('headline reads as one sentence with the accent word', () => {
    const h1 = html.match(/<h1[^>]*>([^]*?)<\/h1>/)?.[1] ?? '';
    expect(text(h1)).toBe('Kostenloser Standort-Check für Ihr Grundstück.');
    expect(h1).toContain('text-terracotta-deep');
  });

  it('both calls to action jump to the form', () => {
    expect(html.match(/href="#formular"/g)).toHaveLength(2);
    expect(html).toContain('id="formular"');
    expect(text(html)).toContain('Kostenlos anfragen');
    expect(text(html)).toContain('Jetzt Standort prüfen');
  });

  it('shows the three steps in order as a list', () => {
    const ol = html.match(/<ol[^>]*>([^]*?)<\/ol>/)?.[1] ?? '';
    const items = [...ol.matchAll(/<li[^>]*>([^]*?)<\/li>/g)].map((m) => text(m[1]).replace(/^\d/, ''));
    expect(items).toEqual([...NEXT_STEPS]);
  });

  it('renders the site-plan illustration as one labelled image', () =>
    expect(html).toMatch(/<svg[^>]*role="img"[^>]*aria-label="Skizze eines Grundstücks mit Standort-Markierung"/));

  it('renders the form', () => expect(html).toContain('name="postalCode"'));

  it('trust strip makes only claims the prototype keeps', () => {
    for (const claim of ['Kostenlos & unverbindlich', 'Rückruf meist am nächsten Werktag', 'Prüfung von Lage & Genehmigung']) {
      expect(text(html).replace(/&amp;/g, '&')).toContain(claim);
    }
    for (const borrowed of ['DGNB', 'Google', 'Handwerk', 'Jahre Erfahrung', 'Experten']) expect(text(html)).not.toContain(borrowed);
  });

  it('footer links the privacy page', () => expect(html).toMatch(/<a href="\/datenschutz"[^>]*>Datenschutzhinweise<\/a>/));
});

describe('motion', () => {
  const css = readFileSync(path.resolve(process.cwd(), 'app/globals.css'), 'utf8');
  it('the draw-on animation is switched off for reduced motion', () =>
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.plot-draw\s*\{[^}]*animation:\s*none/));
});
