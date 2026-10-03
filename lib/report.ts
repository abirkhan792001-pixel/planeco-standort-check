import type { ChannelGroup } from '@/lib/attribution/types';
import type { LeadView } from '@/lib/leads/derive';
import type { DisqualifyReason } from '@/lib/leads/types';

/** A rate over fewer than this many leads (its own denominator) says too little; the report page greys it out. */
export const MIN_SAMPLE = 20;

export type ReportRow = {
  group: ChannelGroup; channel: string; campaign: string;
  /** Root leads (no duplicates, no spam). */
  leads: number;
  /** Area verdict `inside`, and the leads that have a verdict at all (inside/edge/outside): denominator of the in-area rate. */
  inside: number; located: number; unclear: number;
  /** Qualified (qualifiziert/gewonnen/verloren) and decided (qualified + nicht_qualifiziert): the qualification rate. */
  qualified: number; decided: number; won: number;
  topReason: DisqualifyReason | null;
  /** Mean hours from creation to claim (`assigned_at`), over the leads that were claimed. */
  avgHoursToClaim: number | null;
};

/**
 * Pure: which of a row's rates rest on too few cases (spec: rates with n < 20 are greyed out). Each rate is judged by its
 * own denominator: the in-area rate by `located`, the qualification rate by `decided`, not by the lead count.
 */
export function rateConfidence(row: Pick<ReportRow, 'located' | 'decided'>): { areaThin: boolean; qualThin: boolean } {
  return { areaThin: row.located < MIN_SAMPLE, qualThin: row.decided < MIN_SAMPLE };
}

const QUALIFIED = new Set(['qualifiziert', 'gewonnen', 'verloren']);
const LOCATED = new Set(['inside', 'edge', 'outside']);

/**
 * Pure: one row per channel group + channel + campaign over the root leads of `views` (duplicates and spam never
 * count; test leads only with `includeTest`). Sorted by group, then channel, then campaign (German collation), so the
 * rows of one group stay together.
 */
export function buildChannelReport(views: LeadView[], opts: { includeTest: boolean }): ReportRow[] {
  const groups = new Map<string, LeadView[]>();
  for (const v of views) {
    if (v.duplicate_of || v.spam_suspected || (!opts.includeTest && v.is_test)) continue;
    // JSON key: a campaign name is free text, so a separator character could merge two different rows.
    const key = JSON.stringify([v.channel.group, v.channel.channel, v.channel.campaign]);
    const list = groups.get(key);
    if (list) list.push(v);
    else groups.set(key, [v]);
  }
  return [...groups.values()].map((list) => {
    const reasons = new Map<DisqualifyReason, number>();
    let claimHours = 0;
    let claimed = 0;
    for (const v of list) {
      if (v.disqualify_reason) reasons.set(v.disqualify_reason, (reasons.get(v.disqualify_reason) ?? 0) + 1);
      if (v.assigned_at) {
        const hours = (Date.parse(v.assigned_at) - Date.parse(v.created_at)) / 3_600_000;
        if (Number.isFinite(hours)) {
          claimHours += hours;
          claimed++;
        }
      }
    }
    const qualified = list.filter((v) => QUALIFIED.has(v.status)).length;
    return {
      group: list[0].channel.group, channel: list[0].channel.channel, campaign: list[0].channel.campaign,
      leads: list.length,
      inside: list.filter((v) => v.area.verdict === 'inside').length,
      located: list.filter((v) => LOCATED.has(v.area.verdict)).length,
      unclear: list.filter((v) => v.area.verdict === 'unclear').length,
      qualified,
      decided: qualified + list.filter((v) => v.status === 'nicht_qualifiziert').length,
      won: list.filter((v) => v.status === 'gewonnen').length,
      topReason: [...reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      avgHoursToClaim: claimed ? claimHours / claimed : null,
    };
  }).sort((a, b) => (
    a.group.localeCompare(b.group, 'de') || a.channel.localeCompare(b.channel, 'de') || a.campaign.localeCompare(b.campaign, 'de')
  ));
}
