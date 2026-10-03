'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import type { DisqualifyReason, LeadStatus } from '@/lib/leads/types';

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
