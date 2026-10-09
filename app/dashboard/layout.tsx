import { requireUser } from '@/lib/auth';
import { signOut } from '@/app/login/actions';
import { DashboardShell } from '@/components/dashboard-shell';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
  return <DashboardShell userName={profile?.display_name ?? user.email ?? ''} signOut={signOut}>{children}</DashboardShell>;
}
