import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
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
  it("follows Planeco's auto-reply without repeating the form data", () => {
    const m = renderConfirmation(makeLeadRow({ project_type: 'neubau' }));
    for (const s of ['Hauptstraße', '123 456', 'Neubau']) {
      expect(m.html).not.toContain(s);
      expect(m.text).not.toContain(s);
    }
    expect(m.text).toContain('Wir freuen uns auf Sie!');
  });
  it('greets neutrally and includes the demo footer', () => {
    const m = renderConfirmation(makeLeadRow());
    expect(m.subject).toBe('Planeco Building - Vielen Dank für Ihre Anfrage');
    expect(m.text).toContain('Guten Tag Thomas Ahrens');
    expect(m.text).toContain('Case Study');
    expect(m.html).toContain('Case Study');
  });
  it("carries Planeco's signature and legal footer in HTML and text", () => {
    const m = renderConfirmation(makeLeadRow());
    expect(m.html).toContain('href="mailto:service@planecobuilding.de"');
    expect(m.html).toContain('href="tel:+494022898891"');
    expect(m.html).toContain('href="https://www.planecobuilding.de/"');
    for (const s of ['Ihr Team von Planeco Building', 'Planeco Building GmbH', '+49 40 2289 8891', 'Amtsgericht Hamburg HRB 177700']) {
      expect(m.html).toContain(s);
      expect(m.text).toContain(s);
    }
  });

  describe('links from the environment', () => {
    afterEach(() => vi.unstubAllEnvs());
    const logo = (html: string) => html.match(/<img src="([^"]+)" width="165" height="33" alt="Planeco Building"/)?.[1];

    it('loads the logo from the deployment, falling back to production for a non-https base', () => {
      vi.stubEnv('APP_BASE_URL', 'https://preview.example.dev');
      expect(logo(renderConfirmation(makeLeadRow()).html)).toBe('https://preview.example.dev/brand/planeco-logo-mail.png');
      vi.stubEnv('APP_BASE_URL', 'http://localhost:3000');
      expect(logo(renderConfirmation(makeLeadRow()).html)).toBe('https://planeco-standort-check.vercel.app/brand/planeco-logo-mail.png');
      expect(existsSync(path.resolve(process.cwd(), 'public/brand/planeco-logo-mail.png'))).toBe(true);
    });
    it("links Planeco's Calendly unless an https booking URL is configured", () => {
      const planeco = 'https://calendly.com/d/ds87-3jg-y64/planeco-kostenloses-erstgesprach-online-architekt';
      vi.stubEnv('MAIL_BOOKING_URL', '');
      expect(renderConfirmation(makeLeadRow()).html).toContain(`<a href="${planeco}"`);
      expect(renderConfirmation(makeLeadRow()).text).toContain(planeco);
      vi.stubEnv('MAIL_BOOKING_URL', 'javascript:alert(1)');
      expect(renderConfirmation(makeLeadRow()).html).not.toContain('javascript:');
      expect(renderConfirmation(makeLeadRow()).html).toContain(`<a href="${planeco}"`);
      vi.stubEnv('MAIL_BOOKING_URL', 'https://calendly.com/example/erstgespraech?a=1&b=2');
      const m = renderConfirmation(makeLeadRow());
      expect(m.html).toContain('<a href="https://calendly.com/example/erstgespraech?a=1&amp;b=2"');
      expect(m.text).toContain('https://calendly.com/example/erstgespraech?a=1&b=2');
    });
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
