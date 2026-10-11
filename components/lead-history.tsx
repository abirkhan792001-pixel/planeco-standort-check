'use client';

import { useEffect, useState } from 'react';
import { leadHistoryAction, type HistoryResult } from '@/app/dashboard/actions';
import type { HistoryKind } from '@/lib/dashboard/history';
import { formatBerlin } from '@/lib/format';
import { Eyebrow } from './ui';

const DOT: Record<HistoryKind, string> = { sales: 'bg-ink', system: 'bg-line', problem: 'bg-brick' };
const TEXT: Record<HistoryKind, string> = { sales: 'text-ink', system: 'text-muted', problem: 'text-brick' };

/**
 * "Verlauf" in the Details panel: loaded when the panel opens (rootId = the group's root). The row re-mounts when its
 * status or note changes, so the list re-loads after the user's own edits.
 */
export function LeadHistory({ rootId }: { rootId: string }) {
  const [state, setState] = useState<HistoryResult | null>(null);
  useEffect(() => {
    let current = true;
    leadHistoryAction(rootId).then(
      (r) => { if (current) setState(r); },
      // An expired session redirects through the action itself; anything else reads as a load failure.
      () => { if (current) setState({ ok: false, message: 'Verlauf konnte nicht geladen werden.' }); },
    );
    return () => { current = false; };
  }, [rootId]);

  return <HistoryList state={state} />;
}

/** The list itself: loading (null), error, empty, or the events as a small timeline. */
export function HistoryList({ state }: { state: HistoryResult | null }) {
  return (
    <section aria-label="Verlauf">
      <Eyebrow>Verlauf</Eyebrow>
      {state === null && <p className="mt-1 text-xs text-muted" aria-live="polite">Wird geladen …</p>}
      {state && !state.ok && <p className="mt-1 text-xs text-brick" role="alert">{state.message}</p>}
      {state?.ok && state.items.length === 0 && <p className="mt-1 text-xs text-muted">Noch keine Einträge.</p>}
      {state?.ok && state.items.length > 0 && (
        <ol className="mt-2 max-h-72 overflow-y-auto pr-1">
          {state.items.map((h) => (
            <li key={h.id} className="relative pb-3 pl-5 last:pb-0 before:absolute before:bottom-0 before:left-[3.5px] before:top-3 before:w-px before:bg-hairline last:before:hidden">
              <span aria-hidden="true" className={`absolute left-0 top-1.5 size-2 rounded-full ${DOT[h.kind]}`} />
              <p className={`text-[13px] leading-snug ${TEXT[h.kind]}`}>{h.text}</p>
              <p className="font-data text-[11px] text-muted">
                {formatBerlin(h.at)}{h.actor && <span className="font-ui"> · {h.actor}</span>}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
