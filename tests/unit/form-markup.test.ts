import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InputWithIcon, OptionCard, PhoneIcon, PillButton, ToggleChip } from '@/components/form-ui';
import { LeadForm } from '@/components/lead-form';
import { NEXT_STEPS } from '@/components/landing/next-steps';
import { PROJECT_ICONS } from '@/components/landing/project-icons';
import { PROJECT_TYPES } from '@/lib/leads/types';

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const text = (html: string) => html.replace(/<[^>]+>/g, '');
const noop = () => {};

/* eslint-disable react/no-children-prop -- OptionCard/ToggleChip/InputWithIcon require `children`; a .test.ts file has no JSX and createElement's types only accept it in props. */
describe('form-ui primitives', () => {
  it('OptionCard is a toggle button that reports its state', () => {
    const on = render(createElement(OptionCard, { active: true, onClick: noop, icon: null, children: 'Neubau' }));
    const off = render(createElement(OptionCard, { active: false, onClick: noop, icon: null, children: 'Neubau' }));
    expect(on).toMatch(/^<button type="button" aria-pressed="true"/);
    expect(off).toMatch(/^<button type="button" aria-pressed="false"/);
    expect(text(on)).toBe('Neubau');
  });

  it('ToggleChip is a toggle button', () => {
    expect(render(createElement(ToggleChip, { active: true, onClick: noop, children: 'abends' }))).toMatch(/^<button type="button" aria-pressed="true"/);
  });

  it('PillButton renders the sub-line only when given', () => {
    const withSub = render(createElement(PillButton, { type: 'submit', sub: 'kostenlos und unverbindlich' }, 'Kostenlosen Standort-Check anfordern'));
    const without = render(createElement(PillButton, { type: 'submit' }, 'Wird geladen …'));
    expect(text(withSub)).toBe('Kostenlosen Standort-Check anfordernkostenlos und unverbindlich');
    expect(text(without)).toBe('Wird geladen …');
  });

  it('InputWithIcon hides the icon from assistive tech', () => {
    const html = render(createElement(InputWithIcon, { icon: createElement(PhoneIcon), children: createElement('input', { id: 'x' }) }));
    expect(html).toMatch(/<span aria-hidden="true"[^>]*><svg/);
    expect(html).toContain('<input id="x"/>');
  });
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

describe('LeadForm markup keeps every behaviour hook (first render, before hydration)', () => {
  const html = render(createElement(LeadForm));

  it('posts, without native validation', () => {
    // React serializes the DOM property as `noValidate` and puts `method` after `class`; assert the tag, not attribute order.
    expect(html).toMatch(/^<form [^>]*\bmethod="post"/);
    expect(html).toMatch(/^<form [^>]*\bnoValidate=""/);
  });

  it.each(['postalCode', 'city', 'street', 'houseNumber', 'plotNote', 'firstName', 'lastName', 'phone', 'email', 'addressUnknown', 'website'])(
    'field name="%s" is present', (name) => expect(html).toContain(`name="${name}"`));

  it.each(['postalCode', 'city', 'street', 'houseNumber', 'plotNote', 'firstName', 'lastName', 'phone', 'email'])(
    'field %s has a visible label', (id) => expect(html).toContain(`<label for="${id}"`));

  it('chip groups keep their focus targets', () => {
    expect(html).toContain('data-field="projectType"');
    expect(html).toContain('data-field="reachability"');
  });

  it('five Vorhaben option cards and three reachability toggles, none pressed', () => {
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(8);
    for (const label of ['Neubau', 'Anbau', 'Umbau', 'Sanierung', 'Sonstiges', 'vormittags', 'nachmittags', 'abends']) {
      expect(text(html)).toContain(label);
    }
  });

  it('the submit button is disabled until hydrated and says so', () => {
    expect(html).toMatch(/<button type="submit" disabled=""/);
    expect(text(html)).toContain('Wird geladen …');
  });

  it('the honeypot stays hidden from people and assistive tech', () => {
    expect(html).toMatch(/<div aria-hidden="true" inert=""[^>]*><label for="website">/);
  });

  it('privacy notice text and link are unchanged', () => {
    expect(text(html)).toContain('Wir verwenden Ihre Angaben ausschließlich zur Bearbeitung Ihrer Anfrage. Details in unseren Datenschutzhinweisen.');
    expect(html).toMatch(/<a href="\/datenschutz" target="_blank" rel="noopener"/);
  });

  it('the phone field sits next to a decorative icon cell', () => {
    // The icon cell's <svg> must end right before the phone input (no other <span> in between).
    expect(html).toMatch(/<span aria-hidden="true"[^>]*><svg(?:(?!<span)[^])*<\/svg><\/span><input id="phone"[^>]*\btype="tel"/);
  });
});

describe('AA decisions stay applied', () => {
  const html = render(createElement(LeadForm));
  /** Whole-class list of the first element matching `pick`, split on whitespace (so `focus:ring-ink/25` never satisfies `focus:ring-ink`). */
  const classesOf = (tag: RegExp): string[] => (html.match(tag)?.[1] ?? '').split(/\s+/).filter(Boolean);
  const inactiveButtonClasses = (label: string): string[] => {
    const hit = [...html.matchAll(/<button type="button" aria-pressed="false" class="([^"]*)">([^]*?)<\/button>/g)].find((m) => text(m[2]).includes(label));
    return (hit?.[1] ?? '').split(/\s+/).filter(Boolean);
  };

  it('text fields show a full-strength ink focus ring and keep the outline in forced-colors mode', () => {
    const street = classesOf(/<input id="street"[^>]*\sclass="([^"]*)"/);
    expect(street).toContain('border-line');
    expect(street).toContain('focus:ring-ink');
    expect(street).toContain('focus:outline-hidden');
    expect(street).not.toContain('outline-none');
    expect(street).not.toContain('focus:outline-none');
    expect(street).not.toContain('focus:ring-ink/25');
  });

  it('the first inactive Vorhaben option card keeps the AA resting border', () =>
    expect(inactiveButtonClasses('Neubau')).toContain('border-line'));

  it('the first inactive reachability chip keeps the AA resting border', () =>
    expect(inactiveButtonClasses('vormittags')).toContain('border-line'));
});
