import { focusRing } from '@/components/form-ui';
import { TrustStrip } from '@/components/landing/trust-strip';
import { StandortFlow } from '@/components/standort-flow';

export default function Home() {
  return (
    <div className="min-h-dvh bg-cream font-brand text-ink">
      <div className="bg-ink px-4 py-1.5 text-center text-xs text-cream">
        Case-Study-Prototyp – keine offizielle Seite der Planeco Building GmbH
      </div>
      <StandortFlow />
      <TrustStrip />
      <footer className="px-4 pb-10 pt-2 text-center text-sm text-muted">
        <a href="/datenschutz" target="_blank" rel="noopener" className={`inline-flex min-h-11 items-center underline underline-offset-2 hover:text-ink ${focusRing}`}>Datenschutzhinweise</a>
      </footer>
    </div>
  );
}
