'use server';

import { redirect } from 'next/navigation';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function signIn(_prev: string | null, formData: FormData): Promise<string | null> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Rate limit (429) or outage (5xx, or a network failure which auth-js reports as a retryable error with status 0):
    // do not blame the user's password for it.
    if ((error.status ?? 0) >= 429 || isAuthRetryableFetchError(error)) {
      return 'Anmeldung derzeit nicht möglich – bitte später erneut versuchen.';
    }
    return 'E-Mail oder Passwort ist falsch.';
  }
  redirect('/dashboard');
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: 'local' }); // this device only; other sessions of the same user stay signed in
  redirect('/login');
}
