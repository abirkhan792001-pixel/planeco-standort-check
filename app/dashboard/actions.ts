'use server';

import { revalidatePath } from 'next/cache';
import { SESSION_EXPIRED_MESSAGE } from '@/lib/labels';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { DisqualifyReason, LeadStatus } from '@/lib/leads/types';

export type ActionResult = { ok: boolean; message?: string; conflict?: boolean };

/**
 * Maps RPC errors to German UI messages. Without a valid session the request reaches PostgREST as `anon`, which has no
 * EXECUTE grant: that is "permission denied" (42501) or a JWT error (PGRST301/PGRST303), not the function's own
 * 'not_authenticated' raise — all of them mean "session gone" (spec C-4).
 */
function explain(error: { message: string; code?: string }): string {
  const { message, code } = error;
  if (message.includes('not_owner')) return 'Bitte zuerst übernehmen.';
  if (message.includes('reason_mismatch')) return 'Bitte einen Grund angeben.';
  if (message.includes('not_authenticated') || code === '42501' || code === 'PGRST301' || code === 'PGRST303' || /jwt/i.test(message)) {
    return SESSION_EXPIRED_MESSAGE;
  }
  return 'Aktion fehlgeschlagen.';
}

export async function claimLeadAction(id: string, force = false): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('claim_lead', { p_lead_id: id, p_force: force });
  if (error) return { ok: false, message: explain(error) };
  const row = (data as { result: string; owner_name: string | null }[] | null)?.[0];
  if (row?.result === 'conflict') {
    return { ok: false, conflict: true, message: `Bereits von ${row.owner_name ?? 'jemand anderem'} übernommen.` };
  }
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function releaseLeadAction(id: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('release_lead', { p_lead_id: id });
  if (error) return { ok: false, message: explain(error) };
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function setStatusAction(id: string, status: LeadStatus, reason: DisqualifyReason | null): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_lead_status', { p_lead_id: id, p_status: status, p_reason: reason });
  if (error) return { ok: false, message: explain(error) };
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function setNoteAction(id: string, note: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_lead_note', { p_lead_id: id, p_note: note });
  if (error) return { ok: false, message: explain(error) };
  revalidatePath('/dashboard');
  return { ok: true };
}
