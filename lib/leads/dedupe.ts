import type { SupabaseClient } from '@supabase/supabase-js';
import { DUPLICATE_WINDOW_DAYS } from '@/lib/config/app';
import { TERMINAL_STATUSES, type LeadStatus } from './types';

export type DedupeKeys = { email_normalized: string; phone_e164: string | null; address_key: string | null };
export type MatchRow = {
  id: string; duplicate_of: string | null; status: LeadStatus; assigned_to: string | null; created_at: string;
  email_normalized: string; phone_e164: string | null; address_key: string | null;
};
export type DuplicateReason = 'email' | 'phone' | 'address';
export type DuplicateDecision = {
  duplicateOf: string | null; duplicateReason: DuplicateReason[]; relatedLeadId: string | null; assignedTo: string | null;
};

export const NO_DUPLICATE: DuplicateDecision = { duplicateOf: null, duplicateReason: [], relatedLeadId: null, assignedTo: null };

const COLS = 'id,duplicate_of,status,assigned_to,created_at,email_normalized,phone_e164,address_key';

/** Pure. Never matches on name. Spec §13. */
export function decideDuplicate(keys: DedupeKeys, matches: MatchRow[], now: Date): DuplicateDecision {
  if (matches.length === 0) return NO_DUPLICATE;
  const byId = new Map(matches.map((m) => [m.id, m]));
  const roots = [...new Set(matches.map((m) => m.duplicate_of ?? m.id))]
    .map((id) => byId.get(id))
    .filter((r): r is MatchRow => Boolean(r))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const root = roots[0];
  if (!root) return NO_DUPLICATE;

  const group = matches.filter((m) => (m.duplicate_of ?? m.id) === root.id);
  const reasons: DuplicateReason[] = [];
  if (group.some((m) => m.email_normalized === keys.email_normalized)) reasons.push('email');
  if (keys.phone_e164 && group.some((m) => m.phone_e164 === keys.phone_e164)) reasons.push('phone');
  if (keys.address_key && group.some((m) => m.address_key === keys.address_key)) reasons.push('address');

  const ageDays = (now.getTime() - Date.parse(root.created_at)) / 86_400_000;
  if (ageDays <= DUPLICATE_WINDOW_DAYS && !TERMINAL_STATUSES.includes(root.status)) {
    return { duplicateOf: root.id, duplicateReason: reasons, relatedLeadId: null, assignedTo: root.assigned_to };
  }
  return { ...NO_DUPLICATE, relatedLeadId: root.id };
}

/** Three small queries instead of one PostgREST `or()` string: no quoting/injection issues with emails or keys. */
export async function findMatches(db: SupabaseClient, keys: DedupeKeys): Promise<MatchRow[]> {
  const by = async (col: keyof DedupeKeys, value: string | null) => {
    if (!value) return [] as MatchRow[];
    const { data, error } = await db.from('leads').select(COLS).eq(col, value).eq('spam_suspected', false)
      .order('created_at', { ascending: true }).limit(20);
    if (error) throw error;
    return (data ?? []) as MatchRow[];
  };
  const found = [
    ...(await by('email_normalized', keys.email_normalized)),
    ...(await by('phone_e164', keys.phone_e164)),
    ...(await by('address_key', keys.address_key)),
  ];
  const byId = new Map(found.map((m) => [m.id, m]));
  const missingRoots = [...new Set(found.map((m) => m.duplicate_of).filter((id): id is string => !!id && !byId.has(id)))];
  if (missingRoots.length) {
    const { data, error } = await db.from('leads').select(COLS).in('id', missingRoots);
    if (error) throw error;
    for (const r of (data ?? []) as MatchRow[]) byId.set(r.id, r);
  }
  return [...byId.values()];
}
