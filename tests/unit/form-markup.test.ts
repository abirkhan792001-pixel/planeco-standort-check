import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OptionCard, PillButton, ToggleChip } from '@/components/form-ui';
import { LeadForm } from '@/components/lead-form';
import { NEXT_STEPS } from '@/components/landing/next-steps';
import { PROJECT_ICONS } from '@/components/landing/project-icons';
import { PROJECT_TYPES } from '@/lib/leads/types';

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const text = (html: string) => html.replace(/<[^>]+>/g, '');
const noop = () => {};
const form = (step: 1 | 2 | 3) => render(createElement(LeadForm, { step, active: true, onStep: noop }));

/* eslint-disable react/no-children-prop -- createElement needs children in props for the required-children types */
describe('form-ui primitives', () => {
  it('OptionCard is a toggle button that reports its state', () => {
    const on = render(createElement(OptionCard, { active: true, onClick: noop, icon: null, children: 'Neubau' }));
    const off = render(createElement(OptionCard, { active: false, onClick: noop, icon: null, children: 'Neubau' }));
    expect(on).toMatch(/^<button type="button" aria-pressed="true"/);
    expect(off).toMatch(/^<button type="button" aria-pressed="false"/);
    expect(text(on)).toBe('Neubau');
  });
  it('ToggleChip is a toggle button', () =>
    expect(render(createElement(ToggleChip, { active: true, onClick: noop, children: 'abends' }))).toMatch(/^<button type="button" aria-pressed="true"/));
  it('PillButton renders only its label (no sub-line any more)', () =>
    expect(text(render(createElement(PillButton, { type: 'submit', children: 'Kostenlosen Standort-Check anfordern' })))).toBe('Kostenlosen Standort-Check anfordern'));
});
/* eslint-enable react/no-children-prop */

describe('project icons and next steps', () => {
  it('every project type has an icon', () => {
    for (const t of PROJECT_TYPES) expect(render(PROJECT_ICONS[t])).toMatch(/^<svg[^>]*aria-hidden="true"/);
  });
  it('next steps are the parent-spec §11 header lines, in order', () =>
    expect(NEXT_STEPS).toEqual([
      'Grundstück und Kontaktdaten eintragen',
      'Wir prüfen Lage und Genehmigungssituation',
      'Wir rufen Sie zurück – in der Regel am nächsten Werktag',
    ]));
});

describe('LeadForm steps (first render, before hydration)', () => {
  it.each([1, 2, 3] as const)('step %i posts without native validation, shows its progress and keeps the honeypot', (s) => {
    const html = form(s);
    // React 19 hoists the priority logo's <link rel="preload"> in front of the form, and serialises noValidate in camelCase.
    const formTag = html.match(/<form[^>]*>/)?.[0] ?? '';
    expect(formTag).toContain('method="post"');
    expect(formTag).toMatch(/novalidate=""/i);
    expect(text(html)).toContain(`Schritt ${s} von 3`);
    expect(html).toMatch(/<div aria-hidden="true" inert=""[^>]*><label for="website">/);
    expect(html).not.toContain('border-l-4'); // the old alert-box style is gone
  });

  it('each step asks its question as the page heading', () => {
    expect(form(1)).toMatch(/<h1 id="step-title"[^>]*>Worum geht es bei Ihrem Vorhaben\?<\/h1>/);
    expect(form(2)).toMatch(/<h1 id="step-title"[^>]*>Wo liegt Ihr Grundstück\?<\/h1>/);
    expect(form(3)).toMatch(/<h1 id="step-title"[^>]*>Wie erreichen wir Sie\?<\/h1>/);
  });

  it('step 1: five project cards, nothing to submit yet', () => {
    const html = form(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(5);
    expect(html).toContain('data-field="projectType"');
    expect(html).not.toContain('type="submit"');
  });

  it('step 2: only the plot fields, floating labels, Germany map, Weiter disabled until hydrated', () => {
    const html = form(2);
    for (const n of ['addressUnknown', 'postalCode', 'city', 'street', 'houseNumber', 'plotNote']) expect(html).toContain(`name="${n}"`);
    for (const n of ['firstName', 'email', 'phone']) expect(html).not.toContain(`name="${n}"`);
    expect(html).toMatch(/<input id="street" placeholder=" "[^>]*\/><label for="street"/);
    expect(html).toContain('<svg viewBox="0 0 74.5 100" aria-hidden="true"');
    expect(html).toMatch(/<button type="submit" disabled=""[^>]*>Wird geladen …<\/button>/);
  });

  it('step 3: contact fields, phone icon cell, reachability with hours, privacy notice, badges', () => {
    const html = form(3);
    for (const n of ['firstName', 'lastName', 'email', 'phone']) expect(html).toContain(`name="${n}"`);
    expect(html).not.toContain('name="street"');
    expect(html).toMatch(/<span aria-hidden="true"[^>]*><svg(?:(?!<span)[^])*<\/svg><\/span><input id="phone"[^>]*type="tel"/);
    for (const chip of ['vormittags · 8–12 Uhr', 'nachmittags · 12–17 Uhr', 'abends · 17–20 Uhr']) expect(text(html)).toContain(chip);
    expect(text(html)).toContain('Wir verwenden Ihre Angaben ausschließlich zur Bearbeitung Ihrer Anfrage. Details in unseren Datenschutzhinweisen.');
    expect(html).toMatch(/<a href="\/datenschutz" target="_blank" rel="noopener"/);
    expect(text(html)).not.toContain('kostenlos und unverbindlich');
    expect(html).toContain('alt="Mitglied der DGNB"');
  });
});

describe('AA decisions stay applied', () => {
  const classesOf = (html: string, tag: RegExp): string[] => (html.match(tag)?.[1] ?? '').split(/\s+/).filter(Boolean);

  it('text fields show a full-strength ink focus ring and keep the outline in forced-colors mode', () => {
    const cls = classesOf(form(2), /<input id="street"[^>]*class="([^"]*)"/);
    expect(cls).toEqual(expect.arrayContaining(['border-line', 'focus:ring-ink', 'focus:outline-hidden']));
    expect(cls).not.toContain(['focus', 'ring-ink/25'].join(':'));
    expect(cls).not.toContain(['focus', 'outline-none'].join(':'));
  });
  it('the first inactive Vorhaben card keeps the AA resting border', () =>
    expect(classesOf(form(1), /<button type="button" aria-pressed="false" class="([^"]*)"/)).toContain('border-line'));
  it('the first inactive reachability chip keeps the AA resting border', () =>
    expect(classesOf(form(3), /<button type="button" aria-pressed="false" class="([^"]*)"/)).toContain('border-line'));
});
