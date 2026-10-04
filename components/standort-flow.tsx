'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Step } from '@/lib/leads/wizard';
import { focusRing } from './form-ui';
import { PlanecoMark } from './landing/brand';
import { Hero } from './landing/hero';
import { LeadForm } from './lead-form';

type Screen = 0 | Step;
const isScreen = (s: unknown): s is Screen => s === 0 || s === 1 || s === 2 || s === 3;

/**
 * Start screen + three form steps on one URL (landing spec §10). Every screen change is a history entry, so the
 * browser's Back button goes one screen back; the URL (with its UTM parameters) never changes. The existing history
 * state is spread into ours so Next's router state survives. The form stays mounted (hidden) on the start screen,
 * so typed values survive going back.
 */
export function StandortFlow() {
  const [screen, setScreen] = useState<Screen>(0);
  const heroHeading = useRef<HTMLHeadingElement>(null);
  const previous = useRef<Screen>(0);

  useEffect(() => {
    window.history.replaceState({ ...(window.history.state ?? {}), standortScreen: 0 }, '');
    const onPop = (e: PopStateEvent) => {
      const s = (e.state as { standortScreen?: unknown } | null)?.standortScreen;
      setScreen(isScreen(s) ? s : 0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (screen === 0 && previous.current !== 0) heroHeading.current?.focus();
    previous.current = screen;
  }, [screen]);

  const go = useCallback((next: Screen) => {
    setScreen(next);
    window.history.pushState({ ...(window.history.state ?? {}), standortScreen: next }, '');
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <>
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2">
            <PlanecoMark className="h-9 w-auto" />
            <span className="text-2xl font-semibold tracking-wide">planeco</span>
          </span>
          <span aria-hidden="true" className="h-5 w-px bg-ink/20" />
          <span className="text-sm text-muted">Standort-Check</span>
        </div>
        {screen === 0 && (
          <button type="button" onClick={() => go(1)}
            className={`hidden min-h-11 items-center rounded-full border-2 border-terracotta-deep px-5 text-sm font-semibold text-terracotta-deep transition-colors hover:bg-terracotta-deep hover:text-white sm:inline-flex ${focusRing}`}>
            Kostenlos anfragen
          </button>
        )}
      </header>
      <main>
        {screen === 0 && <Hero onStart={() => go(1)} headingRef={heroHeading} />}
        <div hidden={screen === 0}>
          <LeadForm step={screen === 0 ? 1 : screen} active={screen !== 0} onStep={go} />
        </div>
      </main>
    </>
  );
}
