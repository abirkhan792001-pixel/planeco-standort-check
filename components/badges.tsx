import type { AreaAssessment } from '@/lib/geo/service-area';
import type { AddressQuality, LeadView } from '@/lib/leads/derive';
import { ADDRESS_TEXT, AREA_TEXT, AREA_TONE, geoFlagTexts, mailStatusLabel, STATUS_LABELS, STATUS_TONE, type LabelTone } from '@/lib/labels';
import { Badge, DistanceBar, toneSolid, toneText } from './ui';

// One symbol per verdict (white on the verdict colour), so verdicts differ by shape as well as by colour.
const GLYPH: Record<AreaAssessment['verdict'], React.ReactNode> = {
  inside: <path d="m5 8.3 2 2 4-4.5" />,
  edge: <path d="M4.6 8.6c1.1-1.5 2.2-1.5 3.4 0s2.3 1.5 3.4 0" />,
  outside: <path d="m5.6 5.6 4.8 4.8m0-4.8-4.8 4.8" />,
  unclear: <><path d="M6.3 6.4a1.8 1.8 0 1 1 2.5 1.7c-.5.3-.8.6-.8 1.2v.2" /><circle cx="8" cy="11.3" r=".2" /></>,
  pending: <><circle cx="8" cy="8" r="3.6" /><path d="M8 6.2V8l1.2.8" /></>,
  failed: <><path d="M8 4.8v3.8" /><circle cx="8" cy="11.2" r=".2" /></>,
  'n/a': <path d="M5.5 8h5" />,
};
const GLYPH_STROKE: Record<LabelTone, string> = {
  green: 'stroke-moss', amber: 'stroke-ochre', red: 'stroke-brick', grey: 'stroke-muted', blue: 'stroke-slate', violet: 'stroke-plum',
};

/** The verdict symbol in a 16 px disc. `inverted` (on a solid chip): a white disc with the symbol in the verdict colour. */
export function AreaIcon({ verdict, inverted = false }: { verdict: AreaAssessment['verdict']; inverted?: boolean }) {
  const tone = AREA_TONE[verdict];
  return (
    <span aria-hidden="true" className={`grid size-4 shrink-0 place-items-center rounded-full ${inverted ? 'bg-white' : toneSolid[tone]}`}>
      <svg viewBox="0 0 16 16" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        className={`size-4 ${inverted ? GLYPH_STROKE[tone] : 'stroke-white'}`}>
        {GLYPH[verdict]}
      </svg>
    </span>
  );
}

/** Verdict in its tone with the distance bar beside it; "12 km · Planeco location" below. Without a distance only the verdict. */
export function AreaVerdict({ area }: { area: AreaAssessment }) {
  const hasKm = area.distanceKm !== undefined && Boolean(area.hub);
  return (
    <span className="block">
      <span className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${toneText[AREA_TONE[area.verdict]]}`}>
          <AreaIcon verdict={area.verdict} />{AREA_TEXT[area.verdict]}
        </span>
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
