import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { missingRootIds } from '@/lib/leads/derive';
import type { LeadListRow } from '@/lib/leads/types';

export const LEAD_WINDOW = 1000;
/**
 * PostgREST answers at most this many rows per request (Supabase default `max-rows`), no matter what `limit` or a wider
 * `range` asks for. Larger windows have to be read page by page.
 */
const PAGE_SIZE = 1000;
/** Ids per `in.(…)` request: keeps the PostgREST URL short (a uuid is 36 characters). */
const ID_CHUNK = 100;

/** Every `leads` column except `geo_raw` (the raw OpenPLZ/Nominatim payloads: large, only needed for debugging). */
const LIST_COLUMN_KEYS = [
  'id', 'created_at', 'idempotency_key', 'is_test',
  'first_name', 'last_name', 'email', 'email_normalized', 'phone_raw', 'phone_e164', 'phone_valid', 'phone_extension', 'reachability',
  'address_unknown', 'street', 'house_number', 'postal_code', 'city', 'plot_note', 'address_key', 'project_type', 'privacy_notice_version',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'placement', 'affiliate', 'landing_path', 'referrer', 'device_type',
  'duplicate_of', 'duplicate_reason', 'related_lead_id', 'spam_suspected', 'spam_reason',
  'status', 'disqualify_reason', 'assigned_to', 'assigned_at', 'status_changed_at', 'sales_note',
  'email_status', 'email_attempts', 'email_last_error', 'email_skip_reason', 'email_sent_at', 'email_claimed_at',
  'enrichment_status', 'enrichment_attempts', 'enrichment_last_error', 'enriched_at',
  'geo_precision', 'geo_lat', 'geo_lon', 'geo_municipality', 'geo_municipality_key', 'geo_district', 'geo_state_code',
  'geo_found_postcode', 'geo_flags', 'geo_candidates',
] as const satisfies readonly (keyof LeadListRow)[];
// A test compares this list with the LeadRow fixture, so a new column cannot be forgotten silently.
export const LIST_COLUMNS: string = LIST_COLUMN_KEYS.join(',');

/**
 * The newest `limit` leads plus every root that a duplicate in that window points to (spec §17 window + groups never
 * vanish). Read in 1000-row pages because of the API cap. One row more than `limit` is requested, to tell "exactly
 * `limit` leads exist" from "older leads exist": `truncated` is true only in the second case.
 */
export async function loadLeadWindow(supabase: SupabaseClient, limit = LEAD_WINDOW): Promise<{ rows: LeadListRow[]; truncated: boolean }> {
  const want = limit + 1;
  // Keyed by id: a lead inserted while paging shifts the rows and would otherwise repeat one at a page boundary.
  const byId = new Map<string, LeadListRow>();
  let fetched = 0; // rows received so far, repeats included: this is the offset of the next page
  while (byId.size < want) {
    const size = Math.min(PAGE_SIZE, want - byId.size);
    const page = await supabase
      .from('leads').select(LIST_COLUMNS)
      // `id` as tie-breaker keeps the order total, so rows with equal timestamps cannot straddle or skip a page boundary.
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(fetched, fetched + size - 1);
    if (page.error) throw page.error;
    const data = (page.data ?? []) as unknown as LeadListRow[];
    for (const r of data) byId.set(r.id, r);
    fetched += data.length;
    if (data.length < size) break; // short page: no more rows
  }
  const all = [...byId.values()];
  const truncated = all.length > limit;
  const rows = truncated ? all.slice(0, limit) : all;

  const missing = missingRootIds(rows);
  const chunks: string[][] = [];
  for (let i = 0; i < missing.length; i += ID_CHUNK) chunks.push(missing.slice(i, i + ID_CHUNK));
  const roots = await Promise.all(chunks.map((ids) => supabase.from('leads').select(LIST_COLUMNS).in('id', ids)));
  for (const r of roots) {
    if (r.error) throw r.error;
    rows.push(...((r.data ?? []) as unknown as LeadListRow[]));
  }
  return { rows, truncated };
}
