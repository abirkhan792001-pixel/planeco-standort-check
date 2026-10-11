import { ADDRESS_TEXT, mailStatusLabel, REASON_LABELS, STATUS_LABELS } from '@/lib/labels';
import type { AddressQuality } from '@/lib/leads/derive';
import type { DisqualifyReason, LeadStatus } from '@/lib/leads/types';

/** One row of public.lead_events as the history reads it. */
export type LeadEvent = { id: number; lead_id: string; created_at: string; actor_id: string | null; type: string; data: Record<string, unknown> };

/** `sales` = something a person did, `system` = intake/mail/address check, `problem` = a job that failed. */
export type HistoryKind = 'sales' | 'system' | 'problem';
export type HistoryItem = { id: number; at: string; text: string; actor: string | null; kind: HistoryKind };

const DUP_REASON: Record<string, string> = { email: 'E-Mail', phone: 'Telefonnummer', address: 'Adresse' };
const str = (v: unknown) => (typeof v === 'string' ? v : null);

/**
 * German text for one event (written by the Postgres functions in 0002_functions.sql and by lib/leads/side-effects).
 * `names` maps user ids to display names; an id without a name reads "Unbekannt". Unknown types fall back to the type.
 */
export function describeEvent(e: LeadEvent, names: Map<string, string>): HistoryItem {
  const who = (id: unknown) => (typeof id === 'string' ? names.get(id) ?? 'Unbekannt' : null);
  const item = (text: string, kind: HistoryKind = 'sales'): HistoryItem =>
    ({ id: e.id, at: e.created_at, text, actor: who(e.actor_id), kind });
  const d = e.data ?? {};
  switch (e.type) {
    case 'created': return item(d.spam ? 'Anfrage eingegangen · Spamverdacht' : 'Anfrage eingegangen', 'system');
    case 'duplicate_linked': {
      const reasons = Array.isArray(d.reasons) ? d.reasons.map((r) => DUP_REASON[String(r)] ?? String(r)) : [];
      return item(reasons.length ? `Erneut angefragt (gleiche ${reasons.join(', ')})` : 'Erneut angefragt', 'system');
    }
    case 'claimed': return item('Übernommen');
    case 'claim_forced': return item(d.previous_owner ? `Übernommen von ${who(d.previous_owner)}` : 'Übernommen');
    case 'released': return item('Freigegeben');
    case 'status_changed': {
      const from = STATUS_LABELS[d.from as LeadStatus] ?? str(d.from) ?? '?';
      const to = STATUS_LABELS[d.to as LeadStatus] ?? str(d.to) ?? '?';
      const reason = d.reason ? ` (${REASON_LABELS[d.reason as DisqualifyReason] ?? String(d.reason)})` : '';
      return item(`Status ${from} → ${to}${reason}`);
    }
    case 'note_changed': return item(d.length === 0 ? 'Notiz gelöscht' : 'Notiz geändert');
    case 'email_sent': return item('Bestätigungsmail gesendet', 'system');
    case 'email_failed': return item('Bestätigungsmail fehlgeschlagen', 'problem');
    case 'email_skipped':
      return item(mailStatusLabel({ email_status: 'skipped', email_skip_reason: str(d.reason), email_last_error: null }).text, 'system');
    case 'enriched': {
      const precision = ADDRESS_TEXT[d.precision as AddressQuality];
      return item(precision ? `Adresse geprüft: ${precision}` : 'Adresse geprüft', 'system');
    }
    case 'enrichment_failed': return item('Adressprüfung fehlgeschlagen', 'problem');
    default: return item(e.type, 'system');
  }
}

/**
 * The history of a lead group, newest first: every event of the root, plus only the "asked again" event of each
 * duplicate (their own mail/address jobs would repeat the root's and drown the sales steps).
 */
export function buildHistory(events: LeadEvent[], rootId: string, names: Map<string, string>): HistoryItem[] {
  return events
    .filter((e) => e.lead_id === rootId || e.type === 'duplicate_linked')
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)
    .map((e) => describeEvent(e, names));
}
