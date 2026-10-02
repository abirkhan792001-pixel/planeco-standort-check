import type { SupabaseClient } from '@supabase/supabase-js';

export async function logEvent(db: SupabaseClient, leadId: string, type: string, data: Record<string, unknown> = {}): Promise<void> {
  const { error } = await db.from('lead_events').insert({ lead_id: leadId, type, data });
  if (error) console.error('logEvent failed', type, error);
}
