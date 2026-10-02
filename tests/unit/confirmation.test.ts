import { describe, it, expect } from 'vitest';
import { renderConfirmation, shouldSendConfirmation, escapeHtml, canAttemptEmail } from '@/lib/email/confirmation';
import { makeLeadRow } from '../fixtures/lead-row';

const now = new Date('2026-10-01T08:05:00Z');
const ok = { mx: 'yes' as const, sentToSameAddressLast24h: false, now };

describe('shouldSendConfirmation', () => {
  it('sends a normal lead', () => expect(shouldSendConfirmation(makeLeadRow(), ok)).toEqual({ send: true }));
  it('skips spam', () => expect(shouldSendConfirmation(makeLeadRow({ spam_suspected: true }), ok)).toMatchObject({ send: false, reason: 'spam', retryable: false }));
  it('skips reserved test domains', () => {
    expect(shouldSendConfirmation(makeLeadRow({ email_normalized: 'x@example.com' }), ok)).toMatchObject({ reason: 'test_domain' });
  });
  it('skips after 24 h', () => {
    expect(shouldSendConfirmation(makeLeadRow({ created_at: '2026-09-29T08:00:00Z' }), ok)).toMatchObject({ reason: 'too_late' });
  });
  it('skips domains without MX, retries on DNS trouble', () => {
    expect(shouldSendConfirmation(makeLeadRow(), { ...ok, mx: 'no' })).toMatchObject({ reason: 'no_mx', retryable: false });
    expect(shouldSendConfirmation(makeLeadRow(), { ...ok, mx: 'unknown' })).toMatchObject({ reason: 'mx_unknown', retryable: true });
  });
  it('throttles to one mail per address per 24 h', () => {
    expect(shouldSendConfirmation(makeLeadRow(), { ...ok, sentToSameAddressLast24h: true })).toMatchObject({ reason: 'throttled' });
  });
});

describe('renderConfirmation', () => {
  it('escapes user input', () => {
    const m = renderConfirmation(makeLeadRow({ first_name: '<script>alert(1)</script>' }));
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
  });
  it('never echoes the free-text note (phishing relay)', () => {
    const m = renderConfirmation(makeLeadRow({ plot_note: 'Klicken Sie hier: evil.example' }));
    expect(m.html).not.toContain('evil.example');
    expect(m.text).not.toContain('evil.example');
  });
  it('summarizes the plot, or says it will be clarified', () => {
    expect(renderConfirmation(makeLeadRow()).text).toContain('Hauptstraße 14, 01067 Dresden');
    expect(renderConfirmation(makeLeadRow({ address_unknown: true, street: null, postal_code: null, city: null })).text).toContain('wird telefonisch geklärt');
  });
  it('greets neutrally and includes the demo footer', () => {
    const m = renderConfirmation(makeLeadRow());
    expect(m.subject).toBe('Ihre Anfrage zum kostenlosen Standort-Check');
    expect(m.text).toContain('Guten Tag Thomas Ahrens');
    expect(m.text).toContain('Case Study');
  });
  it('escapeHtml covers quotes', () => expect(escapeHtml(`"'&`)).toBe('&quot;&#39;&amp;'));
});

describe('canAttemptEmail', () => {
  const t = new Date('2026-10-01T12:00:00Z');
  const L = (email_status: 'pending' | 'failed' | 'done' | 'skipped' | 'sending', email_attempts: number, email_claimed_at: string | null = null) =>
    ({ email_status, email_attempts, email_claimed_at });
  it('allows pending/failed below the cap only', () => {
    expect(canAttemptEmail(L('pending', 0), t)).toBe(true);
    expect(canAttemptEmail(L('failed', 2), t)).toBe(true);
    expect(canAttemptEmail(L('failed', 3), t)).toBe(false);
    expect(canAttemptEmail(L('done', 0), t)).toBe(false);
    expect(canAttemptEmail(L('skipped', 0), t)).toBe(false);
  });
  it('rejects a fresh sending lead, accepts a stale one', () => {
    expect(canAttemptEmail(L('sending', 1, '2026-10-01T11:55:00Z'), t)).toBe(false);
    expect(canAttemptEmail(L('sending', 1, '2026-10-01T11:49:00Z'), t)).toBe(true);
    expect(canAttemptEmail(L('sending', 1, null), t)).toBe(true);
    expect(canAttemptEmail(L('sending', 3, '2026-10-01T11:00:00Z'), t)).toBe(false);
  });
});
