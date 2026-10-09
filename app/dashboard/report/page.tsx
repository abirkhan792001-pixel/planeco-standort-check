import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { loadLeadWindow } from '@/lib/dashboard/load';
import { deriveLeadViews, ownHost } from '@/lib/leads/derive';
import { AREA_TEXT, REASON_LABELS, STATUS_LABELS } from '@/lib/labels';
import { buttonClass, focusRing } from '@/components/ui';
import { buildChannelReport, MIN_SAMPLE, rateConfidence, type ReportRow } from '@/lib/report';

export const dynamic = 'force-dynamic';

/** Newest leads read for the report (paged past the 1000-row API cap by the loader). */
const REPORT_WINDOW = 5000;

const HEADERS = [
  'Gruppe', 'Kanal', 'Kampagne', 'Anfragen', AREA_TEXT.inside, 'Unklar', 'Qualifizierungsquote', STATUS_LABELS.gewonnen,
  'Häufigster Absagegrund', 'Ø Std. bis Übernahme',
];

/** Header indexes of the figure columns: right-aligned in the data face. */
const NUMERIC = new Set([3, 4, 5, 6, 7, 9]);
const cell = 'px-3 py-2.5';
const num = `${cell} text-right font-data tabular-nums`;

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '—');
const totalLeads = (rows: ReportRow[]) => rows.reduce((sum, r) => sum + r.leads, 0);
const hours = (h: number) => h.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** A rate cell. Under MIN_SAMPLE cases it is grey and says so in visible text (colour alone is not enough). */
function RateCell({ value, n, thin }: { value: string; n: number; thin: boolean }) {
  if (!thin) return <td className={`${cell} text-right font-data tabular-nums`}>{value}</td>;
  return (
    <td className={`${cell} text-right font-data tabular-nums text-muted`} title={`Nur ${n} Fälle (weniger als ${MIN_SAMPLE}) – zu wenig Daten für eine Aussage`}>
      {value} <span className="block font-ui text-xs">zu wenig Daten</span>
    </td>
  );
}

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-brand text-xl font-semibold">Kanäle &amp; Kampagnen</h1>
        <Link href={includeTest ? '/dashboard/report' : '/dashboard/report?test=1'} className={`${buttonClass('secondary')} ml-auto`}>
          {includeTest ? 'Testdaten ausblenden' : 'Testdaten einbeziehen'}
        </Link>
      </div>
      <p className="max-w-3xl text-sm text-muted">
        Nur Erstanfragen (ohne Duplikate und Spam). Quoten, die auf weniger als {MIN_SAMPLE} Fällen beruhen, sind grau – zu wenig Daten für eine Aussage.
      </p>
      {hiddenTest > 0 && (
        <p className="text-xs text-muted">
          {hiddenTest} {hiddenTest === 1 ? 'Testanfrage' : 'Testanfragen'} ausgeblendet –{' '}
          <Link href="/dashboard/report?test=1" className="underline underline-offset-2 hover:text-ink">Testdaten einbeziehen</Link>
        </p>
      )}
      {leads.truncated && (
        <p className="text-xs font-medium text-ochre">
          Es werden die neuesten {REPORT_WINDOW.toLocaleString('de-DE')} Anfragen ausgewertet.
        </p>
      )}
      <div tabIndex={0} role="region" aria-label="Kanalbericht" className={`overflow-x-auto rounded-lg border border-hairline bg-surface ${focusRing}`}>
        <table className="min-w-full text-sm">
          <caption className="sr-only">Anfragen, Gebietsquote und Qualifizierungsquote je Kanal und Kampagne</caption>
          <thead className="border-b border-hairline bg-paper">
            <tr>{HEADERS.map((h, i) => (
              <th key={h} scope="col" className={`px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted ${NUMERIC.has(i) ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const { areaThin, qualThin } = rateConfidence(r);
              return (
                <tr key={JSON.stringify([r.group, r.channel, r.campaign])} className="border-t border-hairline align-top first:border-t-0 hover:bg-paper/70">
                  <td className={`${cell} text-muted`}>{r.group}</td><td className={`${cell} font-medium`}>{r.channel}</td><td className={cell}>{r.campaign}</td>
                  <td className={num}>{r.leads}</td>
                  <RateCell value={pct(r.inside, r.located)} n={r.located} thin={areaThin} />
                  <td className={num}>{r.unclear}</td>
                  <RateCell value={pct(r.qualified, r.decided)} n={r.decided} thin={qualThin} />
                  <td className={num}>{r.won}</td>
                  <td className={cell}>{r.topReason ? REASON_LABELS[r.topReason] : '—'}</td>
                  <td className={num}>{r.avgHoursToClaim === null ? '—' : hours(r.avgHoursToClaim)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={HEADERS.length} className="px-3 py-10 text-center text-muted">Noch keine Erstanfragen im Auswertungszeitraum.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
