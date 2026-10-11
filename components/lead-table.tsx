'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { applyFilters, DEFAULT_FILTERS, filtersToSearchParams, nextSort, sortRows, type Filters, type SortKey } from '@/lib/dashboard/filters';
import type { LeadView } from '@/lib/leads/derive';
import { CHANNEL_GROUPS, type ChannelGroup } from '@/lib/attribution/types';
import { DISQUALIFY_REASONS, LEAD_STATUSES, REACHABILITY, type DisqualifyReason, type LeadStatus } from '@/lib/leads/types';
import { DEVICE_LABELS, GEO_FLAG_LABELS, geoFlagTexts, mailStatusLabel, PROJECT_TYPE_LABELS, REACHABILITY_HOURS, REACHABILITY_LABELS, REASON_LABELS, STATE_LABELS, STATUS_LABELS } from '@/lib/labels';
import { reachableUntil, waitingTime } from '@/lib/dashboard/urgency';
import { DUPLICATE_WINDOW_DAYS, LIVE_REFRESH_SECONDS } from '@/lib/config/app';
import { formatBerlin } from '@/lib/format';
import { claimLeadAction, releaseLeadAction, setNoteAction, setStatusAction, type ActionResult } from '@/app/dashboard/actions';
import { AddressMatch, AREA_TONE, AreaVerdict, MailBadge, STATUS_TONE, StatusBadge } from './badges';
import { Badge, Button, buttonClass, Chip, Eyebrow, fieldClass, fieldClassSm, focusRing, Segmented, toneClass, toneText } from './ui';

/** The pipeline in reading order: open stages, then the three ways a lead ends. */
const OPEN_STATUSES = ['neu', 'in_bearbeitung', 'qualifiziert'] as const satisfies readonly LeadStatus[];
const CLOSED_STATUSES = ['gewonnen', 'nicht_qualifiziert', 'verloren'] as const satisfies readonly LeadStatus[];
const AREA_OPTIONS = [
  ['inside', 'Im Gebiet'], ['edge', 'Randlage'], ['outside', 'Außerhalb'], ['unclear', 'Unklar'], ['pending', 'Wird geprüft'],
  ['failed', 'Prüfung fehlgeschlagen'],
] as const;
const OWNER_OPTIONS = [['all', 'Alle'], ['mine', 'Meine'], ['unassigned', 'Nicht zugewiesen']] as const;
const LIST_OPTIONS = [['hideTest', 'Testdaten ausblenden'], ['showSpam', 'Spam anzeigen'], ['allSubmissions', 'Alle Einzelanfragen']] as const;
/** Every sort key keeps a name: merged columns sort by their first key, the rest stay reachable via the sort select. */
const SORT_LABELS: Record<SortKey, string> = {
  priority: 'Priorität', created_at: 'Eingang', name: 'Name', phone: 'Telefon', plot: 'Grundstück', area: 'Gebiet', address: 'Verortung',
  project: 'Vorhaben', reachability: 'Erreichbarkeit', channel: 'Kanal / Kampagne', status: 'Status', owner: 'Bearbeiter',
  mail: 'Mail', group: 'Anzahl Einsendungen',
};
const DUP_REASON: Record<string, string> = { email: 'E-Mail', phone: 'Telefon', address: 'Adresse' };
const COLUMN_COUNT = 7;
const UNEXPECTED_ERROR = 'Aktion fehlgeschlagen – bitte Seite neu laden.';
const cell = 'px-3 py-3';
/** Column headings: paper band with its own bottom line (a sticky cell drops the row border); sticky from xl. */
const stickyTh = 'bg-paper shadow-[inset_0_-1px_0_var(--color-hairline)] first:rounded-tl-lg last:rounded-tr-lg xl:sticky xl:top-[var(--toolbar-h)] xl:z-10';
const sub = 'mt-0.5 text-xs text-muted';

