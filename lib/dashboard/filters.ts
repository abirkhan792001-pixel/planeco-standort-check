import { CHANNEL_GROUPS, type ChannelGroup } from '@/lib/attribution/types';
import type { AreaVerdict } from '@/lib/geo/service-area';
import { foldGerman } from '@/lib/leads/normalize';
import { LEAD_STATUSES, PROJECT_TYPES, REACHABILITY, type JobStatus, type LeadStatus } from '@/lib/leads/types';
import type { AddressQuality, LeadView } from '@/lib/leads/derive';

/** One key per dashboard column (spec §17: every column is sortable). */
export const SORT_KEYS = [
  'created_at', 'name', 'phone', 'plot', 'area', 'address', 'project', 'reachability', 'channel', 'status', 'owner', 'mail', 'group',
] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = 'asc' | 'desc';
export type Filters = {
  statuses: LeadStatus[]; areas: AreaVerdict[]; channelGroup: ChannelGroup | null;
  mine: boolean; unassigned: boolean; hideTest: boolean; showSpam: boolean; allSubmissions: boolean;
  q: string; sort: SortKey; dir: SortDir;
};

export const DEFAULT_FILTERS: Filters = {
  statuses: [], areas: [], channelGroup: null, mine: false, unassigned: false, hideTest: false, showSpam: false,
  allSubmissions: false, q: '', sort: 'created_at', dir: 'desc',
};

const AREA_RANK: Record<AreaVerdict, number> = { inside: 0, edge: 1, unclear: 2, pending: 3, failed: 4, outside: 5, 'n/a': 6 };
const ADDRESS_RANK: Record<AddressQuality, number> = { house: 0, street: 1, postcode: 2, locality: 3, ambiguous: 4, none: 5, pending: 6, 'n/a': 7 };
const MAIL_RANK: Record<JobStatus, number> = { done: 0, sending: 1, pending: 2, failed: 3, skipped: 4 };

/** German national/international prefixes → the digits of the +49 form ("0451…" → "49451…", "0049…" → "49…"). */
function internationalDigits(digits: string): string {
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `49${digits.slice(1)}`;
  return digits;
}

export function applyFilters(rows: LeadView[], f: Filters, currentUserId: string): LeadView[] {
  const q = foldGerman(f.q.trim());
  const digits = q.replace(/\D/g, '');
  const intlDigits = internationalDigits(digits);
  return rows.filter((r) => {
    if (!f.allSubmissions && r.duplicate_of) return false;
    if (!f.showSpam && r.spam_suspected) return false;
    if (f.hideTest && r.is_test) return false;
    if (f.mine && r.assigned_to !== currentUserId) return false;
    if (f.unassigned && r.assigned_to) return false;
    if (f.statuses.length && !f.statuses.includes(r.status)) return false;
    if (f.areas.length && !f.areas.includes(r.area.verdict)) return false;
    if (f.channelGroup && r.channel.group !== f.channelGroup) return false;
    if (q) {
      const hay = foldGerman([r.first_name, r.last_name, r.email, r.phone_raw, r.phone_e164, r.postal_code, r.city].filter(Boolean).join(' '));
      const hayDigits = `${r.phone_raw.replace(/\D/g, '')} ${(r.phone_e164 ?? '').replace(/\D/g, '')}`;
      const phoneHit = digits.length >= 4 && (hayDigits.includes(digits) || hayDigits.includes(intlDigits));
      if (!hay.includes(q) && !phoneHit) return false;
    }
    return true;
  });
}

function sortValue(r: LeadView, key: SortKey): string | number {
  switch (key) {
    case 'created_at': return Date.parse(r.created_at);
    case 'name': return foldGerman(`${r.last_name} ${r.first_name}`);
    case 'phone': return r.phone_e164 ? r.phone_e164.replace(/\D/g, '') : internationalDigits(r.phone_raw.replace(/\D/g, ''));
    case 'plot': return foldGerman(r.plotLabel);
    case 'area': return AREA_RANK[r.area.verdict] * 10_000 + (r.area.distanceKm ?? 9_999);
    case 'address': return ADDRESS_RANK[r.addressQuality];
    case 'project': return r.project_type ? PROJECT_TYPES.indexOf(r.project_type) : PROJECT_TYPES.length;
    // Earliest chosen slot first ("0" = vormittags, "02" = vormittags + abends); no choice sorts last.
    case 'reachability': return r.reachability.map((s) => REACHABILITY.indexOf(s)).sort().join('') || '9';
    case 'channel': return foldGerman(`${r.channel.group} ${r.channel.channel} ${r.channel.campaign}`);
    case 'status': return LEAD_STATUSES.indexOf(r.status);
    case 'owner': return foldGerman(r.ownerName ?? '~');
    case 'mail': return `${MAIL_RANK[r.email_status]}|${r.email_skip_reason ?? ''}`;
    case 'group': return r.groupSize;
  }
}

export function sortRows(rows: LeadView[], key: SortKey, dir: SortDir): LeadView[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    return (va < vb ? -1 : va > vb ? 1 : 0) * sign;
  });
}

/** Header click: the same column toggles; a new column starts ascending, except Eingang (newest first). */
export function nextSort(current: { sort: SortKey; dir: SortDir }, key: SortKey): { sort: SortKey; dir: SortDir } {
  if (current.sort === key) return { sort: key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { sort: key, dir: key === 'created_at' ? 'desc' : 'asc' };
}

/**
 * Serialises the filters. The dashboard sends these entries as hidden form fields in the export POST body (never in a
 * URL): status, area, channel, mine, unassigned, hideTest, showSpam, allSubmissions, q, sort, dir.
 */
export function filtersToSearchParams(f: Filters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.statuses.length) sp.set('status', f.statuses.join(','));
  if (f.areas.length) sp.set('area', f.areas.join(','));
  if (f.channelGroup) sp.set('channel', f.channelGroup);
  for (const k of ['mine', 'unassigned', 'hideTest', 'showSpam', 'allSubmissions'] as const) if (f[k]) sp.set(k, '1');
  if (f.q) sp.set('q', f.q);
  sp.set('sort', f.sort);
  sp.set('dir', f.dir);
  return sp;
}

export function filtersFromSearchParams(sp: URLSearchParams): Filters {
  const list = (k: string) => (sp.get(k) ? sp.get(k)!.split(',').filter(Boolean) : []);
  const sort = sp.get('sort');
  const channel = sp.get('channel');
  return {
    statuses: list('status').filter((s): s is LeadStatus => (LEAD_STATUSES as readonly string[]).includes(s)),
    areas: list('area').filter((a): a is AreaVerdict => Object.keys(AREA_RANK).includes(a)),
    channelGroup: channel && (CHANNEL_GROUPS as readonly string[]).includes(channel) ? (channel as ChannelGroup) : null,
    mine: sp.get('mine') === '1', unassigned: sp.get('unassigned') === '1', hideTest: sp.get('hideTest') === '1',
    showSpam: sp.get('showSpam') === '1', allSubmissions: sp.get('allSubmissions') === '1',
    q: sp.get('q') ?? '',
    sort: sort && (SORT_KEYS as readonly string[]).includes(sort) ? (sort as SortKey) : 'created_at',
    dir: sp.get('dir') === 'asc' ? 'asc' : 'desc',
  };
}
