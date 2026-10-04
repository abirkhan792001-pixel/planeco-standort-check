import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Home from '@/app/page';
import { NEXT_STEPS } from '@/components/landing/next-steps';

const html = renderToStaticMarkup(createElement(Home));
const text = (s: string) => s.replace(/<[^>]+>/g, '');

/** Every <img …> tag whose src is exactly `src`. Attribute order does not matter. */
const imgTags = (src: string) => (html.match(/<img[^>]*>/g) ?? []).filter((t) => t.includes(` src="${src}"`));
const imgTag = (src: string) => imgTags(src)[0] ?? '';

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

  it('shows the Planeco mark twice (header and above the form), decorative', () => {
    const tags = imgTags('/brand/planeco-mark.png');
    expect(tags).toHaveLength(2);
    for (const tag of tags) expect(tag).toContain('alt=""');
    expect(text(html)).toContain('planeco');
  });

  it('shows the Google, DGNB and Handwerk badges with German alt texts', () => {
    expect(imgTag('/brand/google-rating.png')).toContain('alt="Google-Bewertungen: 5 Sterne"');
    expect(imgTag('/brand/dgnb.png')).toContain('alt="Mitglied der DGNB"');
    expect(imgTag('/brand/das-handwerk.png')).toContain('alt="Das Handwerk – Die Wirtschaftsmacht von nebenan"');
  });

  it('bottom panel shows Planeco\'s claims, consistent with the next-working-day promise', () => {
    for (const claim of ['+ 10 Experten vor Ort', 'Rückruf am nächsten Werktag', '+ 15 Jahre Erfahrung']) expect(text(html)).toContain(claim);
    expect(text(html)).not.toMatch(/24\s*h/);
    for (const icon of ['icon-experts', 'icon-callback', 'icon-experience']) expect(imgTag(`/brand/${icon}.png`)).toContain('alt=""');
  });

  it('every brand file is in public/brand', () => {
    for (const f of ['planeco-mark', 'google-rating', 'dgnb', 'das-handwerk', 'icon-experts', 'icon-callback', 'icon-experience']) {
      expect(existsSync(path.resolve(process.cwd(), `public/brand/${f}.png`)), f).toBe(true);
    }
  });

  it('footer links the privacy page in a new tab, so a half-filled form survives', () => {
    const link = html.match(/<a (?=[^>]*\bhref="\/datenschutz")([^>]*)>Datenschutzhinweise<\/a>/)?.[0] ?? '';
    expect(link).not.toBe('');
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener"');
  });
});

describe('motion', () => {
  const css = readFileSync(path.resolve(process.cwd(), 'app/globals.css'), 'utf8');
  it('the draw-on animation is switched off for reduced motion', () =>
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.plot-draw\s*\{[^}]*animation:\s*none/));
});
