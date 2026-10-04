import { describe, it, expect } from 'vitest';
import { ADDRESS_TEXT, AREA_TEXT, DEVICE_LABELS, geoFlagTexts, mailStatusLabel } from '@/lib/labels';
import { makeLeadRow } from '../fixtures/lead-row';

describe('mailStatusLabel (spec §20, E-2)', () => {
  const text = (o: Parameters<typeof makeLeadRow>[0]) => mailStatusLabel(makeLeadRow(o)).text;
  it('job states', () => {
    expect(text({ email_status: 'done' })).toBe('gesendet');
    expect(text({ email_status: 'sending' })).toBe('wird gesendet');
    expect(text({ email_status: 'pending' })).toBe('ausstehend');
  });
  it('failed shows the last error as tooltip', () => {
    expect(mailStatusLabel(makeLeadRow({ email_status: 'failed', email_last_error: 'brevo_429' }))).toMatchObject({ text: 'Mail fehlgeschlagen', title: 'brevo_429' });
  });
  it('skip reasons', () => {
    const skipped = (reason: string) => text({ email_status: 'skipped', email_skip_reason: reason });
    expect(skipped('no_mx')).toBe('Keine Mail – Domain ungültig');
    expect(skipped('test_domain')).toBe('Keine Mail – Testadresse');
    expect(skipped('throttled')).toBe('Übersprungen – bereits bestätigt');
    expect(skipped('too_late')).toBe('Übersprungen – zu spät');
    expect(skipped('rejected_by_provider')).toBe('Vom Mailanbieter abgelehnt');
    expect(skipped('spam')).toBe('Keine Mail – Spamverdacht');
  });
  it('unknown skip reason falls back with the reason as tooltip', () => {
    expect(mailStatusLabel(makeLeadRow({ email_status: 'skipped', email_skip_reason: 'mx_unknown' }))).toMatchObject({ text: 'übersprungen', title: 'mx_unknown' });
  });
});

describe('geoFlagTexts (A-1, A-6)', () => {
  it('cadastral parcel', () => {
    expect(geoFlagTexts(makeLeadRow({ geo_flags: ['address_unknown', 'cadastral_only'] }))).toEqual([
      'Adresse vom Interessenten nicht bekannt', 'Flurstück – Lage telefonisch klären',
    ]);
  });
  it('PLZ/street mismatch names the found postcode', () => {
    expect(geoFlagTexts(makeLeadRow({ geo_flags: ['plz_mismatch'], geo_found_postcode: '01097' }))).toEqual(['PLZ passt nicht zur Straße (gefunden: 01097)']);
  });
  it('city/PLZ mismatch shows both towns', () => {
    expect(geoFlagTexts(makeLeadRow({ geo_flags: ['city_plz_mismatch'], postal_code: '20095', city: 'München', geo_municipality: 'Hamburg' })))
      .toEqual(['Ort passt nicht zur PLZ (eingegeben: München, gefunden: Hamburg)']);
  });
  it('unknown flags pass through', () => expect(geoFlagTexts(makeLeadRow({ geo_flags: ['something_new'] }))).toEqual(['something_new']));
});

describe('ADDRESS_TEXT / AREA_TEXT (single source for badges and export)', () => {
  it('address quality wording', () => {
    expect(ADDRESS_TEXT).toEqual({
      house: 'Hausgenau', street: 'Straßengenau', postcode: 'Nur PLZ-genau', locality: 'Nur Ort', none: 'Nicht gefunden',
      ambiguous: 'Mehrdeutig', pending: 'Wird geprüft', 'n/a': '—',
    });
  });
  it('area verdict wording without distance', () => {
    expect(AREA_TEXT).toEqual({
      inside: 'Im Gebiet', edge: 'Randlage', outside: 'Außerhalb', unclear: 'Unklar – bitte prüfen', pending: 'Wird geprüft',
      failed: 'Prüfung fehlgeschlagen', 'n/a': '—',
    });
  });
});

describe('DEVICE_LABELS', () => {
  it('device type in German', () => expect(DEVICE_LABELS).toEqual({ mobile: 'Mobil', tablet: 'Tablet', desktop: 'Desktop', unknown: 'Unbekannt' }));
});
