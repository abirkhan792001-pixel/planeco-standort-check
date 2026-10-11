'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import type { DisqualifyReason, LeadStatus } from '@/lib/leads/types';
import { buildHistory, type HistoryItem, type LeadEvent } from '@/lib/dashboard/history';

export type ActionResult = { ok: boolean; message?: string; conflict?: boolean };

/**
 * Spec C-4: every action checks the session first. `requireUser()` calls `redirect('/login')` when there is no user;
 * inside a server action Next turns that into an action redirect that the client router follows. The middleware lets
 * server-action POSTs through (it does not redirect them), so this check is what handles an expired session.
 */
async function authed() {
  const { supabase } = await requireUser();
  return supabase;
}

/** Maps RPC errors to German UI messages. The session was verified just before, so 42501 is a real permission problem. */
function fail(error: { message: string; code?: string }): ActionResult {
  const { message, code } = error;
  // The session ended between the check and the RPC (race): treat it like the check itself.
  if (message.includes('not_authenticated')) redirect('/login');
  if (message.includes('not_owner')) return { ok: false, message: 'Bitte zuerst übernehmen.' };
  if (message.includes('reason_mismatch')) return { ok: false, message: 'Bitte einen Grund angeben.' };
  if (code === '42501') return { ok: false, message: 'Keine Berechtigung für diese Aktion.' };
  return { ok: false, message: 'Aktion fehlgeschlagen.' };
}

export async function claimLeadAction(id: string, force = false): Promise<ActionResult> {
  const supabase = await authed();
  const { data, error } = await supabase.rpc('claim_lead', { p_lead_id: id, p_force: force });
  if (error) return fail(error);
  const row = (data as { result: string; owner_name: string | null }[] | null)?.[0];
  if (row?.result === 'conflict') {
    return { ok: false, conflict: true, message: `Bereits von ${row.owner_name ?? 'jemand anderem'} übernommen.` };
  }
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function releaseLeadAction(id: string): Promise<ActionResult> {
  const supabase = await authed();
  const { error } = await supabase.rpc('release_lead', { p_lead_id: id });
  if (error) return fail(error);
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function setStatusAction(id: string, status: LeadStatus, reason: DisqualifyReason | null): Promise<ActionResult> {
  const supabase = await authed();
  const { error } = await supabase.rpc('set_lead_status', { p_lead_id: id, p_status: status, p_reason: reason });
  if (error) return fail(error);
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function setNoteAction(id: string, note: string): Promise<ActionResult> {
  const supabase = await authed();
  const { error } = await supabase.rpc('set_lead_note', { p_lead_id: id, p_note: note });
  if (error) return fail(error);
  revalidatePath('/dashboard');
  return { ok: true };
}

export type HistoryResult = { ok: true; items: HistoryItem[] } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Enough for any real lead; duplicates' own mail/address events are read but dropped by buildHistory. */
const HISTORY_READ_LIMIT = 200;

function historyFail(where: string, error: { message: string; code?: string }): HistoryResult {
  // Code/message only, never row data.
  console.error(`leadHistory: ${where} failed`, { code: error.code, message: error.message });
  return { ok: false, message: 'Verlauf konnte nicht geladen werden.' };
}

/** Read-only: the events of a lead group (RLS lets every signed-in user read them), described in German. */
export async function leadHistoryAction(rootId: string): Promise<HistoryResult> {
  if (!UUID.test(rootId)) return { ok: false, message: 'Verlauf konnte nicht geladen werden.' };
  const supabase = await authed();
  const dups = await supabase.from('leads').select('id').eq('duplicate_of', rootId);
  if (dups.error) return historyFail('duplicates', dups.error);
  const events = await supabase.from('lead_events').select('id,lead_id,created_at,actor_id,type,data')
    .in('lead_id', [rootId, ...(dups.data ?? []).map((d) => d.id as string)])
    .order('created_at', { ascending: false }).limit(HISTORY_READ_LIMIT);
  if (events.error) return historyFail('events', events.error);
  const rows = (events.data ?? []) as LeadEvent[];
  // People named in the history: whoever acted, and the previous owner of a forced claim.
  const people = [...new Set(rows.flatMap((e) => [e.actor_id, e.data?.previous_owner]).filter((id): id is string => typeof id === 'string'))];
  const names = new Map<string, string>();
  if (people.length) {
    const profiles = await supabase.from('profiles').select('id,display_name').in('id', people);
    if (profiles.error) console.error('leadHistory: profiles failed', { code: profiles.error.code, message: profiles.error.message });
    for (const p of profiles.data ?? []) names.set(p.id as string, p.display_name as string);
  }
  return { ok: true, items: buildHistory(rows, rootId, names) };
}
