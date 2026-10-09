import type { Metadata } from 'next';
import { SERVICE_AREA } from '@/lib/config/service-area';
import { deriveLeadViews } from '@/lib/leads/derive';
import { LeadTable } from '@/components/lead-table';
import { AreaBadge, StatusBadge } from '@/components/badges';
import { Badge, Button, Chip, DistanceBar, Eyebrow, fieldClass } from '@/components/ui';
import { LEAD_STATUSES } from '@/lib/leads/types';
import { SPECIMEN_PROFILES, SPECIMEN_ROWS, SPECIMEN_USER } from './samples';

export const metadata: Metadata = { title: 'Designsystem · Standort-Check', robots: { index: false, follow: false } };

const COLORS = [
  { group: 'Marke', items: [
    { token: 'ink', hex: '#22403C', use: 'Kopfzeile, Primäraktionen, Text' },
    { token: 'cream', hex: '#F3F5EB', use: 'Seitenhintergrund' },
    { token: 'paper', hex: '#FAF9F5', use: 'Tabellenkopf, geöffnete Zeile' },
    { token: 'surface', hex: '#FFFFFF', use: 'Karten, Tabellen, Felder' },
    { token: 'terracotta', hex: '#E0805F', use: 'Nur Dekoration: aktiver Tab' },
    { token: 'terracotta-deep', hex: '#A9563A', use: 'Fokusring' },
  ] },
  { group: 'Linien & Text', items: [
    { token: 'line', hex: '#828F87', use: 'Ränder von Bedienelementen (≥ 3:1)' },
    { token: 'hairline', hex: '#DCE1D5', use: 'Trennlinien, Kartenrand' },
    { token: 'muted', hex: '#5A6A62', use: 'Nebentext, Labels' },
  ] },
  { group: 'Bewertung', items: [
    { token: 'moss', hex: '#2E6A4C', wash: '#E2EEE5', use: 'Im Gebiet, qualifiziert, gesendet' },
    { token: 'ochre', hex: '#7A4E00', wash: '#F5E8C4', use: 'Randlage, prüfen, in Bearbeitung' },
    { token: 'brick', hex: '#93321F', wash: '#F6DFD9', use: 'Außerhalb, Fehler' },
    { token: 'slate', hex: '#2B5674', wash: '#E0E9F1', use: 'Neu, Information' },
  ] },
] as const;

const TYPE = [
  { name: 'Seitentitel', cls: 'font-brand text-xl font-semibold', spec: 'Poppins 600 · 20/28', sample: 'Kanäle & Kampagnen' },
  { name: 'Text', cls: 'text-sm', spec: 'IBM Plex Sans 400 · 14/20', sample: 'Adresse unbekannt: Lübeck' },
  { name: 'Hervorgehoben', cls: 'text-sm font-medium', spec: 'IBM Plex Sans 500 · 14/20', sample: 'Kai Ruthenberg' },
  { name: 'Nebentext', cls: 'text-xs text-muted', spec: 'IBM Plex Sans 400 · 12/16', sample: 'Schleswig-Holstein · Herzogtum Lauenburg' },
  { name: 'Eyebrow', cls: 'text-[11px] font-semibold uppercase tracking-[0.08em] text-muted', spec: 'Plex Sans 600 · 11 · +0.08em', sample: 'Status' },
  { name: 'Daten', cls: 'font-data text-[13px] tabular-nums', spec: 'IBM Plex Mono 400 · 13 · tabellarische Ziffern', sample: '04.10.2026 18:38 · 0451 9988776' },
] as const;

