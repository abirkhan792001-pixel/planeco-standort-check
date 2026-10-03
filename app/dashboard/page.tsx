import { requireUser } from '@/lib/auth';
import { deriveLeadViews, ownHost } from '@/lib/leads/derive';
import { loadLeadWindow } from '@/lib/dashboard/load';
import { LeadTable } from '@/components/lead-table';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  const [leads, profiles] = await Promise.all([
    loadLeadWindow(supabase),
    supabase.from('profiles').select('id,display_name'),
  ]);
  // Without profiles the list still works; owners then show as "Unbekannt". Log only code/message (no row data).
  if (profiles.error) console.error('dashboard: profiles query failed', { code: profiles.error.code, message: profiles.error.message });
  const views = deriveLeadViews(leads.rows, profiles.data ?? [], ownHost());
  return <LeadTable views={views} currentUserId={user.id} truncated={leads.truncated} />;
}
