'use client';

import { useMemo, useState, useTransition } from 'react';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { applyFilters, DEFAULT_FILTERS, filtersToSearchParams, nextSort, sortRows, type Filters, type SortKey } from '@/lib/dashboard/filters';
import type { LeadView } from '@/lib/leads/derive';
import { CHANNEL_GROUPS, type ChannelGroup } from '@/lib/attribution/types';
import { DISQUALIFY_REASONS, LEAD_STATUSES, type DisqualifyReason, type LeadStatus } from '@/lib/leads/types';
import { DEVICE_LABELS, GEO_FLAG_LABELS, geoFlagTexts, mailStatusLabel, PROJECT_TYPE_LABELS, REACHABILITY_LABELS, REASON_LABELS, STATE_LABELS, STATUS_LABELS } from '@/lib/labels';
import { formatBerlin } from '@/lib/format';
import { claimLeadAction, releaseLeadAction, setNoteAction, setStatusAction, type ActionResult } from '@/app/dashboard/actions';
import { AddressBadge, AreaBadge, MailBadge, StatusBadge } from './badges';
import { Badge, Button, buttonClass, Chip, DistanceBar, Eyebrow, fieldClass } from './ui';

const AREA_OPTIONS = [
  ['inside', 'Im Gebiet'], ['edge', 'Randlage'], ['unclear', 'Unklar'], ['outside', 'Außerhalb'], ['pending', 'Wird geprüft'],
  ['failed', 'Prüfung fehlgeschlagen'],
] as const;
const VIEW_OPTIONS = [
  ['mine', 'Nur meine'], ['unassigned', 'Nicht zugewiesen'], ['hideTest', 'Testdaten ausblenden'], ['showSpam', 'Spam anzeigen'],
  ['allSubmissions', 'Alle Einzelanfragen'],
] as const;
/** Every sort key keeps a name: merged columns sort by their first key, the rest stay reachable via the sort select. */
const SORT_LABELS: Record<SortKey, string> = {
  created_at: 'Eingang', name: 'Name', phone: 'Telefon', plot: 'Grundstück', area: 'Gebiet', address: 'Adressgenauigkeit',
  project: 'Vorhaben', reachability: 'Erreichbarkeit', channel: 'Kanal / Kampagne', status: 'Status', owner: 'Bearbeiter',
  mail: 'Mail', group: 'Anfragen',
};
const COLUMN_COUNT = 9;
const UNEXPECTED_ERROR = 'Aktion fehlgeschlagen – bitte Seite neu laden.';
const cell = 'px-3 py-3';
const sub = 'mt-0.5 text-xs text-muted';

function osmLink(l: LeadView) {
  if (l.geo_lat === null || l.geo_lon === null) return null;
  const zoom = l.geo_precision === 'house' || l.geo_precision === 'street' ? 17 : 13;
  return `https://www.openstreetmap.org/?mlat=${l.geo_lat}&mlon=${l.geo_lon}#map=${zoom}/${l.geo_lat}/${l.geo_lon}`;
}

