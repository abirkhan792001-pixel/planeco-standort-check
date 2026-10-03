import type { ChannelGroup } from '@/lib/attribution/types';
import type { AreaVerdict } from '@/lib/geo/service-area';
import { foldGerman } from '@/lib/leads/normalize';
import { LEAD_STATUSES, type LeadStatus } from '@/lib/leads/types';
import type { LeadView } from '@/lib/leads/derive';

export type SortKey = 'created_at' | 'name' | 'plot' | 'area' | 'channel' | 'status' | 'owner';
export type Filters = {
  statuses: LeadStatus[]; areas: AreaVerdict[]; channelGroup: ChannelGroup | null;
  mine: boolean; unassigned: boolean; hideTest: boolean; showSpam: boolean; allSubmissions: boolean;
  q: string; sort: SortKey; dir: 'asc' | 'desc';
};

export const DEFAULT_FILTERS: Filters = {
  statuses: [], areas: [], channelGroup: null, mine: false, unassigned: false, hideTest: false, showSpam: false,
  allSubmissions: false, q: '', sort: 'created_at', dir: 'desc',
};

const AREA_RANK: Record<AreaVerdict, number> = { inside: 0, edge: 1, unclear: 2, pending: 3, failed: 4, outside: 5, 'n/a': 6 };
const SORT_KEYS: SortKey[] = ['created_at', 'name', 'plot', 'area', 'channel', 'status', 'owner'];

export function applyFilters(rows: LeadView[], f: Filters, currentUserId: string): LeadView[] {
  const q = foldGerman(f.q.trim());
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
      const digits = q.replace(/\D/g, '');
      const hayDigits = `${r.phone_raw.replace(/\D/g, '')} ${(r.phone_e164 ?? '').replace(/\D/g, '')}`;
      if (!hay.includes(q) && !(digits.length >= 4 && hayDigits.includes(digits))) return false;
    }
    return true;
  });
}

function sortValue(r: LeadView, key: SortKey): string | number {
  switch (key) {
    case 'created_at': return Date.parse(r.created_at);
    case 'name': return foldGerman(`${r.last_name} ${r.first_name}`);
    case 'plot': return foldGerman(r.plotLabel);
    case 'area': return AREA_RANK[r.area.verdict] * 10_000 + (r.area.distanceKm ?? 9_999);
    case 'channel': return foldGerman(`${r.channel.group} ${r.channel.channel} ${r.channel.campaign}`);
    case 'status': return LEAD_STATUSES.indexOf(r.status);
    case 'owner': return foldGerman(r.ownerName ?? '~');
  }
}

export function sortRows(rows: LeadView[], key: SortKey, dir: 'asc' | 'desc'): LeadView[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    return (va < vb ? -1 : va > vb ? 1 : 0) * sign;
  });
}

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
  const sort = sp.get('sort') as SortKey | null;
  return {
    statuses: list('status').filter((s): s is LeadStatus => (LEAD_STATUSES as readonly string[]).includes(s)),
    areas: list('area').filter((a): a is AreaVerdict => a in AREA_RANK),
    channelGroup: (sp.get('channel') as ChannelGroup | null) ?? null,
    mine: sp.get('mine') === '1', unassigned: sp.get('unassigned') === '1', hideTest: sp.get('hideTest') === '1',
    showSpam: sp.get('showSpam') === '1', allSubmissions: sp.get('allSubmissions') === '1',
    q: sp.get('q') ?? '',
    sort: sort && SORT_KEYS.includes(sort) ? sort : 'created_at',
    dir: sp.get('dir') === 'asc' ? 'asc' : 'desc',
  };
}
