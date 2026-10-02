import { EMAIL_MAX_AGE_HOURS, MAX_EMAIL_ATTEMPTS, isReservedEmailDomain } from '@/lib/config/app';
import type { LeadRow } from '@/lib/leads/types';

export type SendDecision =
  | { send: true }
  | { send: false; reason: 'spam' | 'test_domain' | 'too_late' | 'no_mx' | 'mx_unknown' | 'throttled'; retryable: boolean };

export function shouldSendConfirmation(
  lead: LeadRow,
  ctx: { mx: 'yes' | 'no' | 'unknown'; sentToSameAddressLast24h: boolean; now: Date },
): SendDecision {
  if (lead.spam_suspected) return { send: false, reason: 'spam', retryable: false };
  if (isReservedEmailDomain(lead.email_normalized)) return { send: false, reason: 'test_domain', retryable: false };
  if (ctx.now.getTime() - Date.parse(lead.created_at) > EMAIL_MAX_AGE_HOURS * 3_600_000) return { send: false, reason: 'too_late', retryable: false };
  if (ctx.mx === 'no') return { send: false, reason: 'no_mx', retryable: false };
  if (ctx.mx === 'unknown') return { send: false, reason: 'mx_unknown', retryable: true };
  if (ctx.sentToSameAddressLast24h) return { send: false, reason: 'throttled', retryable: false };
  return { send: true };
}

export function canAttemptEmail(lead: Pick<LeadRow, 'email_status' | 'email_attempts'>): boolean {
  return (lead.email_status === 'pending' || lead.email_status === 'failed') && lead.email_attempts < MAX_EMAIL_ATTEMPTS;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const cap = (s: string | null | undefined, n: number) => (s ?? '').slice(0, n);

/** Deliberately does not render plot_note or any other free text. */
export function renderConfirmation(lead: LeadRow): { subject: string; html: string; text: string } {
  const name = `${cap(lead.first_name, 100)} ${cap(lead.last_name, 100)}`.trim();
  const plot = lead.address_unknown
    ? 'Lage: wird telefonisch geklärt'
    : `${cap(lead.street, 120)}${lead.house_number ? ` ${cap(lead.house_number, 10)}` : ''}, ${cap(lead.postal_code, 5)} ${cap(lead.city, 100)}`;
  const phone = cap(lead.phone_raw, 40);
  const subject = 'Ihre Anfrage zum kostenlosen Standort-Check';
  const footer = 'Diese Nachricht stammt aus einem Prototyp im Rahmen einer Case Study und ist keine verbindliche Anfrage bei der Planeco Building GmbH.';

  const text = [
    `Guten Tag ${name},`,
    '',
    'vielen Dank für Ihre Anfrage zum kostenlosen Standort-Check. Wir haben folgende Angaben erhalten:',
    '',
    `Grundstück: ${plot}`,
    `Telefon: ${phone}`,
    '',
    'Wir melden uns in der Regel am nächsten Werktag. Falls eine Angabe nicht stimmt, antworten Sie einfach auf diese E-Mail.',
    '',
    'Viele Grüße',
    'Ihr Standort-Check-Team',
    '',
    '—',
    footer,
  ].join('\n');

  const html = `<!doctype html><html lang="de"><body style="font-family:Arial,sans-serif;color:#1c1917;line-height:1.5">
<p>Guten Tag ${escapeHtml(name)},</p>
<p>vielen Dank für Ihre Anfrage zum kostenlosen Standort-Check. Wir haben folgende Angaben erhalten:</p>
<table cellpadding="4" style="border-collapse:collapse">
<tr><td><strong>Grundstück</strong></td><td>${escapeHtml(plot)}</td></tr>
<tr><td><strong>Telefon</strong></td><td>${escapeHtml(phone)}</td></tr>
</table>
<p>Wir melden uns in der Regel am nächsten Werktag. Falls eine Angabe nicht stimmt, antworten Sie einfach auf diese E-Mail.</p>
<p>Viele Grüße<br>Ihr Standort-Check-Team</p>
<p style="color:#78716c;font-size:12px">${escapeHtml(footer)}</p>
</body></html>`;

  return { subject, html, text };
}
