import type { AreaAssessment, AreaVerdict } from '@/lib/geo/service-area';
import type { AddressQuality, LeadView } from '@/lib/leads/derive';
import { ADDRESS_TEXT, AREA_TEXT, geoFlagTexts, mailStatusLabel, STATUS_LABELS, type LabelTone } from '@/lib/labels';
import { Badge } from './ui';

const areaTone: Record<AreaVerdict, LabelTone> = {
  inside: 'green', edge: 'amber', outside: 'red', unclear: 'amber', pending: 'grey', failed: 'grey', 'n/a': 'grey',
};

export function AreaBadge({ area }: { area: AreaAssessment }) {
  const text = AREA_TEXT[area.verdict];
  const km = area.distanceKm !== undefined ? ` · ${area.hub} ${area.distanceKm} km` : '';
  const label = area.verdict === 'outside' ? `${text} · nächster Hub: ${area.hub} ${area.distanceKm} km`
    : area.verdict === 'inside' || area.verdict === 'edge' ? `${text}${km}` : text;
  return <Badge tone={areaTone[area.verdict]}>{label}</Badge>;
}

const addressTone: Record<AddressQuality, LabelTone> = {
  house: 'green', street: 'blue', postcode: 'amber', locality: 'amber', none: 'red', ambiguous: 'amber', pending: 'grey', 'n/a': 'grey',
};

export function AddressBadge({ lead }: { lead: LeadView }) {
  const q = lead.addressQuality;
  const label = q === 'pending' ? '…' : ADDRESS_TEXT[q]; // the export spells "pending" out; the narrow badge shows an ellipsis
  const flags = geoFlagTexts(lead);
  return (
    <Badge tone={addressTone[q]} title={flags.join(' · ') || undefined}>
      {label}{flags.length > 0 && q !== 'ambiguous' ? ' ⚠' : ''}
    </Badge>
  );
}

const statusTone: Record<LeadView['status'], LabelTone> = {
  neu: 'blue', in_bearbeitung: 'amber', qualifiziert: 'green', gewonnen: 'green', nicht_qualifiziert: 'grey', verloren: 'grey',
};

export function StatusBadge({ status }: { status: LeadView['status'] }) {
  return <Badge tone={statusTone[status]}>{STATUS_LABELS[status]}</Badge>;
}

export function MailBadge({ lead }: { lead: LeadView }) {
  const m = mailStatusLabel(lead);
  return <Badge tone={m.tone} title={m.title}>{m.text}</Badge>;
}
