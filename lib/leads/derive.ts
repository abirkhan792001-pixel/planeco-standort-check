import { classifyChannel } from '@/lib/attribution/classify';
import type { ChannelInfo } from '@/lib/attribution/types';
import { SERVICE_AREA } from '@/lib/config/service-area';
import { assessServiceArea, type AreaAssessment } from '@/lib/geo/service-area';
import type { LeadRow } from './types';

export type AddressQuality = 'house' | 'street' | 'postcode' | 'locality' | 'none' | 'ambiguous' | 'pending';
export type LeadView = LeadRow & {
  channel: ChannelInfo; area: AreaAssessment; addressQuality: AddressQuality;
  ownerName: string | null; groupSize: number; plotLabel: string;
};

export function ownHost(): string {
  try {
    return new URL(process.env.APP_BASE_URL ?? 'http://localhost').hostname;
  } catch {
    return 'localhost';
  }
}

function addressQuality(r: LeadRow): AddressQuality {
  // Only a finished enrichment has a precision; pending/failed/skipped (spam) must not read as "Nicht gefunden".
  if (r.enrichment_status !== 'done') return 'pending';
  if (r.geo_flags.includes('ambiguous')) return 'ambiguous';
  return r.geo_precision ?? 'none';
}

function plotLabel(r: LeadRow): string {
  if (r.address_unknown) return `Adresse unbekannt: ${r.plot_note ?? ''}`.trim();
  return `${r.street ?? ''}${r.house_number ? ` ${r.house_number}` : ''}, ${r.postal_code ?? ''} ${r.city ?? ''}`.trim();
}

/** Pure: all "opinions" (channel, area verdict, badges) are computed here from stored facts. */
export function deriveLeadViews(rows: LeadRow[], profiles: { id: string; display_name: string }[], host: string): LeadView[] {
  const names = new Map(profiles.map((p) => [p.id, p.display_name]));
  const dupCounts = new Map<string, number>();
  for (const r of rows) if (r.duplicate_of) dupCounts.set(r.duplicate_of, (dupCounts.get(r.duplicate_of) ?? 0) + 1);
  return rows.map((r) => ({
    ...r,
    channel: classifyChannel(r, host),
    area: assessServiceArea(r, SERVICE_AREA),
    addressQuality: addressQuality(r),
    ownerName: r.assigned_to ? names.get(r.assigned_to) ?? 'Unbekannt' : null,
    groupSize: r.duplicate_of ? 1 : 1 + (dupCounts.get(r.id) ?? 0),
    plotLabel: plotLabel(r),
  }));
}
