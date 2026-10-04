import type { Ref } from 'react';
import { focusRing } from '@/components/form-ui';
import { TrustBadges } from './brand';
import { NEXT_STEPS } from './next-steps';
import { PlotSketch } from './plot-sketch';

/** Start screen: what the Standort-Check is, the three steps, and the button into the form. */
export function Hero({ onStart, headingRef }: { onStart: () => void; headingRef?: Ref<HTMLHeadingElement> }) {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-12 pt-4 sm:px-6 md:pt-10 lg:grid-cols-12 lg:pb-20">
      <div className="lg:col-span-7">
        <h1 ref={headingRef} tabIndex={-1} className="text-4xl font-bold leading-[1.1] tracking-tight outline-none sm:text-5xl lg:text-6xl">
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
        <button type="button" onClick={onStart}
          className={`mt-10 inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-full bg-terracotta-deep px-8 text-lg font-semibold text-white shadow-[0_8px_24px_-12px_rgb(169_86_58/0.7)] transition hover:brightness-90 sm:w-auto ${focusRing}`}>
          Jetzt Standort prüfen <span aria-hidden="true">→</span>
        </button>
        <TrustBadges className="mt-10 justify-center sm:justify-start" />
      </div>
      <div className="hidden lg:col-span-5 lg:block">
        <PlotSketch className="mx-auto w-full max-w-md" />
      </div>
    </section>
  );
}
