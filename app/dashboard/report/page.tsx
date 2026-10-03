import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { loadLeadWindow } from '@/lib/dashboard/load';
import { deriveLeadViews, ownHost } from '@/lib/leads/derive';
import { AREA_TEXT, REASON_LABELS, STATUS_LABELS } from '@/lib/labels';
import { buildChannelReport, MIN_SAMPLE, type ReportRow } from '@/lib/report';

export const dynamic = 'force-dynamic';

/** Newest leads read for the report (paged past the 1000-row API cap by the loader). */
const REPORT_WINDOW = 5000;

const HEADERS = [
  'Gruppe', 'Kanal', 'Kampagne', 'Anfragen', AREA_TEXT.inside, 'Unklar', 'Qualifizierungsquote', STATUS_LABELS.gewonnen,
  'Häufigster Absagegrund', 'Ø Std. bis Übernahme',
];

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '—');
const totalLeads = (rows: ReportRow[]) => rows.reduce((sum, r) => sum + r.leads, 0);

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ test?: string | string[] }> }) {
  const { supabase } = await requireUser();
  // Test data is hidden unless asked for: a report on sales numbers must not mix in seeded/test leads (spec U-8).
  const includeTest = (await searchParams).test === '1';
  const leads = await loadLeadWindow(supabase, REPORT_WINDOW);
  const views = deriveLeadViews(leads.rows, [], ownHost());
  const rows = buildChannelReport(views, { includeTest });
  // What the toggle would add: the report's own rules (roots, no spam) applied to the hidden test leads.
  const hiddenTest = includeTest ? 0 : totalLeads(buildChannelReport(views, { includeTest: true })) - totalLeads(rows);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm">
        <h1 className="text-lg font-semibold">Kanäle &amp; Kampagnen</h1>
        <Link href={includeTest ? '/dashboard/report' : '/dashboard/report?test=1'} className="underline">
          {includeTest ? 'Testdaten ausblenden' : 'Testdaten einbeziehen'}
        </Link>
      </div>
      <p className="text-xs text-stone-500">
        Nur Erstanfragen (ohne Duplikate und Spam). Quoten mit weniger als {MIN_SAMPLE} Anfragen sind grau – zu wenig Daten für eine Aussage.
      </p>
      {hiddenTest > 0 && (
        <p className="text-xs text-stone-500">
          {hiddenTest} {hiddenTest === 1 ? 'Testanfrage' : 'Testanfragen'} ausgeblendet –{' '}
          <Link href="/dashboard/report?test=1" className="underline">Testdaten einbeziehen</Link>
        </p>
      )}
      {leads.truncated && (
        <p className="text-xs font-medium text-amber-800">
          Es werden die neuesten {REPORT_WINDOW.toLocaleString('de-DE')} Anfragen ausgewertet.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="min-w-full text-sm">
          <caption className="sr-only">Anfragen, Gebietsquote und Qualifizierungsquote je Kanal und Kampagne</caption>
          <thead className="bg-stone-100 text-left">
            <tr>{HEADERS.map((h) => <th key={h} scope="col" className="px-2 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const thin = r.leads < MIN_SAMPLE ? 'text-stone-500' : '';
              const thinTitle = r.leads < MIN_SAMPLE ? `Weniger als ${MIN_SAMPLE} Anfragen – zu wenig Daten für eine Aussage` : undefined;
              return (
                <tr key={JSON.stringify([r.group, r.channel, r.campaign])} className="border-t border-stone-100">
                  <td className="px-2 py-2">{r.group}</td><td className="px-2 py-2">{r.channel}</td><td className="px-2 py-2">{r.campaign}</td>
                  <td className="px-2 py-2">{r.leads}</td>
                  <td className={`px-2 py-2 ${thin}`} title={thinTitle}>{pct(r.inside, r.located)}</td>
                  <td className="px-2 py-2">{r.unclear}</td>
                  <td className={`px-2 py-2 ${thin}`} title={thinTitle}>{pct(r.qualified, r.decided)}</td>
                  <td className="px-2 py-2">{r.won}</td>
                  <td className="px-2 py-2">{r.topReason ? REASON_LABELS[r.topReason] : '—'}</td>
                  <td className="px-2 py-2">{r.avgHoursToClaim === null ? '—' : r.avgHoursToClaim.toFixed(1)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={HEADERS.length} className="px-2 py-6 text-center text-stone-500">Noch keine Daten.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
