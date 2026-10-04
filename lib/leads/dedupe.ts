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

/**
 * Pure. Never matches on name. Spec §13.
 * The earliest root that is still open and at most DUPLICATE_WINDOW_DAYS old becomes `duplicate_of` (reasons and owner
 * from its group). Closed or old roots are skipped, so a third submission joins the open lead instead of starting a
 * second one beside it. Only when no root is eligible is the new lead a root itself, related to the earliest root.
 */
export function decideDuplicate(keys: DedupeKeys, matches: MatchRow[], now: Date): DuplicateDecision {
  if (matches.length === 0) return NO_DUPLICATE;
  const byId = new Map(matches.map((m) => [m.id, m]));
  const roots = [...new Set(matches.map((m) => m.duplicate_of ?? m.id))]
    .map((id) => byId.get(id))
    .filter((r): r is MatchRow => Boolean(r))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  if (roots.length === 0) return NO_DUPLICATE;

  const eligible = (r: MatchRow) =>
    (now.getTime() - Date.parse(r.created_at)) / 86_400_000 <= DUPLICATE_WINDOW_DAYS && !TERMINAL_STATUSES.includes(r.status);
  const root = roots.find(eligible);
  if (!root) return { ...NO_DUPLICATE, relatedLeadId: roots[0].id };

  const group = matches.filter((m) => (m.duplicate_of ?? m.id) === root.id);
  const reasons: DuplicateReason[] = [];
  if (group.some((m) => m.email_normalized === keys.email_normalized)) reasons.push('email');
  if (keys.phone_e164 && group.some((m) => m.phone_e164 === keys.phone_e164)) reasons.push('phone');
  if (keys.address_key && group.some((m) => m.address_key === keys.address_key)) reasons.push('address');
  return { duplicateOf: root.id, duplicateReason: reasons, relatedLeadId: null, assignedTo: root.assigned_to };
}

/**
 * Three small queries instead of one PostgREST `or()` string: no quoting/injection issues with emails or keys.
 * `isTest` is the new lead's flag: test and real leads never link (a reviewer's test must not land on a real lead).
 */
export async function findMatches(db: SupabaseClient, keys: DedupeKeys, isTest: boolean): Promise<MatchRow[]> {
  const by = async (col: keyof DedupeKeys, value: string | null) => {
    if (!value) return [] as MatchRow[];
    const { data, error } = await db.from('leads').select(COLS).eq(col, value).eq('spam_suspected', false)
      .eq('is_test', isTest).order('created_at', { ascending: true }).limit(20);
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
    const { data, error } = await db.from('leads').select(COLS).in('id', missingRoots).eq('is_test', isTest);
    if (error) throw error;
    for (const r of (data ?? []) as MatchRow[]) byId.set(r.id, r);
  }
  return [...byId.values()];
}