function osmLink(l: LeadView) {
  if (l.geo_lat === null || l.geo_lon === null) return null;
  const zoom = l.geo_precision === 'house' || l.geo_precision === 'street' ? 17 : 13;
  return `https://www.openstreetmap.org/?mlat=${l.geo_lat}&mlon=${l.geo_lon}#map=${zoom}/${l.geo_lat}/${l.geo_lon}`;
}

/** The plot as two lines: the street (or the free-text place when the address is unknown), then PLZ/Ort and state. */
function placeLines(l: LeadView): { where: string; detail: string } {
  const state = l.geo_state_code ? STATE_LABELS[l.geo_state_code] ?? l.geo_state_code : null;
  if (l.address_unknown) {
    return { where: l.plot_note || 'Adresse unbekannt', detail: [l.plot_note ? 'Adresse unbekannt' : null, state].filter(Boolean).join(' · ') };
  }
  const street = [l.street, l.house_number].filter(Boolean).join(' ');
  const town = [l.postal_code, l.city].filter(Boolean).join(' ');
  return { where: street || town || l.plotLabel, detail: [street ? town : null, state].filter(Boolean).join(' · ') };
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted">
      <circle cx="9" cy="9" r="5.5" /><path d="m13.2 13.2 3.8 3.8" />
    </svg>
  );
}

/** Ticks once a minute so waiting times and "Jetzt erreichbar" stay current. Starts from the server's clock (hydration). */
function useNow(serverNow: number): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * Re-reads the list from the server every LIVE_REFRESH_SECONDS while the tab is visible, and at once when the tab comes
 * back after that long. Skipped while one of the user's own actions is saving (that action refreshes anyway).
 * Client state survives: filters, open rows and unsaved drafts stay; only rows whose server data changed re-mount.
 */
