import { focusRing } from '@/components/form-ui';
import { LeadForm } from '@/components/lead-form';
import { NEXT_STEPS } from '@/components/landing/next-steps';
import { PlotSketch } from '@/components/landing/plot-sketch';
import { TrustStrip } from '@/components/landing/trust-strip';

export default function Home() {
  return (
    <div className="min-h-dvh bg-cream font-brand text-ink">
      <div className="bg-ink px-4 py-1.5 text-center text-xs text-cream">
        Case-Study-Prototyp – keine offizielle Seite der Planeco Building GmbH
      </div>

      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-semibold tracking-wide">planeco</span>
          <span aria-hidden="true" className="h-5 w-px bg-ink/20" />
          <span className="text-sm text-muted">Standort-Check</span>
        </div>
        <a href="#formular"
          className={`hidden min-h-11 items-center rounded-full border-2 border-terracotta-deep px-5 text-sm font-semibold text-terracotta-deep transition-colors hover:bg-terracotta-deep hover:text-white sm:inline-flex ${focusRing}`}>
          Kostenlos anfragen
        </a>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-12 pt-4 sm:px-6 md:pt-10 lg:grid-cols-12 lg:pb-20">
          <div className="lg:col-span-7">
            <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              Kostenloser Standort-Check für Ihr <span className="text-terracotta-deep">Grundstück.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg">Wir prüfen Lage und Genehmigungssituation Ihres Grundstücks – kostenlos und unverbindlich.</p>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {NEXT_STEPS.map((step, i) => (
                <li key={step} className="flex items-start gap-3 text-sm md:flex-col">
                  <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-sm font-semibold text-cream">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <a href="#formular"
              className={`mt-10 hidden min-h-14 items-center gap-3 rounded-full bg-terracotta-deep px-8 text-lg font-semibold text-white shadow-[0_8px_24px_-12px_rgb(169_86_58/0.7)] transition hover:brightness-90 md:inline-flex ${focusRing}`}>
              Jetzt Standort prüfen <span aria-hidden="true">→</span>
            </a>
          </div>
          <div className="hidden lg:col-span-5 lg:block">
            <PlotSketch className="mx-auto w-full max-w-md" />
          </div>
        </section>

        <section id="formular" aria-label="Anfrage" className="scroll-mt-6 px-4 pb-16 sm:px-6">
          <div className="mx-auto max-w-2xl">
            <LeadForm />
          </div>
        </section>

        <TrustStrip />
      </main>

      <footer className="px-4 pb-10 pt-2 text-center text-sm text-muted">
        <a href="/datenschutz" target="_blank" rel="noopener" className={`inline-flex min-h-11 items-center underline underline-offset-2 hover:text-ink ${focusRing}`}>Datenschutzhinweise</a>
      </footer>
    </div>
  );
}
