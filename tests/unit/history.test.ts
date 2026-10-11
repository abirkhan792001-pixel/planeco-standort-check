import { describe, expect, it } from 'vitest';
import { buildHistory, describeEvent, type LeadEvent } from '@/lib/dashboard/history';

const names = new Map([['u1', 'Vertrieb A'], ['u2', 'Vertrieb B']]);
let next = 1;
const ev = (type: string, data: Record<string, unknown> = {}, o: Partial<LeadEvent> = {}): LeadEvent =>
  ({ id: next++, lead_id: 'root', created_at: '2026-10-09T08:00:00Z', actor_id: null, type, data, ...o });
const text = (e: LeadEvent) => describeEvent(e, names).text;

describe('describeEvent', () => {
  it('sales steps name the person', () => {
    expect(describeEvent(ev('claimed', { previous_owner: null }, { actor_id: 'u1' }), names)).toMatchObject({ text: 'Übernommen', actor: 'Vertrieb A', kind: 'sales' });
    expect(text(ev('claim_forced', { previous_owner: 'u2' }, { actor_id: 'u1' }))).toBe('Übernommen von Vertrieb B');
    expect(text(ev('released', {}, { actor_id: 'u1' }))).toBe('Freigegeben');
  });
  it('status changes use the German labels and the reason', () => {
    expect(text(ev('status_changed', { from: 'in_bearbeitung', to: 'qualifiziert', reason: null }))).toBe('Status In Bearbeitung → Qualifiziert');
    expect(text(ev('status_changed', { from: 'neu', to: 'nicht_qualifiziert', reason: 'kein_bedarf' }))).toBe('Status Neu → Nicht qualifiziert (Kein Bedarf)');
  });
  it('notes: changed or deleted', () => {
    expect(text(ev('note_changed', { length: 12 }))).toBe('Notiz geändert');
    expect(text(ev('note_changed', { length: 0 }))).toBe('Notiz gelöscht');
  });
  it('system events: intake, repeat, mail, address check', () => {
    expect(describeEvent(ev('created', { spam: false, test: true }), names)).toMatchObject({ text: 'Anfrage eingegangen', actor: null, kind: 'system' });
    expect(text(ev('created', { spam: true }))).toBe('Anfrage eingegangen · Spamverdacht');
    expect(text(ev('duplicate_linked', { root: 'root', reasons: ['email', 'phone'] }))).toBe('Erneut angefragt (gleiche E-Mail, Telefonnummer)');
    expect(text(ev('email_sent', { messageId: 'x' }))).toBe('Bestätigungsmail gesendet');
    expect(text(ev('email_skipped', { reason: 'test_domain' }))).toBe('Keine Mail – Testadresse');
    expect(text(ev('enriched', { precision: 'house', flags: [] }))).toBe('Adresse geprüft: Hausgenau');
  });
  it('failed jobs are problems', () => {
    expect(describeEvent(ev('email_failed', { error: 'x' }), names).kind).toBe('problem');
    expect(describeEvent(ev('enrichment_failed', { error: 'x' }), names)).toMatchObject({ text: 'Adressprüfung fehlgeschlagen', kind: 'problem' });
  });
  it('unknown actors and types degrade gracefully', () => {
    expect(describeEvent(ev('claimed', {}, { actor_id: 'gone' }), names).actor).toBe('Unbekannt');
    expect(text(ev('something_new'))).toBe('something_new');
  });
});

describe('buildHistory', () => {
  it('newest first; duplicates contribute only their "asked again" event', () => {
    const events = [
      ev('created', {}, { created_at: '2026-10-09T08:00:00Z' }),
      ev('claimed', {}, { created_at: '2026-10-09T09:00:00Z', actor_id: 'u1' }),
      ev('created', {}, { lead_id: 'dup', created_at: '2026-10-10T08:00:00Z' }),
      ev('duplicate_linked', { reasons: ['email'] }, { lead_id: 'dup', created_at: '2026-10-10T08:00:00Z' }),
      ev('email_skipped', { reason: 'throttled' }, { lead_id: 'dup', created_at: '2026-10-10T08:00:01Z' }),
    ];
    expect(buildHistory(events, 'root', names).map((h) => h.text)).toEqual(['Erneut angefragt (gleiche E-Mail)', 'Übernommen', 'Anfrage eingegangen']);
  });
  it('same timestamp keeps insert order (later id first)', () => {
    const at = '2026-10-09T08:00:00Z';
    const events = [ev('created', {}, { created_at: at }), ev('email_sent', {}, { created_at: at })];
    expect(buildHistory(events, 'root', names).map((h) => h.text)).toEqual(['Bestätigungsmail gesendet', 'Anfrage eingegangen']);
  });
});
