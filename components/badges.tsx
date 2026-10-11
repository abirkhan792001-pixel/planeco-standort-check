import type { AreaAssessment } from '@/lib/geo/service-area';
import type { AddressQuality, LeadView } from '@/lib/leads/derive';
import { ADDRESS_TEXT, AREA_TEXT, AREA_TONE, geoFlagTexts, mailStatusLabel, STATUS_LABELS, STATUS_TONE, type LabelTone } from '@/lib/labels';
import { Badge, DistanceBar, toneText } from './ui';

/** Verdict in its tone with the distance bar beside it; "12 km · Planeco location" below. Without a distance only the verdict. */
export function AreaVerdict({ area }: { area: AreaAssessment }) {
  const hasKm = area.distanceKm !== undefined && Boolean(area.hub);
  return (
    <span className="block">
      <span className="flex items-center gap-2">
        <span className={`text-[13px] font-semibold ${toneText[AREA_TONE[area.verdict]]}`}>{AREA_TEXT[area.verdict]}</span>
        {hasKm && <DistanceBar area={area} />}
      </span>
      {hasKm && <>{' '}<span className="block font-data text-xs text-muted">{area.distanceKm} km · {area.hub}</span></>}
    </span>
  );
}

const addressTone: Record<AddressQuality, LabelTone> = {
  house: 'grey', street: 'grey', postcode: 'amber', locality: 'amber', none: 'red', ambiguous: 'amber', pending: 'grey', 'n/a': 'grey',
};

/** How precisely the address was found. Quiet text when precise; ochre/brick when it needs a call. ⚠ = flags (hover). */
export function AddressMatch({ lead }: { lead: LeadView }) {
  const q = lead.addressQuality;
  const label = q === 'pending' ? '…' : ADDRESS_TEXT[q]; // the export spells "pending" out; the cell shows an ellipsis
  const flags = geoFlagTexts(lead);
  return (
    <span className={`text-xs ${toneText[addressTone[q]]}`} title={flags.join(' · ') || undefined}>
      {label}{flags.length > 0 && q !== 'ambiguous' ? <span className="text-ochre"> ⚠</span> : ''}
    </span>
  );
}

export function StatusBadge({ status, title }: { status: LeadView['status']; title?: string }) {
  return <Badge tone={STATUS_TONE[status]} title={title}>{STATUS_LABELS[status]}</Badge>;
}

export function MailBadge({ lead }: { lead: LeadView }) {
  const m = mailStatusLabel(lead);
  return <Badge tone={m.tone} title={m.title}>{m.text}</Badge>;
}
