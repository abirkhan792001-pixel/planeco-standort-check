import { WAIT_ALERT_HOURS, WAIT_WARN_HOURS } from '@/lib/config/app';
import { berlinMinuteOfDay } from '@/lib/format';
import type { LabelTone } from '@/lib/labels';
import { REACHABILITY, TERMINAL_STATUSES, type LeadRow, type Reachability } from '@/lib/leads/types';

/**
 * Call windows behind the form's reachability options, as Berlin hours [from, to). The form shows them as
 * REACHABILITY_HOURS (lib/labels); a test keeps the two in step.
 */
export const REACHABILITY_WINDOWS: Record<Reachability, readonly [number, number]> = {
  vormittags: [8, 12], nachmittags: [12, 17], abends: [17, 20],
};

export type Waiting = { text: string; tone: LabelTone };

/**
 * How long a lead has waited for someone to claim it. Only for leads that need a first call: new, unclaimed, a root
 * (duplicate rows belong to their root) and not suspected spam. Grey under WAIT_WARN_HOURS, ochre, then brick.
 */
export function waitingTime(
  l: Pick<LeadRow, 'status' | 'assigned_to' | 'duplicate_of' | 'spam_suspected' | 'created_at'>, nowMs: number,
): Waiting | null {
  if (l.status !== 'neu' || l.assigned_to || l.duplicate_of || l.spam_suspected) return null;
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(l.created_at)) / 60_000));
  const hours = minutes / 60;
  const text = minutes < 1 ? 'gerade eingegangen'
    : minutes < 60 ? `wartet ${minutes} Min.`
      : hours < 48 ? `wartet ${Math.floor(hours)} Std.`
        : `wartet ${Math.floor(hours / 24)} Tage`;
  const tone: LabelTone = hours >= WAIT_ALERT_HOURS ? 'red' : hours >= WAIT_WARN_HOURS ? 'amber' : 'grey';
  return { text, tone };
}

/**
 * If the lead asked to be called in a window that is open right now (Berlin time), the hour that run of windows ends:
 * "vormittags + nachmittags" at 10:00 → 17, not 12. null outside every chosen window and for closed leads.
 */
export function reachableUntil(l: Pick<LeadRow, 'reachability' | 'status'>, nowMs: number): number | null {
  if (TERMINAL_STATUSES.includes(l.status)) return null;
  const minute = berlinMinuteOfDay(nowMs);
  const open = l.reachability.find((s) => { const [from, to] = REACHABILITY_WINDOWS[s]; return minute >= from * 60 && minute < to * 60; });
  if (!open) return null;
  let until = REACHABILITY_WINDOWS[open][1];
  // Extend across adjacent chosen windows (REACHABILITY is in clock order).
  for (const s of REACHABILITY) if (l.reachability.includes(s) && REACHABILITY_WINDOWS[s][0] === until) until = REACHABILITY_WINDOWS[s][1];
  return until;
}
