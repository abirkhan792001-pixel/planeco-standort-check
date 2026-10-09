'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui';

/** Error boundary for the dashboard pages (spec C-4): no blank screen, a German message and a reload. */
export default function DashboardError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error('dashboard error', error.digest ?? error.message);
  }, [error]);
  return (
    <div role="alert" className="mx-auto mt-10 max-w-md space-y-3 rounded-lg border border-brick/30 bg-surface p-6 text-center">
      <h1 className="font-brand text-lg font-semibold">Etwas ist schiefgelaufen</h1>
      <p className="text-sm text-muted">Bitte die Seite neu laden. Bleibt der Fehler, in ein paar Minuten erneut versuchen.</p>
      <Button variant="primary" size="md" onClick={() => window.location.reload()}>Seite neu laden</Button>
    </div>
  );
}
