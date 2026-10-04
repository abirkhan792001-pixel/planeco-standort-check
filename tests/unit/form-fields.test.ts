import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FieldNote, PhoneIcon, SelectField, TextArea, TextField } from '@/components/form-ui';
import { GermanyMap } from '@/components/landing/germany-map';

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const text = (html: string) => html.replace(/<[^>]+>/g, '');

describe('floating-label fields (label inside the field, still a real <label>)', () => {
  it('TextField: input with a blank placeholder, then its label, inside one relative wrapper', () => {
    const html = render(createElement(TextField, { id: 'street', name: 'street', label: 'Straße', value: '', onChange: () => {} }));
    expect(html).toMatch(/<div class="relative[^"]*"><input[^>]*id="street"[^>]*placeholder=" "[^>]*name="street"[^>]*\/><label for="street"[^>]*>Straße<\/label><\/div>/);
    expect(html).toContain('peer');
  });

  it('TextField with an icon: decorative icon cell first, label shifted past it', () => {
    const html = render(createElement(TextField, { id: 'phone', name: 'phone', label: 'Telefonnummer', type: 'tel', icon: createElement(PhoneIcon), value: '', onChange: () => {} }));
    expect(html).toMatch(/<span aria-hidden="true"[^>]*><svg(?:(?!<span)[^])*<\/svg><\/span><input id="phone"/);
    expect(html).toMatch(/<label for="phone" class="[^"]*left-\[4\.5rem\]/);
  });

  it('error and hint notes carry the ids the inputs point to', () => {
    expect(render(createElement(FieldNote, { id: 'email', error: 'Bitte eine gültige E-Mail-Adresse angeben' })))
      .toMatch(/^<p id="email-error" class="[^"]*text-red-700[^"]*"><svg[^>]*aria-hidden="true"/);
    expect(render(createElement(FieldNote, { id: 'postalCode', hint: 'PLZ nicht gefunden – bitte prüfen.' }))).toMatch(/^<p id="postalCode-hint"/);
    expect(render(createElement(FieldNote, { id: 'x' }))).toBe('');
  });

  it('TextField shows its error under the field', () => {
    const html = render(createElement(TextField, { id: 'email', name: 'email', label: 'E-Mail-Adresse', error: 'Bitte eine gültige E-Mail-Adresse angeben', value: '', onChange: () => {} }));
    expect(text(html)).toContain('Bitte eine gültige E-Mail-Adresse angeben');
    expect(html).toContain('id="email-error"');
  });

  it('TextArea: textarea first, then its label', () => {
    const html = render(createElement(TextArea, { id: 'plotNote', name: 'plotNote', label: 'Weitere Angaben (optional), z. B. Flurstück', value: '', onChange: () => {} }));
    expect(html).toMatch(/<textarea id="plotNote" placeholder=" " name="plotNote"[^>]*><\/textarea><label for="plotNote"/);
  });

  it('SelectField: the label is always raised (a select has no placeholder state)', () => {
    // eslint-disable-next-line react/no-children-prop
    const html = render(createElement(SelectField, { id: 'city', name: 'city', label: 'Ort', value: '', onChange: () => {}, children: createElement('option', { value: '' }, 'Bitte wählen') }));
    expect(html).toMatch(/<select id="city" name="city"[^>]*><option value=""[^>]*>Bitte wählen<\/option><\/select><label for="city" class="[^"]*\btext-xs\b/);
  });
});

describe('GermanyMap', () => {
  it('is a decorative silhouette', () => expect(render(createElement(GermanyMap, { className: 'w-40' }))).toMatch(/^<svg viewBox="0 0 74.5 100" aria-hidden="true" class="w-40">/));
});
