import { LeadForm } from '@/components/lead-form';

export default function Home() {
  return (
    <div className="min-h-dvh bg-stone-50">
      <div className="bg-stone-800 px-4 py-1.5 text-center text-xs text-stone-100">
        Case-Study-Prototyp – keine offizielle Seite der Planeco Building GmbH
      </div>
      <main className="mx-auto max-w-xl px-4 py-8">
        <h1 className="text-2xl font-bold text-stone-900">Kostenloser Standort-Check für Ihr Grundstück</h1>
        <ol className="mt-3 space-y-1 text-stone-700">
          <li>1. Grundstück und Kontaktdaten eintragen</li>
          <li>2. Wir prüfen Lage und Genehmigungssituation</li>
          <li>3. Wir rufen Sie zurück – in der Regel am nächsten Werktag</li>
        </ol>
        <div className="mt-8"><LeadForm /></div>
      </main>
    </div>
  );
}