/** `wide` stacks the heading above the content (for the full-width table pattern). */
function Section({ id, title, intro, wide = false, children }: { id: string; title: string; intro: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={`grid gap-4 border-t border-hairline pt-8 ${wide ? '' : 'lg:grid-cols-[14rem_1fr] lg:gap-10'}`}>
      <div>
        <h2 id={id} className="font-brand text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted">{intro}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

const km = (verdict: 'inside' | 'edge' | 'outside', d: number, hub = 'Hamburg') => ({ verdict, hub, distanceKm: d });

export default function DesignSystemPage() {
  const views = deriveLeadViews(SPECIMEN_ROWS, SPECIMEN_PROFILES, 'localhost');
  const { radiusKm, edgeBandKm } = SERVICE_AREA;
  return (
    <div className="mx-auto max-w-[96rem] space-y-10 pb-10">
        <header className="max-w-2xl">
          <Eyebrow>Standort-Check · Vertrieb</Eyebrow>
          <h1 className="mt-1 font-brand text-3xl font-semibold">Designsystem</h1>
          <p className="mt-2 text-sm text-muted">
            Bausteine des Vertriebs-Dashboards. Alle Beispiele hier sind die echten Komponenten aus <code className="font-data text-xs">components/ui.tsx</code>;
            Farben und Schriften kommen aus den Tokens in <code className="font-data text-xs">app/globals.css</code>.
          </p>
        </header>

        <Section id="farben" title="Farben" intro="Markenfarben von Planeco plus vier erdige Bewertungstöne. Jede Textfarbe erreicht auf ihrer Fläche mindestens 4,5 : 1.">
          <div className="space-y-6">
            {COLORS.map((g) => (
              <div key={g.group}>
                <Eyebrow>{g.group}</Eyebrow>
                <ul className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {g.items.map((c) => (
                    <li key={c.token} className="flex items-center gap-3 rounded-lg border border-hairline bg-surface p-2.5">
                      <span className="flex h-12 w-16 shrink-0 overflow-hidden rounded-md border border-hairline">
                        <span className="flex-1" style={{ background: c.hex }} />
                        {'wash' in c && <span className="grid flex-1 place-items-center text-xs font-semibold" style={{ background: c.wash, color: c.hex }}>Aa</span>}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-data text-[13px] font-medium">{c.token}</span>
                        <span className="block font-data text-xs text-muted">{c.hex}{'wash' in c ? ` / ${c.wash}` : ''}</span>
                        <span className="block text-xs text-muted">{c.use}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section id="schrift" title="Typografie" intro="Poppins verbindet mit der Landingpage, nur für Seitentitel. Plex Sans trägt die Oberfläche, Plex Mono alle Zahlen, Zeiten und Telefonnummern.">
          <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
            {TYPE.map((t) => (
              <li key={t.name} className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr_auto] sm:items-baseline sm:gap-4">
                <span className="text-xs text-muted">{t.name}</span>
                <span className={t.cls}>{t.sample}</span>
                <span className="font-data text-xs text-muted">{t.spec}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="form" title="Form & Abstand" intro="4-px-Raster. Bedienelemente 32 oder 36 px hoch, Radius 6 px; Karten und Tabellen 8 px; Filter-Chips voll gerundet.">
          <div className="flex flex-wrap items-end gap-6 rounded-lg border border-hairline bg-surface p-4">
            {[4, 8, 12, 16, 24, 32].map((n) => (
              <div key={n} className="flex flex-col items-center gap-1.5">
                <span className="block bg-ink/80" style={{ width: n, height: n }} />
                <span className="font-data text-xs text-muted">{n}</span>
              </div>
            ))}
            <span className="mx-2 h-10 w-px bg-hairline" aria-hidden="true" />
            {[['rounded', '4'], ['rounded-md', '6'], ['rounded-lg', '8'], ['rounded-full', '∞']].map(([r, label]) => (
              <div key={r} className="flex flex-col items-center gap-1.5">
                <span className={`block size-10 border border-line bg-cream ${r}`} />
                <span className="font-data text-xs text-muted">{label}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="komponenten" title="Komponenten" intro="Eine Aktion pro Farbe: Ink speichert, Moos übernimmt eine Anfrage, umrandet ist alles Zweitrangige.">
          <div className="space-y-5 rounded-lg border border-hairline bg-surface p-4">
            <div className="space-y-2">
              <Eyebrow>Buttons</Eyebrow>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" size="md">Status speichern</Button>
                <Button variant="confirm">Übernehmen</Button>
                <Button>Freigeben</Button>
                <Button variant="ghost">Details</Button>
                <Button variant="primary" size="md" disabled>Deaktiviert</Button>
              </div>
            </div>
            <div className="space-y-2">
              <Eyebrow>Filter-Chips</Eyebrow>
              <div className="flex flex-wrap gap-1.5">
                <Chip pressed count={3}>Neu</Chip><Chip pressed={false} count={1}>In Bearbeitung</Chip><Chip pressed={false}>Im Gebiet</Chip>
              </div>
            </div>
            <div className="space-y-2">
              <Eyebrow>Felder</Eyebrow>
              <div className="flex flex-wrap gap-2">
                <input aria-label="Beispiel-Suche" type="search" placeholder="Name, E-Mail, Telefon oder PLZ suchen" className={`${fieldClass} w-72`} />
                <select aria-label="Beispiel-Auswahl" className={fieldClass} defaultValue=""><option value="">Alle Kanäle</option></select>
              </div>
            </div>
            <div className="space-y-2">
              <Eyebrow>Badges</Eyebrow>
              <div className="flex flex-wrap gap-1.5">
                {LEAD_STATUSES.map((s) => <StatusBadge key={s} status={s} />)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="green">Hausgenau</Badge><Badge tone="blue">Straßengenau</Badge><Badge tone="amber">Nur PLZ-genau ⚠</Badge>
                <Badge tone="red">Mail fehlgeschlagen</Badge><Badge tone="grey">Test</Badge>
              </div>
            </div>
            <div className="space-y-2">
              <Eyebrow>Hinweis</Eyebrow>
              <div role="note" className="flex items-center gap-3 rounded-md border border-ochre/40 bg-ochre-wash px-3 py-2 text-sm">
                Die Anfrage wurde gerade von Vertrieb B übernommen.
                <Button variant="ghost">Trotzdem übernehmen</Button>
              </div>
            </div>
          </div>
        </Section>

        <Section id="distanz" title="Distanzleiste"
          intro={`Das Erkennungszeichen des Dashboards: Entfernung zum nächsten Hub auf fester Skala. Grün bis ${radiusKm} km Einsatzradius, ocker im ${edgeBandKm}-km-Randband, danach außerhalb.`}>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[km('inside', 4), km('edge', 55), km('outside', 78, 'Frankfurt am Main'), km('outside', 174, 'Berlin')].map((a) => (
              <li key={`${a.verdict}${a.distanceKm}`} className="space-y-1.5 rounded-lg border border-hairline bg-surface p-3">
                <AreaBadge area={a} />
                <DistanceBar area={a} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Die Leiste ergänzt das Badge, ersetzt es nie: Bewertung und Kilometer stehen immer auch als Text daneben.</p>
        </Section>

        <Section id="muster" wide title="Muster: Anfragenliste" intro="Die echte Tabelle mit den fünf Beispielanfragen aus dem Case. Filter und Sortierung funktionieren. Übernehmen und Status schlagen hier fehl (Beispiel-IDs sind keine echten Anfragen); der Export lädt die echte Liste.">
          <LeadTable views={views} currentUserId={SPECIMEN_USER} truncated={false} />
        </Section>
    </div>
  );
}
