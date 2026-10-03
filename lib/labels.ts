import type { DisqualifyReason, LeadRow, LeadStatus, ProjectType, Reachability } from '@/lib/leads/types';

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  neubau: 'Neubau', anbau: 'Anbau', umbau: 'Umbau', sanierung: 'Sanierung', sonstiges: 'Sonstiges',
};
export const REACHABILITY_LABELS: Record<Reachability, string> = {
  vormittags: 'vormittags', nachmittags: 'nachmittags', abends: 'abends',
};
export const STATUS_LABELS: Record<LeadStatus, string> = {
  neu: 'Neu', in_bearbeitung: 'In Bearbeitung', qualifiziert: 'Qualifiziert',
  nicht_qualifiziert: 'Nicht qualifiziert', gewonnen: 'Gewonnen', verloren: 'Verloren',
};
export const REASON_LABELS: Record<DisqualifyReason, string> = {
  ausserhalb_gebiet: 'Außerhalb Gebiet', kein_bedarf: 'Kein Bedarf', nicht_erreichbar: 'Nicht erreichbar',
  spam: 'Spam/Test', duplikat: 'Duplikat', sonstiges: 'Sonstiges',
};
export const STATE_LABELS: Record<string, string> = {
  'DE-SH': 'Schleswig-Holstein', 'DE-HH': 'Hamburg', 'DE-NI': 'Niedersachsen', 'DE-HB': 'Bremen', 'DE-NW': 'Nordrhein-Westfalen',
  'DE-HE': 'Hessen', 'DE-RP': 'Rheinland-Pfalz', 'DE-BW': 'Baden-Württemberg', 'DE-BY': 'Bayern', 'DE-SL': 'Saarland',
  'DE-BE': 'Berlin', 'DE-BB': 'Brandenburg', 'DE-MV': 'Mecklenburg-Vorpommern', 'DE-SN': 'Sachsen', 'DE-ST': 'Sachsen-Anhalt', 'DE-TH': 'Thüringen',
};

/** Returned by dashboard server actions when the session is gone (spec C-4); the table then redirects to /login. */
export const SESSION_EXPIRED_MESSAGE = 'Sitzung abgelaufen – bitte neu anmelden.';

export type LabelTone = 'green' | 'amber' | 'red' | 'grey' | 'blue';
export type MailStatusLabel = { text: string; tone: LabelTone; title?: string };

const SKIP_LABELS: Record<string, Omit<MailStatusLabel, 'title'>> = {
  no_mx: { text: 'Keine Mail – Domain ungültig', tone: 'amber' },
  test_domain: { text: 'Keine Mail – Testadresse', tone: 'grey' },
  throttled: { text: 'Übersprungen – bereits bestätigt', tone: 'grey' },
  too_late: { text: 'Übersprungen – zu spät', tone: 'amber' },
  rejected_by_provider: { text: 'Vom Mailanbieter abgelehnt', tone: 'amber' },
  spam: { text: 'Keine Mail – Spamverdacht', tone: 'grey' },
};

/** Confirmation-mail state in German (spec §20, E-2). Shared by the dashboard badge and the XLSX export. */
export function mailStatusLabel(r: Pick<LeadRow, 'email_status' | 'email_skip_reason' | 'email_last_error'>): MailStatusLabel {
  switch (r.email_status) {
    case 'done': return { text: 'gesendet', tone: 'green' };
    case 'sending': return { text: 'wird gesendet', tone: 'blue' };
    case 'pending': return { text: 'ausstehend', tone: 'grey' };
    case 'failed': return { text: 'Mail fehlgeschlagen', tone: 'red', title: r.email_last_error ?? undefined };
    case 'skipped': {
      const known = r.email_skip_reason ? SKIP_LABELS[r.email_skip_reason] : undefined;
      return known ?? { text: 'übersprungen', tone: 'grey', title: r.email_skip_reason ?? undefined };
    }
  }
}

export const GEO_FLAG_LABELS: Record<string, string> = {
  plz_mismatch: 'PLZ passt nicht zur Straße', house_not_found: 'Hausnummer nicht gefunden', street_not_found: 'Straße nicht gefunden',
  city_plz_mismatch: 'Ort passt nicht zur PLZ', plz_not_found: 'PLZ unbekannt', plz_multiple_municipalities: 'PLZ umfasst mehrere Gemeinden',
  ambiguous: 'Mehrere mögliche Orte', address_unknown: 'Adresse vom Interessenten nicht bekannt',
  cadastral_only: 'Flurstück – Lage telefonisch klären',
};

/** German texts for the enrichment flags, with the evidence that makes them actionable (A-1, A-6). */
export function geoFlagTexts(r: Pick<LeadRow, 'geo_flags' | 'geo_found_postcode' | 'city' | 'geo_municipality'>): string[] {
  return r.geo_flags.map((f) => {
    if (f === 'plz_mismatch' && r.geo_found_postcode) return `${GEO_FLAG_LABELS[f]} (gefunden: ${r.geo_found_postcode})`;
    if (f === 'city_plz_mismatch') return `${GEO_FLAG_LABELS[f]} (eingegeben: ${r.city ?? '—'}, gefunden: ${r.geo_municipality ?? '—'})`;
    return GEO_FLAG_LABELS[f] ?? f;
  });
}
