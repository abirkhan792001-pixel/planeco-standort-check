import type { AreaAssessment } from '@/lib/geo/service-area';
import type { AddressQuality, LeadView } from '@/lib/leads/derive';
import { geoFlagTexts, mailStatusLabel, STATUS_LABELS, type LabelTone } from '@/lib/labels';

const base = 'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium';
const tone: Record<LabelTone, string> = {
  green: 'bg-emerald-100 text-emerald-900', amber: 'bg-amber-100 text-amber-900', red: 'bg-red-100 text-red-900',
  grey: 'bg-stone-200 text-stone-700', blue: 'bg-sky-100 text-sky-900',
};

export function AreaBadge({ area }: { area: AreaAssessment }) {
  const km = area.distanceKm !== undefined ? ` · ${area.hub} ${area.distanceKm} km` : '';
  const map = {
    inside: [tone.green, `Im Gebiet${km}`], edge: [tone.amber, `Randlage${km}`],
    outside: [tone.red, `Außerhalb · nächster Hub: ${area.hub} ${area.distanceKm} km`],
    unclear: [tone.amber, 'Unklar – bitte prüfen'], pending: [tone.grey, 'Wird geprüft'],
    failed: [tone.grey, 'Prüfung fehlgeschlagen'], 'n/a': [tone.grey, '—'],
  } as const;
  const [cls, label] = map[area.verdict];
  return <span className={`${base} ${cls}`}>{label}</span>;
}

export function AddressBadge({ lead }: { lead: LeadView }) {
  const labels: Record<AddressQuality, [string, string]> = {
    house: [tone.green, 'Hausgenau'], street: [tone.blue, 'Straßengenau'], postcode: [tone.amber, 'Nur PLZ-genau'],
    locality: [tone.amber, 'Nur Ort'], none: [tone.red, 'Nicht gefunden'], ambiguous: [tone.amber, 'Mehrdeutig'], pending: [tone.grey, '…'],
    'n/a': [tone.grey, '—'],
  };
  const [cls, label] = labels[lead.addressQuality];
  const flags = geoFlagTexts(lead);
  return (
    <span className={`${base} ${cls}`} title={flags.join(' · ') || undefined}>
      {label}{flags.length > 0 && lead.addressQuality !== 'ambiguous' ? ' ⚠' : ''}
    </span>
  );
}

export function StatusBadge({ status }: { status: LeadView['status'] }) {
  const cls = status === 'neu' ? tone.blue : status === 'gewonnen' || status === 'qualifiziert' ? tone.green : status === 'in_bearbeitung' ? tone.amber : tone.grey;
  return <span className={`${base} ${cls}`}>{STATUS_LABELS[status]}</span>;
}

export function MailBadge({ lead }: { lead: LeadView }) {
  const m = mailStatusLabel(lead);
  return <span className={`${base} ${tone[m.tone]}`} title={m.title || undefined}>{m.text}</span>;
}