function useLiveRefresh(refresh: () => void, paused: boolean) {
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useEffect(() => {
    const every = LIVE_REFRESH_SECONDS * 1000;
    let last = Date.now();
    const tick = () => {
      if (document.visibilityState !== 'visible' || pausedRef.current) return;
      last = Date.now();
      refresh();
    };
    const id = setInterval(tick, every);
    const onVisible = () => { if (Date.now() - last >= every) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);
}

/** Ids that appeared since the previous render of the list (not on first load); cleared after 10 s. */
function useArrivals(ids: string[]): Set<string> {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const key = ids.join(',');
  useEffect(() => {
    const current = key ? key.split(',') : [];
    if (seen.current === null) { seen.current = new Set(current); return; }
    const added = current.filter((id) => !seen.current!.has(id));
    for (const id of added) seen.current.add(id);
    if (added.length === 0) return;
    setFresh(new Set(added));
    const t = setTimeout(() => setFresh(new Set()), 10_000);
    return () => clearTimeout(t);
  }, [key]);
  return fresh;
}

/** The lead's preferred call times under the phone number; "Jetzt erreichbar" while one of them is open (Berlin time). */
function CallTimes({ lead, now }: { lead: LeadView; now: number }) {
  const slots = REACHABILITY.filter((s) => lead.reachability.includes(s));
  if (slots.length === 0) return null;
  const all = `Wunschzeiten: ${slots.map((s) => `${REACHABILITY_LABELS[s]} ${REACHABILITY_HOURS[s]}`).join(' · ')}`;
  const until = reachableUntil(lead, now);
  if (until !== null) {
    return (
      <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-moss" title={all}>
        <span aria-hidden="true" className="size-1.5 rounded-full bg-moss" />Jetzt erreichbar · bis {until} Uhr
      </div>
    );
  }
  return (
    <div className={sub} title={all}>
      erreichbar {slots.length === 1 ? `${REACHABILITY_LABELS[slots[0]]} (${REACHABILITY_HOURS[slots[0]]})` : slots.map((s) => REACHABILITY_LABELS[s]).join(', ')}
    </div>
  );
}

/**
 * Status in the row. On your own lead: a select in the status colour that saves on change; "Nicht qualifiziert" asks
 * for the reason first. A failed save puts the select back. Anyone else's lead (or an unclaimed one): the badge.
 */
function StatusControl({ lead, mine, pending, onStatus }: {
  lead: LeadView; mine: boolean; pending: boolean; onStatus: (s: LeadStatus, r: DisqualifyReason | null) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<LeadStatus>(lead.status);
  const [reason, setReason] = useState<DisqualifyReason | ''>(lead.disqualify_reason ?? '');
  const reasonText = lead.disqualify_reason && <div className={sub}>{REASON_LABELS[lead.disqualify_reason]}</div>;
  if (!mine) {
    return <><StatusBadge status={lead.status} title="Status ändern: Anfrage zuerst übernehmen" />{reasonText}</>;
  }
  const reset = () => { setDraft(lead.status); setReason(lead.disqualify_reason ?? ''); };
  const save = (s: LeadStatus, r: DisqualifyReason | null) => onStatus(s, r).then((ok) => { if (!ok) reset(); });
  const asking = draft === 'nicht_qualifiziert';
  const entering = lead.status !== 'nicht_qualifiziert';
  const changed = reason !== '' && (entering || reason !== lead.disqualify_reason);
  return (
    <div className="space-y-1.5">
      <select aria-label={`Status von ${lead.first_name} ${lead.last_name}`} value={draft} disabled={pending}
        className={`h-7 cursor-pointer rounded border border-current/30 pl-1.5 pr-1 text-xs font-medium disabled:cursor-wait disabled:opacity-60 ${toneClass[STATUS_TONE[draft]]} ${focusRing}`}
        onChange={(e) => {
          const next = e.target.value as LeadStatus;
          setDraft(next);
          if (next !== 'nicht_qualifiziert') void save(next, null);
        }}>
        {LEAD_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
      </select>
      {asking ? (
        <div className="flex flex-wrap items-center gap-1">
          <select aria-label="Grund für „Nicht qualifiziert“" value={reason} disabled={pending} className={fieldClassSm}
            onChange={(e) => setReason(e.target.value as DisqualifyReason)}>
            <option value="">Grund wählen …</option>
            {DISQUALIFY_REASONS.map((r) => <option key={r} value={r}>{REASON_LABELS[r]}</option>)}
          </select>
          {(entering || changed) && (
            <>
              <Button variant="primary" disabled={pending || !changed} onClick={() => void save('nicht_qualifiziert', reason as DisqualifyReason)}>Speichern</Button>
              <Button variant="ghost" onClick={reset}>Abbrechen</Button>
            </>
          )}
        </div>
      ) : reasonText}
    </div>
  );
}

export function LeadTable({ views, currentUserId, truncated, now: serverNow }: {
  views: LeadView[]; currentUserId: string; truncated: boolean; now: number;
}) {
  const router = useRouter();
  const now = useNow(serverNow);
  const [f, setF] = useState<Filters>(DEFAULT_FILTERS);
  const [open, setOpen] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; retryForce?: string } | null>(null);
  const [pending, start] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const refresh = useMemo(() => () => startRefresh(() => router.refresh()), [router]);
  useLiveRefresh(refresh, pending);
  const fresh = useArrivals(useMemo(() => views.map((v) => v.id), [views]));
  const freshCount = fresh.size;
  const asOf = formatBerlin(new Date(serverNow).toISOString()).split(' ')[1];
  // Sticky toolbar (xl+): its height feeds the column headings' offset; a sentinel at the end of the filters tells when it is stuck.
  const toolbar = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const [toolbarHeight, setToolbarHeight] = useState(48);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const bar = toolbar.current;
    const mark = sentinel.current;
    if (!bar || !mark) return;
    const size = new ResizeObserver(() => setToolbarHeight(bar.offsetHeight));
    size.observe(bar);
    const seen = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting));
    seen.observe(mark);
    return () => { size.disconnect(); seen.disconnect(); };
  }, []);
  const backToFilters = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    document.getElementById('lead-search')?.focus({ preventScroll: true });
  };

  const rows = useMemo(() => sortRows(applyFilters(views, f, currentUserId), f.sort, f.dir), [views, f, currentUserId]);
  // Tab counts: every other filter applied, the status filter itself left out (otherwise the other tabs read 0).
  const statusCounts = useMemo(() => {
    const counts = new Map<LeadStatus, number>();
    for (const r of applyFilters(views, { ...f, statuses: [] }, currentUserId)) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    return counts;
  }, [views, f, currentUserId]);
  const totalCount = [...statusCounts.values()].reduce((a, b) => a + b, 0);
  // Export filters travel as hidden POST fields, never in a URL (the search text can contain names or phone numbers).
  const exportFields = useMemo(() => [...filtersToSearchParams(f).entries()], [f]);
  const filtered = Boolean(f.q || f.statuses.length || f.areas.length || f.channelGroup || f.mine || f.unassigned
    || f.hideTest || f.showSpam || f.allSubmissions);
  const owner = f.mine ? 'mine' : f.unassigned ? 'unassigned' : 'all';

  // Resolves to whether the action succeeded, so a control can undo its optimistic value (the inline status select).
  const run = (action: () => Promise<ActionResult>, leadId?: string) =>
    new Promise<boolean>((resolve) => start(async () => {
      try {
        const r = await action();
        if (!r.ok) setToast({ text: r.message ?? 'Fehler', retryForce: r.conflict ? leadId : undefined });
        else setToast(null);
        resolve(r.ok);
        router.refresh();
      } catch (e) {
        resolve(false);
        // C-4: an expired session makes the action call redirect('/login'); Next rejects the call with a redirect
        // error that must reach its RedirectBoundary untouched. Anything else is unexpected (network, server crash).
        unstable_rethrow(e);
        setToast({ text: UNEXPECTED_ERROR });
      }
    }));

  const th = (key: SortKey, label: string) => (
    <th scope="col" className={`${stickyTh} px-3 py-2.5 text-left`}
      aria-sort={f.sort === key ? (f.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.08em] text-muted hover:text-ink"
        onClick={() => setF((s) => ({ ...s, ...nextSort(s, key) }))}>
        {label}<span aria-hidden="true" className="text-ink">{f.sort === key ? (f.dir === 'asc' ? '↑' : '↓') : ''}</span>
      </button>
    </th>
  );
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  // One status at a time ("Alle" = none): the tabs read as the pipeline, not as a checklist.
  const statusTab = (value: LeadStatus | null, label: string, count: number) => {
    const active = value === null ? f.statuses.length === 0 : f.statuses.length === 1 && f.statuses[0] === value;
    return (
      <button key={value ?? 'all'} type="button" aria-pressed={active} onClick={() => setF({ ...f, statuses: value === null ? [] : [value] })}
        className={`relative inline-flex h-11 shrink-0 items-center gap-1.5 px-3 text-sm transition-colors ${focusRing} ${
          active ? 'font-medium text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-ink'
            : 'text-muted hover:text-ink'}`}>
        {label}
        <span className={`min-w-5 rounded-full px-1.5 text-center font-data text-[11px] leading-5 tabular-nums ${
          active ? 'bg-ink text-white' : count > 0 ? 'bg-stone-wash text-ink' : 'text-muted'}`}>{count}</span>
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <section aria-label="Filter" className="rounded-lg border border-hairline bg-surface">
        <div className="flex items-center gap-3 border-b border-hairline pr-3">
          <div className="flex min-w-0 items-center overflow-x-auto px-1.5" role="group" aria-label="Status">
            {statusTab(null, 'Alle', totalCount)}
            {OPEN_STATUSES.map((s) => statusTab(s, STATUS_LABELS[s], statusCounts.get(s) ?? 0))}
            <span aria-hidden="true" className="mx-1.5 h-5 w-px shrink-0 bg-hairline" />
            {CLOSED_STATUSES.map((s) => statusTab(s, STATUS_LABELS[s], statusCounts.get(s) ?? 0))}
          </div>
          <form method="post" action="/dashboard/export" className="ml-auto shrink-0">
            {exportFields.map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
            <button type="submit" className={buttonClass('secondary')} title="Exportiert die aktuell gefilterte Liste">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                <path d="M10 3.5v9m0 0-3.5-3.5M10 12.5l3.5-3.5M4 16h12" />
              </svg>
              <span className="sr-only sm:not-sr-only">Export (.xlsx)</span>
            </button>
          </form>
        </div>

        <div className="space-y-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-80">
              <label htmlFor="lead-search" className="sr-only">Suche nach Name, E-Mail, Telefon oder PLZ</label>
              <SearchIcon />
              <input id="lead-search" type="search" placeholder="Name, E-Mail, Telefon oder PLZ" className={`${fieldClass} w-full pl-8`}
                value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
            </div>
            <label htmlFor="lead-channel" className="sr-only">Kanal</label>
            <select id="lead-channel" className={fieldClass} value={f.channelGroup ?? ''}
              onChange={(e) => setF({ ...f, channelGroup: (e.target.value || null) as ChannelGroup | null })}>
              <option value="">Alle Kanäle</option>
              {CHANNEL_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <div className="flex items-center gap-2 sm:ml-auto">
              <Eyebrow>Zuständig</Eyebrow>
              <Segmented label="Zuständig" value={owner} options={OWNER_OPTIONS}
                onChange={(v) => setF({ ...f, mine: v === 'mine', unassigned: v === 'unassigned' })} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Gebiet">
            <Eyebrow className="mr-1.5">Gebiet</Eyebrow>
            {AREA_OPTIONS.map(([v, label]) => (
              <Chip key={v} pressed={f.areas.includes(v)} dot={AREA_TONE[v]} onClick={() => setF({ ...f, areas: toggle(f.areas, v) })}>{label}</Chip>
            ))}
          </div>
        </div>
        {/* Leaves the viewport when the filters have scrolled away: the sticky toolbar then offers "↑ Filter". */}
        <div ref={sentinel} aria-hidden="true" />
      </section>

      <div ref={toolbar}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-cream px-1 py-2 text-[13px] text-muted xl:sticky xl:top-0 xl:z-20 xl:-my-2">
        {stuck && (
          <button type="button" onClick={backToFilters} className={`${buttonClass('secondary')} hidden h-7 xl:inline-flex`}>
            <span aria-hidden="true">↑</span> Filter
          </button>
        )}
        <span><span className="font-data font-medium text-ink tabular-nums">{rows.length}</span> {rows.length === 1 ? 'Anfrage' : 'Anfragen'}</span>
        <span className="flex items-center gap-1.5" title={`Aktualisiert sich alle ${LIVE_REFRESH_SECONDS} Sekunden, solange der Tab offen ist`}>
          <span>Stand <span className="font-data tabular-nums">{refreshing ? '…' : asOf}</span></span>
          <button type="button" onClick={refresh} disabled={refreshing} aria-label="Liste jetzt aktualisieren"
            className={`grid size-7 place-items-center rounded-md text-ink hover:bg-surface disabled:opacity-50 ${focusRing}`}>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              className={`size-4 ${refreshing ? 'motion-safe:animate-spin' : ''}`}>
              <path d="M16 10a6 6 0 1 1-1.8-4.3M16 4v3.5h-3.5" />
            </svg>
          </button>
        </span>
        <span aria-live="polite" className="font-medium text-slate">
          {freshCount > 0 && `${freshCount} ${freshCount === 1 ? 'neue Anfrage' : 'neue Anfragen'} eingegangen`}
        </span>
        <span className="flex items-center gap-1.5">
          <label htmlFor="lead-sort">sortiert nach</label>
          <select id="lead-sort" className={fieldClassSm} value={f.sort} onChange={(e) => setF({ ...f, ...nextSort(f, e.target.value as SortKey) })}>
            {Object.entries(SORT_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <button type="button" className={`${buttonClass('secondary')} h-7 w-7 px-0`}
            aria-label={f.dir === 'asc' ? 'Aufsteigend sortiert – umkehren' : 'Absteigend sortiert – umkehren'}
            onClick={() => setF({ ...f, dir: f.dir === 'asc' ? 'desc' : 'asc' })}>
            <span aria-hidden="true">{f.dir === 'asc' ? '↑' : '↓'}</span>
          </button>
        </span>
        {filtered && (
          <button type="button" className={`text-ink underline underline-offset-2 hover:no-underline ${focusRing}`}
            onClick={() => setF({ ...DEFAULT_FILTERS, sort: f.sort, dir: f.dir })}>Filter zurücksetzen</button>
        )}
        {truncated && <span className="font-medium text-ochre">Es werden die neuesten 1&nbsp;000 Anfragen angezeigt.</span>}
        <span className="flex flex-wrap gap-x-4 gap-y-1 sm:ml-auto">
          {LIST_OPTIONS.map(([k, label]) => (
            <label key={k} className="inline-flex items-center gap-1.5 hover:text-ink">
              <input type="checkbox" className="size-3.5 accent-ink" checked={f[k]} onChange={() => setF({ ...f, [k]: !f[k] })} />{label}
            </label>
          ))}
        </span>
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

      {/* xl+: no own scroll box, so the column headings can stick to the page under the toolbar. */}
      <div tabIndex={0} role="region" aria-label="Anfragen" style={{ '--toolbar-h': `${toolbarHeight}px` } as React.CSSProperties}
        className="overflow-x-auto rounded-lg border border-hairline bg-surface xl:overflow-visible">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              {th('created_at', 'Eingang')}{th('name', 'Interessent')}{th('area', 'Standort')}{th('project', 'Vorhaben')}
              {th('channel', 'Kanal')}{th('status', 'Status')}
              <th scope="col" className={`${stickyTh} px-3 py-2.5`}><span className="sr-only">Aktionen</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const mine = l.assigned_to === currentUserId;
              // The key includes the server-side editable values: after router.refresh() the row's local form state
              // (status select, reason, note) re-initialises from the fresh data instead of showing stale values.
              return (
                <FragmentRow key={`${l.id}|${l.status}|${l.disqualify_reason ?? ''}|${l.sales_note ?? ''}`} lead={l} mine={mine} open={open === l.id} pending={pending} now={now} fresh={fresh.has(l.id)}
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
      <p className="px-1 text-xs text-muted">Export dient der Auswertung – bitte in der Liste übernehmen, um Doppelarbeit zu vermeiden.</p>
    </div>
  );
}

function FragmentRow(props: {
  lead: LeadView; mine: boolean; open: boolean; pending: boolean; now: number; fresh: boolean; onToggle: () => void; onClaim: () => void; onRelease: () => void;
  onStatus: (s: LeadStatus, r: DisqualifyReason | null) => Promise<boolean>; onNote: (n: string) => void;
}) {
  const { lead: l } = props;
  const [note, setNote] = useState(l.sales_note ?? '');
  const map = osmLink(l);
  const flags = geoFlagTexts(l);
  const mail = mailStatusLabel(l);
  // Only mail problems reach the row (the address may be wrong: call instead); the full state is in Details.
  const mailProblem = mail.tone === 'red' || mail.tone === 'amber' ? mail : null;
  const waiting = waitingTime(l, props.now);
  const [date, time] = formatBerlin(l.created_at).split(' ');
  const place = placeLines(l);
  return (
    <>
      <tr className={`border-t border-hairline align-top transition-colors duration-1000 first:border-t-0 ${
        props.fresh ? 'bg-slate-wash/60 shadow-[inset_3px_0_0_var(--color-slate)]' : props.open ? 'bg-paper' : 'hover:bg-paper/70'}`}>
        <td className={`${cell} whitespace-nowrap font-data text-[13px] tabular-nums`}>
          {date}<div className="text-muted">{time}</div>
          {waiting && (
            <div className={`mt-1 font-ui text-xs ${waiting.tone === 'grey' ? 'text-muted' : `font-semibold ${toneText[waiting.tone]}`}`}
              title="Seit Eingang, noch von niemandem übernommen">{waiting.text}</div>
          )}
          {l.is_test && <div className="mt-1"><Badge tone="grey">Test</Badge></div>}
        </td>
        <td className={`${cell} min-w-52`}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-ink">{l.first_name} {l.last_name}</span>
            {l.groupSize > 1 && (
              <Badge tone="blue" title={`${l.groupSize} Einsendungen derselben Person (gleiche E-Mail, Telefonnummer oder Adresse innerhalb von ${DUPLICATE_WINDOW_DAYS} Tagen), hier zu einer Anfrage zusammengefasst. „Alle Einzelanfragen“ zeigt jede einzeln.`}>
                {l.groupSize}× angefragt
              </Badge>
            )}
          </div>
          <a href={`tel:${l.phone_e164 ?? l.phone_raw}`} className="font-data text-[13px] text-ink underline decoration-line underline-offset-2 hover:decoration-ink">{l.phone_raw}</a>
          {l.phone_extension && <span className="ml-1 text-xs text-muted">Durchwahl {l.phone_extension}</span>}
          <CallTimes lead={l} now={props.now} />
          <div className="mt-0.5 break-all text-xs text-muted">{l.email}</div>
          {mailProblem && <div className={`text-xs font-medium ${toneText[mailProblem.tone]}`} title={mailProblem.title}>⚠ {mailProblem.text}</div>}
          {l.duplicate_of && <div className={sub}>Wiederholte Einsendung (gleiche {(l.duplicate_reason ?? []).map((r) => DUP_REASON[r] ?? r).join(', ')})</div>}
          {l.related_lead_id && <div className={sub}>früherer Kontakt</div>}
        </td>
        <td className={`${cell} w-72 min-w-60`}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="line-clamp-2 font-medium text-ink" title={place.where}>{place.where}</span>
            {map && (
              <a href={map} target="_blank" rel="noopener" className="shrink-0 text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
                Karte<span aria-hidden="true"> ↗</span><span className="sr-only"> (OpenStreetMap, neuer Tab)</span>
              </a>
            )}
          </div>
          {place.detail && <div className={sub}>{place.detail}</div>}
          <div className="mt-2"><AreaVerdict area={l.area} /></div>
          <div className="mt-0.5 text-xs text-muted">Verortung: <AddressMatch lead={l} /></div>
          {l.geo_flags.includes('cadastral_only') && <div className="mt-0.5 text-xs font-medium text-ochre">{GEO_FLAG_LABELS.cadastral_only}</div>}
        </td>
        <td className={cell}>
          {l.project_type ? PROJECT_TYPE_LABELS[l.project_type] : '—'}
        </td>
        <td className={cell}>{l.channel.channel}<div className={sub}>{l.channel.campaign}</div></td>
        <td className={cell}>
          <StatusControl lead={l} mine={props.mine} pending={props.pending} onStatus={props.onStatus} />
          <div className={sub}>{l.ownerName ?? 'Nicht zugewiesen'}</div>
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
                <dd className="mt-0.5">
                  {l.geo_municipality ?? '—'} {l.geo_municipality_key && <span className="font-data text-xs text-muted">AGS {l.geo_municipality_key}</span>}
                  {l.geo_district && <div className="text-xs text-muted">Kreis {l.geo_district}</div>}
                </dd>
              </div>
              {flags.length > 0 && <div className="md:col-span-3"><dt><Eyebrow>Adress-Hinweise</Eyebrow></dt><dd className="mt-0.5 font-medium text-ochre">{flags.join(' · ')}</dd></div>}
              <div className="md:col-span-3">
                <dt><Eyebrow>Bestätigungsmail</Eyebrow></dt>
                <dd className="mt-0.5 flex flex-wrap items-center gap-2"><MailBadge lead={l} />{mail.title && <span className="text-xs text-muted">{mail.title}</span>}</dd>
              </div>
              {Array.isArray(l.geo_candidates) && (
                <div className="md:col-span-3"><dt><Eyebrow>Kandidaten</Eyebrow></dt>
                  <dd className="mt-0.5">{(l.geo_candidates as { label: string; stateCode: string | null }[]).map((c) => `${c.label} (${c.stateCode ?? '?'})`).join(' · ')}</dd>
                </div>
              )}
            </dl>
            <div className="mt-4 border-t border-hairline pt-4">
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