export function LeadTable({ views, currentUserId, truncated }: { views: LeadView[]; currentUserId: string; truncated: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<Filters>(DEFAULT_FILTERS);
  const [open, setOpen] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; retryForce?: string } | null>(null);
  const [pending, start] = useTransition();

  const rows = useMemo(() => sortRows(applyFilters(views, f, currentUserId), f.sort, f.dir), [views, f, currentUserId]);
  // Chip counts: every other filter applied, the status filter itself left out (otherwise unpicked statuses read 0).
  const statusCounts = useMemo(() => {
    const counts = new Map<LeadStatus, number>();
    for (const r of applyFilters(views, { ...f, statuses: [] }, currentUserId)) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    return counts;
  }, [views, f, currentUserId]);
  // Export filters travel as hidden POST fields, never in a URL (the search text can contain names or phone numbers).
  const exportFields = useMemo(() => [...filtersToSearchParams(f).entries()], [f]);

  const run = (action: () => Promise<ActionResult>, leadId?: string) =>
    start(async () => {
      try {
        const r = await action();
        if (!r.ok) setToast({ text: r.message ?? 'Fehler', retryForce: r.conflict ? leadId : undefined });
        else setToast(null);
        router.refresh();
      } catch (e) {
        // C-4: an expired session makes the action call redirect('/login'); Next rejects the call with a redirect
        // error that must reach its RedirectBoundary untouched. Anything else is unexpected (network, server crash).
        unstable_rethrow(e);
        setToast({ text: UNEXPECTED_ERROR });
      }
    });

  const th = (key: SortKey, label: string, className = '') => (
    <th scope="col" className={`px-3 py-2.5 text-left ${className}`}
      aria-sort={f.sort === key ? (f.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.08em] text-muted hover:text-ink"
        onClick={() => setF((s) => ({ ...s, ...nextSort(s, key) }))}>
        {label}<span aria-hidden="true" className="text-ink">{f.sort === key ? (f.dir === 'asc' ? '↑' : '↓') : ''}</span>
      </button>
    </th>
  );
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="space-y-4">
      <section aria-label="Filter" className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="lead-search" className="sr-only">Suche nach Name, E-Mail, Telefon oder PLZ</label>
          <input id="lead-search" type="search" placeholder="Name, E-Mail, Telefon oder PLZ suchen" className={`${fieldClass} w-full sm:w-80`}
            value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-muted">Kanal
            <select className={fieldClass} value={f.channelGroup ?? ''}
              onChange={(e) => setF({ ...f, channelGroup: (e.target.value || null) as ChannelGroup | null })}>
              <option value="">Alle Kanäle</option>
              {CHANNEL_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <label className="flex items-center gap-2 text-sm text-muted">Sortieren
              <select className={fieldClass} value={f.sort} onChange={(e) => setF({ ...f, ...nextSort(f, e.target.value as SortKey) })}>
                {Object.entries(SORT_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </label>
            <button type="button" className={`${buttonClass('secondary', 'md')} w-9 px-0`}
              aria-label={f.dir === 'asc' ? 'Aufsteigend sortiert – umkehren' : 'Absteigend sortiert – umkehren'}
              onClick={() => setF({ ...f, dir: f.dir === 'asc' ? 'desc' : 'asc' })}>
              <span aria-hidden="true">{f.dir === 'asc' ? '↑' : '↓'}</span>
            </button>
          </div>
          <form method="post" action="/dashboard/export" className="sm:ml-auto">
            {exportFields.map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
            <button type="submit" className={buttonClass('primary', 'md')}>Export (.xlsx)</button>
          </form>
        </div>

        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-[5.5rem_1fr] sm:items-center">
          <Eyebrow>Status</Eyebrow>
          <div className="flex flex-wrap gap-1.5">
            {LEAD_STATUSES.map((s) => (
              <Chip key={s} pressed={f.statuses.includes(s)} count={statusCounts.get(s) ?? 0}
                onClick={() => setF({ ...f, statuses: toggle(f.statuses, s) })}>{STATUS_LABELS[s]}</Chip>
            ))}
          </div>
          <Eyebrow>Gebiet</Eyebrow>
          <div className="flex flex-wrap gap-1.5">
            {AREA_OPTIONS.map(([v, label]) => (
              <Chip key={v} pressed={f.areas.includes(v)} onClick={() => setF({ ...f, areas: toggle(f.areas, v) })}>{label}</Chip>
            ))}
          </div>
          <Eyebrow>Ansicht</Eyebrow>
          <div className="flex flex-wrap gap-1.5">
            {VIEW_OPTIONS.map(([k, label]) => (
              <Chip key={k} pressed={f[k]} onClick={() => setF({ ...f, [k]: !f[k] })}>{label}</Chip>
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-muted">
        <span><span className="font-data text-sm font-medium text-ink tabular-nums">{rows.length}</span> Anfragen</span>
        <span>Export dient der Auswertung – bitte in der Liste übernehmen, um Doppelarbeit zu vermeiden.</span>
        {truncated && <span className="font-medium text-ochre">Es werden die neuesten 1&nbsp;000 Anfragen angezeigt.</span>}
      </div>

      {toast && (
        <div role="alert" className="flex items-center gap-3 rounded-md border border-ochre/40 bg-ochre-wash px-3 py-2 text-sm text-ink">
          {toast.text}
          {toast.retryForce && (
            <Button variant="ghost" onClick={() => { const id = toast.retryForce!; if (confirm('Anfrage wirklich von der Kollegin/dem Kollegen übernehmen?')) run(() => claimLeadAction(id, true)); }}>
              Trotzdem übernehmen
            </Button>
          )}
          <button type="button" className="ml-auto px-1 text-lg leading-none text-muted hover:text-ink" aria-label="Schließen" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      <div tabIndex={0} role="region" aria-label="Anfragen" className="overflow-x-auto rounded-lg border border-hairline bg-surface">
        <table className="min-w-full text-sm">
          <thead className="border-b border-hairline bg-paper">
            <tr>
              {th('created_at', 'Eingang')}{th('name', 'Interessent')}{th('area', 'Standort')}{th('project', 'Vorhaben')}
              {th('channel', 'Kanal')}{th('status', 'Status')}{th('mail', 'Mail')}{th('group', 'Anfr.', 'text-center')}
              <th scope="col" className="px-3 py-2.5"><span className="sr-only">Aktionen</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const mine = l.assigned_to === currentUserId;
              // The key includes the server-side editable values: after router.refresh() the row's local form state
              // (status select, reason, note) re-initialises from the fresh data instead of showing stale values.
              return (
                <FragmentRow key={`${l.id}|${l.status}|${l.disqualify_reason ?? ''}|${l.sales_note ?? ''}`} lead={l} mine={mine} open={open === l.id} pending={pending}
                  onToggle={() => setOpen(open === l.id ? null : l.id)}
                  onClaim={() => run(() => claimLeadAction(l.id), l.id)} onRelease={() => run(() => releaseLeadAction(l.id))}
                  onStatus={(s, r) => run(() => setStatusAction(l.id, s, r))} onNote={(n) => run(() => setNoteAction(l.id, n))} />
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={COLUMN_COUNT} className="px-3 py-10 text-center text-muted">
                Keine Anfragen für diese Filter. Filter lockern oder Suche leeren.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow(props: {
  lead: LeadView; mine: boolean; open: boolean; pending: boolean; onToggle: () => void; onClaim: () => void; onRelease: () => void;
  onStatus: (s: LeadStatus, r: DisqualifyReason | null) => void; onNote: (n: string) => void;
}) {
  const { lead: l } = props;
  const [status, setStatus] = useState<LeadStatus>(l.status);
  const [reason, setReason] = useState<DisqualifyReason | ''>(l.disqualify_reason ?? '');
  const [note, setNote] = useState(l.sales_note ?? '');
  const map = osmLink(l);
  const flags = geoFlagTexts(l);
  const mailHint = mailStatusLabel(l).title;
  const [date, time] = formatBerlin(l.created_at).split(' ');
  return (
    <>
      <tr className={`border-t border-hairline align-top first:border-t-0 ${props.open ? 'bg-paper' : 'hover:bg-paper/70'}`}>
        <td className={`${cell} whitespace-nowrap font-data text-[13px] tabular-nums`}>
          {date}<div className="text-muted">{time}</div>
          {l.is_test && <div className="mt-1"><Badge tone="grey">Test</Badge></div>}
        </td>
        <td className={`${cell} min-w-48`}>
          <div className="font-medium text-ink">{l.first_name} {l.last_name}</div>
          <a href={`tel:${l.phone_e164 ?? l.phone_raw}`} className="font-data text-[13px] text-ink underline decoration-line underline-offset-2 hover:decoration-ink">{l.phone_raw}</a>
          {l.phone_extension && <span className="ml-1 text-xs text-muted">Durchwahl {l.phone_extension}</span>}
          <div className="break-all text-xs text-muted">{l.email}</div>
          {l.duplicate_of && <div className={sub}>Duplikat ({(l.duplicate_reason ?? []).join(', ')})</div>}
          {l.related_lead_id && <div className={sub}>früherer Kontakt</div>}
        </td>
        <td className={`${cell} min-w-64`}>
          <div className="text-ink">{l.plotLabel}</div>
          {l.geo_flags.includes('cadastral_only') && <div className="mt-0.5 text-xs font-medium text-ochre">{GEO_FLAG_LABELS.cadastral_only}</div>}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <AreaBadge area={l.area} /><AddressBadge lead={l} />
          </div>
          <DistanceBar area={l.area} />
          <div className={sub}>
            {l.geo_state_code && <>{STATE_LABELS[l.geo_state_code] ?? l.geo_state_code}{l.geo_district ? ` · ${l.geo_district}` : ''}</>}
            {map && <>{l.geo_state_code ? ' · ' : ''}<a href={map} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink">Karte</a></>}
          </div>
        </td>
        <td className={cell}>
          {l.project_type ? PROJECT_TYPE_LABELS[l.project_type] : '—'}
          {l.reachability.length > 0 && <div className={sub}>{l.reachability.map((s) => REACHABILITY_LABELS[s]).join(', ')}</div>}
        </td>
        <td className={cell}>{l.channel.channel}<div className={sub}>{l.channel.campaign}</div></td>
        <td className={cell}>
          <StatusBadge status={l.status} />
          {l.disqualify_reason && <div className={sub}>{REASON_LABELS[l.disqualify_reason]}</div>}
          <div className={sub}>{l.ownerName ?? 'Nicht zugewiesen'}</div>
        </td>
        <td className={cell}><MailBadge lead={l} /></td>
        <td className={`${cell} text-center font-data tabular-nums`}>
          {l.groupSize > 1 ? <Badge tone="blue">{l.groupSize}</Badge> : <span className="text-muted">{l.groupSize}</span>}
        </td>
        <td className={`${cell} whitespace-nowrap text-right`}>
          <div className="inline-flex gap-1.5">
            {!l.assigned_to && <Button variant="confirm" disabled={props.pending} onClick={props.onClaim}>Übernehmen</Button>}
            {l.assigned_to && !props.mine && <Button disabled={props.pending} onClick={props.onClaim}>Übernehmen</Button>}
            {props.mine && <Button disabled={props.pending} onClick={props.onRelease}>Freigeben</Button>}
            <Button variant="ghost" onClick={props.onToggle} aria-expanded={props.open}>{props.open ? 'Schließen' : 'Details'}</Button>
          </div>
        </td>
      </tr>
      {props.open && (
        <tr className="bg-paper">
          <td colSpan={COLUMN_COUNT} className="border-t border-dashed border-hairline px-4 pb-5 pt-3">
            <dl className="grid gap-x-6 gap-y-3 text-sm md:grid-cols-3">
              <div><dt><Eyebrow>Angaben</Eyebrow></dt><dd className="mt-0.5">{l.plot_note || '—'}</dd></div>
              <div>
                <dt><Eyebrow>Quelle</Eyebrow></dt>
                <dd className="mt-0.5">{[l.utm_source, l.utm_medium, l.utm_campaign].filter(Boolean).join(' / ') || '—'}{l.gclid ? ' · gclid' : ''}{l.fbclid ? ' · fbclid' : ''} · {l.device_type ? DEVICE_LABELS[l.device_type] : '—'}</dd>
              </div>
              <div>
                <dt><Eyebrow>Gemeinde</Eyebrow></dt>
                <dd className="mt-0.5">{l.geo_municipality ?? '—'} {l.geo_municipality_key && <span className="font-data text-xs text-muted">AGS {l.geo_municipality_key}</span>}</dd>
              </div>
              {flags.length > 0 && <div className="md:col-span-3"><dt><Eyebrow>Adress-Hinweise</Eyebrow></dt><dd className="mt-0.5 font-medium text-ochre">{flags.join(' · ')}</dd></div>}
              {mailHint && <div className="md:col-span-3"><dt><Eyebrow>Mail-Hinweis</Eyebrow></dt><dd className="mt-0.5">{mailHint}</dd></div>}
              {Array.isArray(l.geo_candidates) && (
                <div className="md:col-span-3"><dt><Eyebrow>Kandidaten</Eyebrow></dt>
                  <dd className="mt-0.5">{(l.geo_candidates as { label: string; stateCode: string | null }[]).map((c) => `${c.label} (${c.stateCode ?? '?'})`).join(' · ')}</dd>
                </div>
              )}
            </dl>
            <div className="mt-4 grid gap-4 border-t border-hairline pt-4 lg:grid-cols-[auto_1fr]">
              <div className="flex flex-wrap items-end gap-2 text-sm">
                <label className="flex flex-col gap-1"><Eyebrow>Status</Eyebrow>
                  <select className={fieldClass} value={status} onChange={(e) => setStatus(e.target.value as LeadStatus)} disabled={!props.mine}>
                    {LEAD_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </label>
                {status === 'nicht_qualifiziert' && (
                  <label className="flex flex-col gap-1"><Eyebrow>Grund</Eyebrow>
                    <select className={fieldClass} value={reason} onChange={(e) => setReason(e.target.value as DisqualifyReason)} disabled={!props.mine}>
                      <option value="">bitte wählen</option>
                      {DISQUALIFY_REASONS.map((r) => <option key={r} value={r}>{REASON_LABELS[r]}</option>)}
                    </select>
                  </label>
                )}
                <Button variant="primary" size="md" disabled={!props.mine || props.pending || (status === 'nicht_qualifiziert' && !reason)}
                  onClick={() => props.onStatus(status, status === 'nicht_qualifiziert' ? (reason as DisqualifyReason) : null)}>Status speichern</Button>
                {!props.mine && <span className="basis-full text-xs text-muted">Zum Bearbeiten bitte zuerst übernehmen.</span>}
              </div>
              <div className="flex items-end gap-2 text-sm">
                <label className="flex flex-1 flex-col gap-1"><Eyebrow>Notiz</Eyebrow>
                  <textarea className={`${fieldClass} h-auto py-1.5`} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
                <Button size="md" disabled={props.pending} onClick={() => props.onNote(note)}>Notiz speichern</Button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
