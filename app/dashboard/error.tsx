'use client';

import { useEffect } from 'react';

/** Error boundary for the dashboard pages (spec C-4): no blank screen, a German message and a reload. */
export default function DashboardError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error('dashboard error', error.digest ?? error.message);
  }, [error]);
  return (
    <div role="alert" className="mx-auto max-w-md space-y-3 rounded-lg border border-red-200 bg-white p-6 text-center">
      <h1 className="text-lg font-semibold">Etwas ist schiefgelaufen</h1>
      <p className="text-sm text-stone-600">Bitte die Seite neu laden. Bleibt der Fehler, in ein paar Minuten erneut versuchen.</p>
      <button type="button" onClick={() => window.location.reload()} className="rounded bg-stone-800 px-3 py-1.5 text-sm text-white">
        Seite neu laden
      </button>
    </div>
  );
}
