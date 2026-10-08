import { EMAIL_CLAIM_STALE_MINUTES, EMAIL_MAX_AGE_HOURS, MAX_EMAIL_ATTEMPTS, isReservedEmailDomain } from '@/lib/config/app';
import { PROJECT_TYPE_LABELS } from '@/lib/labels';
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

export function canAttemptEmail(lead: Pick<LeadRow, 'email_status' | 'email_attempts' | 'email_claimed_at'>, now: Date): boolean {
  if (lead.email_attempts >= MAX_EMAIL_ATTEMPTS) return false;
  if (lead.email_status === 'pending' || lead.email_status === 'failed') return true;
  if (lead.email_status === 'sending') {
    const claimed = lead.email_claimed_at ? Date.parse(lead.email_claimed_at) : 0;
    return claimed < now.getTime() - EMAIL_CLAIM_STALE_MINUTES * 60_000;
  }
  return false;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const cap = (s: string | null | undefined, n: number) => (s ?? '').slice(0, n);

/** Mail clients fetch the logo themselves, so it needs a public https URL (a localhost base falls back to production). */
const DEFAULT_BASE_URL = 'https://planeco-standort-check.vercel.app';

/** Planeco's own mail signature, as in their "Vielen Dank für Ihre Anfrage" auto-reply. */
const SIGNATURE = {
  company: 'Planeco Building GmbH',
  email: 'service@planecobuilding.de',
  phone: '+49 40 2289 8891',
  phoneHref: 'tel:+494022898891',
  website: 'www.planecobuilding.de',
  websiteHref: 'https://www.planecobuilding.de/',
  logoPath: '/brand/planeco-logo-mail.png',
  legal: [
    'Planeco Building GmbH | Brauhausstraße 19, 22041 Hamburg, DE | Geschäftsführung: Stefan Dietrich',
    'Handelsregistereintragung: Amtsgericht Hamburg HRB 177700 | USt-IdNr.: DE 357555071',
  ],
} as const;

/** Type and colours measured from Planeco's auto-reply: Arial 13px body, Poppins signature, Gmail's link blue. */
const BODY_FONT = 'font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:16px;color:#222222';
const SIGNATURE_FONT = "font-family:'Poppins',Arial,Helvetica,sans-serif";
const INK = '#22403b';
const GREY = '#545a62';
const LINK = '#1155cc';

function httpsUrl(raw: string | undefined): URL | null {
  try {
    const url = new URL(raw ?? '');
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** Deliberately does not render plot_note or any other free text. */
export function renderConfirmation(lead: LeadRow): { subject: string; html: string; text: string } {
  const name = `${cap(lead.first_name, 100)} ${cap(lead.last_name, 100)}`.trim();
  const plot = lead.address_unknown
    ? 'wird telefonisch geklärt'
    : `${cap(lead.street, 120)}${lead.house_number ? ` ${cap(lead.house_number, 10)}` : ''}, ${cap(lead.postal_code, 5)} ${cap(lead.city, 100)}`;
  const phone = cap(lead.phone_raw, 40);
  const details: [string, string][] = [
    ...(lead.project_type ? [['Vorhaben', PROJECT_TYPE_LABELS[lead.project_type]] as [string, string]] : []),
    ['Grundstück', plot],
    ['Telefon', phone],
  ];
  const logoUrl = new URL(SIGNATURE.logoPath, httpsUrl(process.env.APP_BASE_URL) ?? DEFAULT_BASE_URL).href;
  // Planeco's auto-reply links its Calendly here; the prototype shows the line only when a booking page is configured.
  const bookingUrl = httpsUrl(process.env.MAIL_BOOKING_URL)?.href ?? null;
  const subject = 'Planeco Building - Vielen Dank für Ihre Anfrage zum Standort-Check';
  const footer = 'Diese Nachricht stammt aus einem Prototyp im Rahmen einer Case Study und ist keine verbindliche Anfrage bei der Planeco Building GmbH.';

  const intro = 'vielen Dank für Ihre Anfrage zum Standort-Check. Wir prüfen Lage und Genehmigungssituation Ihres Grundstücks und melden uns in der Regel am nächsten Werktag telefonisch bei Ihnen. In diesem Rahmen erhalten Sie Ihre kostenfreie Ersteinschätzung zu Ihrem Vorhaben.';
  const documents = 'Anschließend können Sie uns Unterlagen, z. B. vorhandene Pläne, zur Verfügung stellen und je nach Anliegen ein Angebot erhalten. Der Standort-Check sowie ein individuelles Angebot sind unverbindlich & kostenfrei.';
  const booking = ['Sie möchten sich den Zeitpunkt des Gesprächs aussuchen? Wählen Sie', 'einen Termin aus, zu dem Sie angerufen werden.'] as const;
  const correction = 'Falls eine Angabe nicht stimmt, antworten Sie einfach auf diese E-Mail.';

  const text = [
    `Guten Tag ${name},`,
    '',
    intro,
    '',
    documents,
    '',
    ...(bookingUrl ? [`${booking[0]} hier ${booking[1]}`, bookingUrl, ''] : []),
    'Folgende Angaben haben wir erhalten:',
    ...details.map(([label, value]) => `${label}: ${value}`),
    '',
    correction,
    '',
    'Wir freuen uns auf Sie!',
    '',
    'Ihr Team von Planeco Building',
    '',
    SIGNATURE.company,
    SIGNATURE.email,
    SIGNATURE.phone,
    SIGNATURE.website,
    '',
    ...SIGNATURE.legal,
    '',
    '—',
    `Hinweis: ${footer}`,
  ].join('\n');

  const p = (inner: string, margin = '0 0 13px') => `<p style="margin:${margin};${BODY_FONT}">${inner}</p>`;
  const sig = (inner: string, style: string, margin = '12px 0 0') => `<p style="margin:${margin};${SIGNATURE_FONT};${style}">${inner}</p>`;
  const small = `font-size:8pt;line-height:16px;color:${GREY}`;

  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&amp;display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:#ffffff">
<tr><td style="padding:0;${BODY_FONT}">
${p(`Guten Tag ${escapeHtml(name)},`)}
${p(escapeHtml(intro))}
${p(escapeHtml(documents))}
${bookingUrl ? p(`${escapeHtml(booking[0])} <a href="${escapeHtml(bookingUrl)}" style="color:${LINK};text-decoration:none">hier</a> ${escapeHtml(booking[1])}`) : ''}
${p(`Folgende Angaben haben wir erhalten:<br>${details.map(([label, value]) => `${label}: ${escapeHtml(value)}`).join('<br>')}`)}
${p(escapeHtml(correction))}
${p('Wir freuen uns auf Sie!', '0 0 29px')}
${p('Ihr Team von Planeco Building', '0')}
${sig(escapeHtml(SIGNATURE.company), `font-size:12pt;line-height:24px;font-weight:700;color:${INK}`, '11px 0 0')}
${sig(`<a href="mailto:${SIGNATURE.email}" style="color:${LINK};text-decoration:underline">${SIGNATURE.email}</a>`, 'font-size:10pt;line-height:20px', '11px 0 0')}
${sig(`<a href="${SIGNATURE.phoneHref}" style="color:${GREY};text-decoration:none">${SIGNATURE.phone}</a>`, `font-size:10pt;line-height:20px;color:${GREY}`)}
${sig(`<a href="${SIGNATURE.websiteHref}" style="color:${INK};text-decoration:none">${SIGNATURE.website}</a>`, `font-size:10pt;line-height:20px;font-weight:700;color:${INK}`)}
<p style="margin:12px 0 0;font-size:0;line-height:0"><img src="${escapeHtml(logoUrl)}" width="165" height="33" alt="Planeco Building" style="display:block;width:165px;height:33px;border:0;outline:none;text-decoration:none"></p>
${SIGNATURE.legal.map((line) => sig(escapeHtml(line), small)).join('\n')}
${sig(`Hinweis: ${escapeHtml(footer)}`, small)}
</td></tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}
