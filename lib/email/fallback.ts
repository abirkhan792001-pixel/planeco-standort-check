import 'server-only';
import type { LeadPayload } from '@/lib/leads/schema';
import { errInfo } from '@/lib/log';
import { sendTransactional } from './brevo';

/** Used only when the DB insert fails: the lead goes to a human inbox as plain text (no HTML → no injection). */
export async function sendFallbackMail(p: LeadPayload): Promise<boolean> {
  const inbox = process.env.FALLBACK_INBOX;
  if (!inbox) return false;
  try {
    await sendTransactional({
      to: { email: inbox },
      subject: `[Standort-Check] DB nicht erreichbar – Anfrage von ${p.firstName} ${p.lastName}`.slice(0, 200),
      text: `Die Datenbank war beim Absenden nicht erreichbar. Anfrage bitte manuell anlegen.\n\n${JSON.stringify(p, null, 2)}`,
      tags: ['standort-check-fallback'],
    });
    return true;
  } catch (err) {
    console.error('fallback mail failed', errInfo(err));
    return false;
  }
}
