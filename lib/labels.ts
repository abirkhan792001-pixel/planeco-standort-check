import type { DisqualifyReason, LeadStatus, ProjectType, Reachability } from '@/lib/leads/types';

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
