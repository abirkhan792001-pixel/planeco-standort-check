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

const AREA_OPTIONS = [
  ['inside', 'Im Gebiet'], ['edge', 'Randlage'], ['unclear', 'Unklar'], ['outside', 'Außerhalb'], ['pending', 'Wird geprüft'],
  ['failed', 'Prüfung fehlgeschlagen'],
] as const;
const COLUMN_COUNT = 14;
const UNEXPECTED_ERROR = 'Aktion fehlgeschlagen – bitte Seite neu laden.';

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

  const th = (key: SortKey, label: string) => (
    <th scope="col" className="px-2 py-2 text-left font-medium"
      aria-sort={f.sort === key ? (f.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="inline-flex items-center gap-1 whitespace-nowrap text-left font-medium hover:underline"
        onClick={() => setF((s) => ({ ...s, ...nextSort(s, key) }))}>
        {label}<span aria-hidden="true">{f.sort === key ? (f.dir === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  );
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="lead-search" className="sr-only">Suche nach Name, E-Mail, Telefon oder PLZ</label>
        <input id="lead-search" type="search" placeholder="Suche: Name, E-Mail, Telefon, PLZ" className="w-64 rounded border border-stone-300 px-2 py-1"
          value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        {LEAD_STATUSES.map((s) => (
          <label key={s} className="flex items-center gap-1">
            <input type="checkbox" checked={f.statuses.includes(s)} onChange={() => setF({ ...f, statuses: toggle(f.statuses, s) })} />{STATUS_LABELS[s]}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {AREA_OPTIONS.map(([v, label]) => (
          <label key={v} className="flex items-center gap-1">
            <input type="checkbox" checked={f.areas.includes(v)} onChange={() => setF({ ...f, areas: toggle(f.areas, v) })} />{label}
          </label>
        ))}
        <span className="text-stone-400" aria-hidden="true">|</span>
        <label className="flex items-center gap-1">Kanal
          <select className="rounded border border-stone-300 px-1 py-1" value={f.channelGroup ?? ''}
            onChange={(e) => setF({ ...f, channelGroup: (e.target.value || null) as ChannelGroup | null })}>
            <option value="">Alle Kanäle</option>
            {CHANNEL_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <span className="text-stone-400" aria-hidden="true">|</span>
        {([['mine', 'Nur meine'], ['unassigned', 'Nicht zugewiesen'], ['hideTest', 'Testdaten ausblenden'], ['showSpam', 'Spam anzeigen'], ['allSubmissions', 'Alle Einzelanfragen']] as const).map(([k, label]) => (
          <label key={k} className="flex items-center gap-1">
            <input type="checkbox" checked={f[k]} onChange={() => setF({ ...f, [k]: !f[k] })} />{label}
          </label>
        ))}
        <form method="post" action="/dashboard/export" className="ml-auto">
          {exportFields.map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
          <button type="submit" className="rounded bg-stone-800 px-3 py-1.5 text-white">Export (.xlsx)</button>
        </form>
      </div>
      <div className="flex flex-wrap gap-x-3 text-xs text-stone-500">
        <span>{rows.length} Anfragen</span>
        <span>Export dient der Auswertung – bitte in der Liste übernehmen, um Doppelarbeit zu vermeiden.</span>
        {truncated && <span className="font-medium text-amber-800">Es werden die neuesten 1&nbsp;000 Anfragen angezeigt.</span>}
      </div>

      {toast && (
        <div role="alert" className="flex items-center gap-3 rounded border border-amber-300 bg-amber-50 p-2 text-sm">
          {toast.text}
          {toast.retryForce && (
            <button className="underline" onClick={() => { const id = toast.retryForce!; if (confirm('Anfrage wirklich von der Kollegin/dem Kollegen übernehmen?')) run(() => claimLeadAction(id, true)); }}>
              Trotzdem übernehmen
            </button>
          )}
          <button className="ml-auto" aria-label="Schließen" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-100">
            <tr>
              {th('created_at', 'Eingang')}{th('name', 'Name')}{th('phone', 'Kontakt')}{th('plot', 'Grundstück')}
              {th('area', 'Gebiet')}{th('address', 'Adresse')}{th('project', 'Vorhaben')}{th('reachability', 'Erreichbarkeit')}
              {th('channel', 'Kanal / Kampagne')}{th('status', 'Status')}{th('owner', 'Bearbeiter')}{th('mail', 'Mail')}{th('group', 'Anfragen')}
              <th scope="col" className="px-2 py-2"><span className="sr-only">Aktionen</span></th>
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
            {rows.length === 0 && <tr><td colSpan={COLUMN_COUNT} className="px-2 py-6 text-center text-stone-500">Keine Anfragen für diese Filter.</td></tr>}
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
  return (
    <>
      <tr className="border-t border-stone-100 align-top">
        <td className="px-2 py-2 whitespace-nowrap">{formatBerlin(l.created_at)}{l.is_test && <span className="ml-1 text-xs text-stone-400">Test</span>}</td>
        <td className="px-2 py-2">
          {l.first_name} {l.last_name}
          {l.duplicate_of && <span className="ml-1 text-xs text-stone-500">Duplikat ({(l.duplicate_reason ?? []).join(', ')})</span>}
          {l.related_lead_id && <span className="ml-1 text-xs text-stone-500">früherer Kontakt</span>}
        </td>
        <td className="px-2 py-2">
          <a href={`tel:${l.phone_e164 ?? l.phone_raw}`} className="underline">{l.phone_raw}</a>
          {l.phone_extension && <div className="text-xs text-stone-500">Durchwahl {l.phone_extension}</div>}
          <div className="text-stone-500">{l.email}</div>
        </td>
        <td className="px-2 py-2">
          {l.plotLabel}
          {l.geo_flags.includes('cadastral_only') && <div className="text-xs font-medium text-amber-800">{GEO_FLAG_LABELS.cadastral_only}</div>}
        </td>
        <td className="px-2 py-2"><AreaBadge area={l.area} />{l.geo_state_code && <div className="text-xs text-stone-500">{STATE_LABELS[l.geo_state_code] ?? l.geo_state_code}{l.geo_district ? ` · ${l.geo_district}` : ''}</div>}</td>
        <td className="px-2 py-2"><AddressBadge lead={l} />{map && <div><a href={map} target="_blank" rel="noopener" className="text-xs underline">Karte</a></div>}</td>
        <td className="px-2 py-2">{l.project_type ? PROJECT_TYPE_LABELS[l.project_type] : '—'}</td>
        <td className="px-2 py-2">{l.reachability.map((s) => REACHABILITY_LABELS[s]).join(', ') || '—'}</td>
        <td className="px-2 py-2">{l.channel.channel}<div className="text-xs text-stone-500">{l.channel.campaign}</div></td>
        <td className="px-2 py-2"><StatusBadge status={l.status} />{l.disqualify_reason && <div className="text-xs text-stone-500">{REASON_LABELS[l.disqualify_reason]}</div>}</td>
        <td className="px-2 py-2">{l.ownerName ?? '—'}</td>
        <td className="px-2 py-2"><MailBadge lead={l} /></td>
        <td className="px-2 py-2 text-center">
          {l.groupSize > 1 ? <span className="rounded bg-sky-100 px-1.5 text-xs font-medium text-sky-900">{l.groupSize}</span> : l.groupSize}
        </td>
        <td className="px-2 py-2 whitespace-nowrap">
          {!l.assigned_to && <button disabled={props.pending} onClick={props.onClaim} className="rounded bg-emerald-800 px-2 py-1 text-white disabled:opacity-60">Übernehmen</button>}
          {l.assigned_to && !props.mine && <button disabled={props.pending} onClick={props.onClaim} className="rounded border px-2 py-1">Übernehmen</button>}
          {props.mine && <button disabled={props.pending} onClick={props.onRelease} className="rounded border px-2 py-1">Freigeben</button>}
          <button onClick={props.onToggle} className="ml-1 rounded border px-2 py-1" aria-expanded={props.open}>{props.open ? 'Zu' : 'Details'}</button>
        </td>
      </tr>
      {props.open && (
        <tr className="bg-stone-50">
          <td colSpan={COLUMN_COUNT} className="space-y-3 px-4 py-3">
            <div className="grid gap-2 text-xs text-stone-600 md:grid-cols-3">
              <div>Angaben: {l.plot_note || '—'}</div>
              <div>Quelle: {[l.utm_source, l.utm_medium, l.utm_campaign].filter(Boolean).join(' / ') || '—'}{l.gclid ? ' · gclid' : ''}{l.fbclid ? ' · fbclid' : ''} · {l.device_type ? DEVICE_LABELS[l.device_type] : '—'}</div>
              <div>Gemeinde: {l.geo_municipality ?? '—'} {l.geo_municipality_key ? `(AGS ${l.geo_municipality_key})` : ''}</div>
              {flags.length > 0 && <div className="font-medium text-amber-800 md:col-span-3">Adress-Hinweise: {flags.join(' · ')}</div>}
              {mailHint && <div className="md:col-span-3">Mail-Hinweis: {mailHint}</div>}
              {Array.isArray(l.geo_candidates) && <div className="md:col-span-3">Kandidaten: {(l.geo_candidates as { label: string; stateCode: string | null }[]).map((c) => `${c.label} (${c.stateCode ?? '?'})`).join(' · ')}</div>}
            </div>
            <div className="flex flex-wrap items-end gap-2 text-sm">
              <label>Status
                <select className="ml-1 rounded border px-1 py-1" value={status} onChange={(e) => setStatus(e.target.value as LeadStatus)} disabled={!props.mine}>
                  {LEAD_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </label>
              {status === 'nicht_qualifiziert' && (
                <label>Grund
                  <select className="ml-1 rounded border px-1 py-1" value={reason} onChange={(e) => setReason(e.target.value as DisqualifyReason)} disabled={!props.mine}>
                    <option value="">bitte wählen</option>
                    {DISQUALIFY_REASONS.map((r) => <option key={r} value={r}>{REASON_LABELS[r]}</option>)}
                  </select>
                </label>
              )}
              <button disabled={!props.mine || props.pending || (status === 'nicht_qualifiziert' && !reason)}
                onClick={() => props.onStatus(status, status === 'nicht_qualifiziert' ? (reason as DisqualifyReason) : null)}
                className="rounded bg-stone-800 px-2 py-1 text-white disabled:opacity-50">Status speichern</button>
              {!props.mine && <span className="text-xs text-stone-500">Zum Bearbeiten bitte zuerst übernehmen.</span>}
            </div>
            <div className="flex items-end gap-2 text-sm">
              <label className="flex-1">Notiz
                <textarea className="mt-1 block w-full rounded border px-2 py-1" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <button disabled={props.pending} onClick={() => props.onNote(note)} className="rounded border px-2 py-1">Notiz speichern</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
