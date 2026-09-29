import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Supabase admin env vars missing');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
