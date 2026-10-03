import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { missingRootIds } from '@/lib/leads/derive';
import type { LeadRow } from '@/lib/leads/types';

export const LEAD_WINDOW = 1000;
/** Ids per `in.(…)` request: keeps the PostgREST URL short (a uuid is 36 characters). */
const ID_CHUNK = 100;

/**
 * The newest `limit` leads plus every root that a duplicate in that window points to (spec §17 window + groups never
 * vanish). `truncated` is true when the limit was reached, so older leads may be missing.
 */
export async function loadLeadWindow(supabase: SupabaseClient, limit = LEAD_WINDOW): Promise<{ rows: LeadRow[]; truncated: boolean }> {
  const latest = await supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(limit);
  if (latest.error) throw latest.error;
  const rows = (latest.data ?? []) as LeadRow[];
  const missing = missingRootIds(rows);
  const chunks: string[][] = [];
  for (let i = 0; i < missing.length; i += ID_CHUNK) chunks.push(missing.slice(i, i + ID_CHUNK));
  const roots = await Promise.all(chunks.map((ids) => supabase.from('leads').select('*').in('id', ids)));
  for (const r of roots) {
    if (r.error) throw r.error;
    rows.push(...((r.data ?? []) as LeadRow[]));
  }
  return { rows, truncated: (latest.data?.length ?? 0) >= limit };
}
