import type { AreaAssessment, AreaVerdict } from '@/lib/geo/service-area';
import type { AddressQuality, LeadView } from '@/lib/leads/derive';
import { ADDRESS_TEXT, AREA_TEXT, geoFlagTexts, mailStatusLabel, STATUS_LABELS, type LabelTone } from '@/lib/labels';

const base = 'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium';
const tone: Record<LabelTone, string> = {
  green: 'bg-emerald-100 text-emerald-900', amber: 'bg-amber-100 text-amber-900', red: 'bg-red-100 text-red-900',
  grey: 'bg-stone-200 text-stone-700', blue: 'bg-sky-100 text-sky-900',
};

const areaTone: Record<AreaVerdict, string> = {
  inside: tone.green, edge: tone.amber, outside: tone.red, unclear: tone.amber, pending: tone.grey, failed: tone.grey, 'n/a': tone.grey,
};

export function AreaBadge({ area }: { area: AreaAssessment }) {
  const text = AREA_TEXT[area.verdict];
  const km = area.distanceKm !== undefined ? ` · ${area.hub} ${area.distanceKm} km` : '';
  const label = area.verdict === 'outside' ? `${text} · nächster Hub: ${area.hub} ${area.distanceKm} km`
    : area.verdict === 'inside' || area.verdict === 'edge' ? `${text}${km}` : text;
  return <span className={`${base} ${areaTone[area.verdict]}`}>{label}</span>;
}

const addressTone: Record<AddressQuality, string> = {
  house: tone.green, street: tone.blue, postcode: tone.amber, locality: tone.amber, none: tone.red, ambiguous: tone.amber, pending: tone.grey,
  'n/a': tone.grey,
};

export function AddressBadge({ lead }: { lead: LeadView }) {
  const q = lead.addressQuality;
  const label = q === 'pending' ? '…' : ADDRESS_TEXT[q]; // the export spells "pending" out; the narrow badge shows an ellipsis
  const flags = geoFlagTexts(lead);
  return (
    <span className={`${base} ${addressTone[q]}`} title={flags.join(' · ') || undefined}>
      {label}{flags.length > 0 && q !== 'ambiguous' ? ' ⚠' : ''}
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
