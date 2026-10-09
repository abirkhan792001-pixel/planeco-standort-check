import { dashboardFonts } from '@/app/fonts';
import { PlanecoMark } from './landing/brand';
import { DashboardNav } from './dashboard-nav';
import { focusRing } from './ui';

/** Header, main and footer of every internal page (the dashboard layout). */
export function DashboardShell({ userName, signOut, children }: { userName: string; signOut: () => Promise<void>; children: React.ReactNode }) {
  return (
    <div className={`${dashboardFonts} flex min-h-dvh flex-col bg-cream text-ink`}>
      <header className="flex h-14 items-center gap-4 bg-ink px-4 text-white sm:gap-6 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-white" title="Standort-Check · Vertrieb"><PlanecoMark className="h-5 w-auto" /></span>
          <span className="hidden font-brand text-[15px] font-semibold leading-tight sm:block">Standort-Check
            <span className="block text-[11px] font-normal tracking-wide text-white/60">Vertrieb</span>
          </span>
        </div>
        <DashboardNav />
        <span className="ml-auto hidden text-sm text-white/70 sm:inline">{userName}</span>
        <form action={signOut} className="max-sm:ml-auto">
          <button className={`rounded-md px-2 py-1 text-sm text-white/80 underline-offset-4 hover:text-white hover:underline ${focusRing}`}>Abmelden</button>
        </form>
      </header>
      <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      <footer className="px-4 pb-4 text-xs text-muted sm:px-6">Geodaten © OpenStreetMap-Mitwirkende (ODbL) · PLZ-Daten: OpenPLZ API</footer>
    </div>
  );
}
