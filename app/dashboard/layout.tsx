import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { signOut } from '@/app/login/actions';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
  return (
    <div className="min-h-dvh bg-stone-50 text-stone-900">
      <header className="flex flex-wrap items-center gap-4 border-b border-stone-200 bg-white px-4 py-3">
        <strong>Standort-Check · Vertrieb</strong>
        <nav className="flex gap-3 text-sm">
          <Link href="/dashboard" className="underline-offset-4 hover:underline">Anfragen</Link>
          <Link href="/dashboard/report" className="underline-offset-4 hover:underline">Kanäle</Link>
        </nav>
        <span className="ml-auto text-sm text-stone-600">{profile?.display_name ?? user.email}</span>
        <form action={signOut}><button className="text-sm underline">Abmelden</button></form>
      </header>
      <main className="px-4 py-4">{children}</main>
      <footer className="px-4 pb-4 text-xs text-stone-500">Geodaten © OpenStreetMap-Mitwirkende (ODbL) · PLZ-Daten: OpenPLZ API</footer>
    </div>
  );
}
