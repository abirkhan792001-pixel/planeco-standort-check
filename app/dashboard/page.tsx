import { requireUser } from '@/lib/auth';
import { deriveLeadViews, ownHost } from '@/lib/leads/derive';
import type { LeadRow } from '@/lib/leads/types';
import { LeadTable } from '@/components/lead-table';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  const [leads, profiles] = await Promise.all([
    supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(1000),
    supabase.from('profiles').select('id,display_name'),
  ]);
  if (leads.error) throw leads.error;
  const views = deriveLeadViews((leads.data ?? []) as LeadRow[], profiles.data ?? [], ownHost());
  return <LeadTable views={views} currentUserId={user.id} />;
}
