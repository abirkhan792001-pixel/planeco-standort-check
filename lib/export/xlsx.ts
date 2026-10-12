import ExcelJS from 'exceljs';
import { sortRows, type Filters } from '@/lib/dashboard/filters';
import { waitingTime } from '@/lib/dashboard/urgency';
import type { LeadView } from '@/lib/leads/derive';
import { formatBerlin } from '@/lib/format';
import { REACHABILITY, TERMINAL_STATUSES } from '@/lib/leads/types';
import {
  ADDRESS_TEXT, AREA_TEXT, AREA_TONE, DEVICE_LABELS, geoFlagTexts, mailStatusLabel, PROJECT_TYPE_LABELS, REACHABILITY_HOURS,
  REACHABILITY_LABELS, REASON_LABELS, STATE_LABELS, STATUS_LABELS, STATUS_TONE, type LabelTone,
} from '@/lib/labels';

/**
 * The sales export (POST /dashboard/export) as a workbook a sales rep can read without filtering first:
 *   Übersicht        key numbers (formulas over the sheets below, with cached results), the selection, a legend
 *   Offen – anrufen  open leads nobody has claimed, in the dashboard's "Priorität" order
 *   In Bearbeitung   claimed open leads, by person
 *   Abgeschlossen    won / lost / not qualified, newest first
 *   Alle Daten       every column for every exported lead (also repeats and spam), in the dashboard's order
 * Every list is an Excel table (filter buttons, banded rows) under a band naming its column groups.
 * Lead data is always written as plain values, never as formulas (F-3); the only formulas are the overview's own.
 */

type Cell = string | number | Date | null;
/** `null` (or an empty string) leaves the cell truly blank, so Excel's filters and COUNTBLANK treat it as missing. */
export type Column = {
  header: string; width: number; value: (r: LeadView, index: number) => Cell;
  numFmt?: string; wrap?: boolean; center?: boolean; tone?: (r: LeadView) => LabelTone | null;
};
type Group = { label: string; columns: Column[] };
/** `fitWidth`: print on one page width (work lists); off for the wide raw-data sheet, which prints across pages. */
type SheetSpec = { name: string; table: string; tab: string; freezeColumns: number; fitWidth: boolean; groups: Group[] };
export type ExportMeta = { filters?: Filters; exportedAt?: Date; exporter?: string | null };

const FONT = 'Arial';
const ARGB = { ink: 'FF22403C', cream: 'FFF3F5EB', hairline: 'FFDCE1D5', muted: 'FF5A6A62', white: 'FFFFFFFF' };
// Same tones as the dashboard (globals.css): text colour on its wash reaches >= 4.5:1.
const WASH: Record<LabelTone, string> = { green: 'FFE2EEE5', amber: 'FFF5E8C4', red: 'FFF6DFD9', grey: 'FFE8EBE3', blue: 'FFE0E9F1', violet: 'FFEEE6F5' };
const TONE_TEXT: Record<LabelTone, string> = { green: 'FF2E6A4C', amber: 'FF7A4E00', red: 'FF93321F', grey: 'FF5A6A62', blue: 'FF2B5674', violet: 'FF6B3F8F' };
const DATE_FMT = 'dd.mm.yyyy hh:mm';

/** Berlin wall-clock time as an Excel date. Excel dates have no zone, so the cell shows exactly these digits. */
function excelDate(iso: string | null): Date | null {
  if (!iso) return null;
  const m = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})$/.exec(formatBerlin(iso));
  return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5])) : null;
}

const fullName = (r: LeadView) => `${r.first_name} ${r.last_name}`.trim();
const phoneWithExtension = (r: LeadView) => (r.phone_extension ? `${r.phone_raw} (Durchwahl ${r.phone_extension})` : r.phone_raw);
const callTimes = (r: LeadView) =>
  REACHABILITY.filter((s) => r.reachability.includes(s)).map((s) => `${REACHABILITY_LABELS[s]} ${REACHABILITY_HOURS[s]}`).join(', ');
const streetLine = (r: LeadView) => (r.address_unknown ? 'Adresse unbekannt' : [r.street, r.house_number].filter(Boolean).join(' '));
const townLine = (r: LeadView) => [r.postal_code, r.city].filter(Boolean).join(' ') || r.geo_municipality || (r.address_unknown ? r.plot_note : null);
const stateName = (r: LeadView) => (r.geo_state_code ? STATE_LABELS[r.geo_state_code] ?? r.geo_state_code : null);
const project = (r: LeadView) => (r.project_type ? PROJECT_TYPE_LABELS[r.project_type] : null);
const testFlag = (r: LeadView) => (r.is_test ? 'ja' : null);
const mailProblem = (r: LeadView) => { const m = mailStatusLabel(r); return m.tone === 'red' || m.tone === 'amber' ? m : null; };

// Reusable columns for the work sheets.
const C = {
  name: { header: 'Name', width: 22, value: fullName },
  phone: { header: 'Telefon', width: 20, value: phoneWithExtension },
  callTimes: { header: 'Erreichbar', width: 24, value: callTimes, wrap: true },
  email: { header: 'E-Mail', width: 28, value: (r) => r.email },
  mailHint: { header: 'Mail-Hinweis', width: 22, value: (r) => mailProblem(r)?.text ?? null, tone: (r) => mailProblem(r)?.tone ?? null, wrap: true },
  area: { header: 'Gebiet', width: 16, value: (r) => AREA_TEXT[r.area.verdict], tone: (r) => AREA_TONE[r.area.verdict] },
  distance: { header: 'Entfernung', width: 11, value: (r) => r.area.distanceKm ?? null, numFmt: '0" km"' },
  hub: { header: 'Nächster Standort', width: 15, value: (r) => r.area.hub ?? null },
  town: { header: 'Ort', width: 22, value: townLine },
  street: { header: 'Adresse', width: 22, value: streetLine },
  state: { header: 'Bundesland', width: 17, value: stateName },
  precision: { header: 'Verortung', width: 14, value: (r) => ADDRESS_TEXT[r.addressQuality] },
  geoHints: { header: 'Adress-Hinweise', width: 30, value: (r) => geoFlagTexts(r).join(', '), wrap: true },
  project: { header: 'Vorhaben', width: 12, value: project },
  plotNote: { header: 'Angaben zum Grundstück', width: 30, value: (r) => r.plot_note, wrap: true },
  submissions: { header: 'Einsendungen', width: 13, value: (r) => r.groupSize, center: true },
  channel: { header: 'Kanal', width: 16, value: (r) => r.channel.channel },
  campaign: { header: 'Kampagne', width: 20, value: (r) => r.channel.campaign },
  received: { header: 'Eingang', width: 16, value: (r) => excelDate(r.created_at), numFmt: DATE_FMT },
  owner: { header: 'Bearbeiter', width: 14, value: (r) => r.ownerName },
  status: { header: 'Status', width: 17, value: (r) => STATUS_LABELS[r.status], tone: (r) => STATUS_TONE[r.status] },
  note: { header: 'Notiz', width: 34, value: (r) => r.sales_note, wrap: true },
  test: { header: 'Test', width: 6, value: testFlag },
} satisfies Record<string, Column>;

/** Hours an unclaimed new lead has waited at export time (blank when nobody needs to act). Tone as in the dashboard. */
function waitingColumn(now: number): Column {
  return {
    header: 'Wartet', width: 10, numFmt: '0" Std."', center: true,
    value: (r) => (waitingTime(r, now) ? Math.floor((now - Date.parse(r.created_at)) / 3_600_000) : null),
    tone: (r) => { const w = waitingTime(r, now); return w && w.tone !== 'grey' ? w.tone : null; },
  };
}

function openSheet(now: number): SheetSpec {
  return {
    name: 'Offen – anrufen', table: 'Offen', tab: TONE_TEXT.green, freezeColumns: 4, fitWidth: true,
    groups: [
      { label: 'Anfrage', columns: [{ header: 'Nr.', width: 6, value: (_r, i) => i + 1, center: true }, C.received, waitingColumn(now)] },
      { label: 'Kontakt', columns: [C.name, C.phone, C.callTimes, C.email, C.mailHint] },
      { label: 'Standort', columns: [C.area, C.distance, C.hub, C.town, C.street, C.state, C.precision, C.geoHints] },
      { label: 'Vorhaben', columns: [C.project, C.plotNote, C.submissions] },
      { label: 'Herkunft', columns: [C.channel, C.campaign, C.test] },
    ],
  };
}

const WORKING_SHEET: SheetSpec = {
  name: 'In Bearbeitung', table: 'InBearbeitung', tab: TONE_TEXT.amber, freezeColumns: 3, fitWidth: true,
  groups: [
    { label: 'Bearbeitung', columns: [C.owner, C.status] },
    { label: 'Kontakt', columns: [C.name, C.phone, C.callTimes, C.email, C.mailHint] },
    { label: 'Notizen', columns: [C.note, { header: 'Übernommen am', width: 16, value: (r) => excelDate(r.assigned_at), numFmt: DATE_FMT }] },
    { label: 'Standort', columns: [C.area, C.distance, C.town, C.street] },
    { label: 'Vorhaben', columns: [C.project, C.plotNote] },
    { label: 'Anfrage', columns: [C.received, C.submissions, C.channel, C.test] },
  ],
};

const CLOSED_SHEET: SheetSpec = {
  name: 'Abgeschlossen', table: 'Abgeschlossen', tab: TONE_TEXT.grey, freezeColumns: 0, fitWidth: true,
  groups: [
    { label: 'Ergebnis', columns: [
      C.status,
      { header: 'Grund', width: 18, value: (r) => (r.disqualify_reason ? REASON_LABELS[r.disqualify_reason] : null) },
      { header: 'Abgeschlossen am', width: 16, value: (r) => excelDate(r.status_changed_at), numFmt: DATE_FMT },
      C.owner,
    ] },
    { label: 'Kontakt', columns: [C.name, C.phone, C.email] },
    { label: 'Standort', columns: [C.area, C.town] },
    { label: 'Vorhaben & Herkunft', columns: [C.project, C.channel, C.campaign] },
    { label: 'Notizen', columns: [C.note, C.received, C.test] },
  ],
};

/** "Alle Daten": every fact the dashboard has, grouped, one row per exported lead (spec §17). */
export const EXPORT_GROUPS: Group[] = [
  { label: 'Anfrage', columns: [
    { header: 'Eingang', width: 16, value: (r) => excelDate(r.created_at), numFmt: DATE_FMT },
    { header: 'Vorname', width: 14, value: (r) => r.first_name },
    { header: 'Nachname', width: 16, value: (r) => r.last_name },
    { header: 'Status', width: 16, value: (r) => STATUS_LABELS[r.status] },
    { header: 'Grund', width: 16, value: (r) => (r.disqualify_reason ? REASON_LABELS[r.disqualify_reason] : null) },
    { header: 'Bearbeiter', width: 12, value: (r) => r.ownerName },
    { header: 'Anfragen (Gruppe)', width: 10, value: (r) => r.groupSize, center: true },
    { header: 'Duplikat von', width: 12, value: (r) => r.duplicate_of },
    { header: 'Test', width: 6, value: testFlag },
    { header: 'Notiz', width: 30, value: (r) => r.sales_note, wrap: true },
  ] },
  { label: 'Kontakt', columns: [
    { header: 'Telefon', width: 18, value: (r) => r.phone_raw },
    { header: 'Telefon (E.164)', width: 16, value: (r) => r.phone_e164 },
    { header: 'Durchwahl', width: 11, value: (r) => r.phone_extension },
    { header: 'E-Mail', width: 26, value: (r) => r.email },
    { header: 'Erreichbarkeit', width: 16, value: (r) => r.reachability.join(', ') },
    { header: 'Bestätigungsmail', width: 24, value: (r) => mailStatusLabel(r).text },
  ] },
  { label: 'Grundstück & Lage', columns: [
    { header: 'Straße', width: 20, value: (r) => r.street },
    { header: 'Nr.', width: 6, value: (r) => r.house_number },
    { header: 'PLZ', width: 7, value: (r) => r.postal_code },
    { header: 'Ort', width: 16, value: (r) => r.city },
    { header: 'Angaben zum Grundstück', width: 30, value: (r) => r.plot_note, wrap: true },
    { header: 'Vorhaben', width: 11, value: project },
    { header: 'Gebiet', width: 13, value: (r) => AREA_TEXT[r.area.verdict] },
    { header: 'Nächster Standort', width: 13, value: (r) => r.area.hub ?? null },
    { header: 'Entfernung km', width: 8, value: (r) => r.area.distanceKm ?? null },
    { header: 'Adressgenauigkeit', width: 13, value: (r) => ADDRESS_TEXT[r.addressQuality] },
    { header: 'Adress-Hinweise', width: 28, value: (r) => geoFlagTexts(r).join(', ') },
    { header: 'Gemeinde', width: 16, value: (r) => r.geo_municipality },
    { header: 'Kreis', width: 18, value: (r) => r.geo_district },
    { header: 'Bundesland', width: 16, value: stateName },
    { header: 'Breitengrad', width: 11, value: (r) => r.geo_lat },
    { header: 'Längengrad', width: 11, value: (r) => r.geo_lon },
  ] },
  { label: 'Herkunft', columns: [
    { header: 'Kanalgruppe', width: 14, value: (r) => r.channel.group },
    { header: 'Kanal', width: 16, value: (r) => r.channel.channel },
    { header: 'Kampagne', width: 18, value: (r) => r.channel.campaign },
    { header: 'utm_source', width: 12, value: (r) => r.utm_source },
    { header: 'utm_medium', width: 12, value: (r) => r.utm_medium },
    { header: 'utm_content', width: 12, value: (r) => r.utm_content },
    { header: 'utm_term', width: 12, value: (r) => r.utm_term },
    { header: 'gclid', width: 12, value: (r) => r.gclid },
    { header: 'gbraid', width: 12, value: (r) => r.gbraid },
    { header: 'wbraid', width: 12, value: (r) => r.wbraid },
    { header: 'fbclid', width: 12, value: (r) => r.fbclid },
    { header: 'msclkid', width: 12, value: (r) => r.msclkid },
    { header: 'placement', width: 12, value: (r) => r.placement },
    { header: 'affiliate', width: 12, value: (r) => r.affiliate },
    { header: 'referrer', width: 28, value: (r) => r.referrer },
    { header: 'landing_path', width: 22, value: (r) => r.landing_path },
    { header: 'Gerät', width: 10, value: (r) => (r.device_type ? DEVICE_LABELS[r.device_type] : null) },
  ] },
  { label: 'Technik', columns: [{ header: 'ID', width: 36, value: (r) => r.id }] },
];
export const EXPORT_COLUMNS: Column[] = EXPORT_GROUPS.flatMap((g) => g.columns);
const ALL_SHEET: SheetSpec = { name: 'Alle Daten', table: 'AlleDaten', tab: TONE_TEXT.blue, freezeColumns: 3, fitWidth: false, groups: EXPORT_GROUPS };

const font = (o: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: FONT, size: 10, color: { argb: ARGB.ink }, ...o });
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

/** A list sheet: row 1 names the column groups, row 2 is the header of an Excel table holding the rows from row 3. */
function addListSheet(wb: ExcelJS.Workbook, spec: SheetSpec, rows: LeadView[]): { ws: ExcelJS.Worksheet; columns: Column[] } {
  const columns = spec.groups.flatMap((g) => g.columns);
  const ws = wb.addWorksheet(spec.name, {
    properties: { tabColor: { argb: spec.tab } },
    views: [{ state: 'frozen', xSplit: spec.freezeColumns, ySplit: 2 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: spec.fitWidth, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:2' },
  });
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.width;
    col.style = {
      font: font(), alignment: { vertical: 'top', wrapText: Boolean(c.wrap), ...(c.center ? { horizontal: 'center' as const } : {}) },
      ...(c.numFmt ? { numFmt: c.numFmt } : {}),
    };
  });

  let first = 1;
  for (const g of spec.groups) {
    const last = first + g.columns.length - 1;
    if (last > first) ws.mergeCells(1, first, 1, last);
    const band = ws.getCell(1, first);
    band.value = g.label.toUpperCase();
    band.font = font({ bold: true, size: 9 });
    band.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    for (let c = first; c <= last; c++) {
      ws.getCell(1, c).fill = fill(ARGB.cream);
      ws.getCell(1, c).border = { left: c === first ? { style: 'thin', color: { argb: ARGB.hairline } } : undefined };
    }
    first = last + 1;
  }
  ws.getRow(1).height = 20;

  const values = rows.map((r, i) => columns.map((c) => { const v = c.value(r, i); return v === '' ? null : v; }));
  if (values.length > 0) {
    // Values are plain strings/numbers/dates → exceljs writes plain cells, never formulas. Missing values are `null`.
    ws.addTable({
      name: spec.table, ref: 'A2', headerRow: true,
      style: { theme: 'TableStyleLight1', showRowStripes: true },
      columns: columns.map((c) => ({ name: c.header, filterButton: true })),
      rows: values,
    });
    columns.forEach((c, ci) => {
      if (!c.tone) return;
      rows.forEach((r, ri) => {
        const tone = c.tone!(r);
        if (!tone) return;
        const cell = ws.getCell(ri + 3, ci + 1);
        cell.fill = fill(WASH[tone]);
        cell.font = font({ bold: true, color: { argb: TONE_TEXT[tone] } });
      });
    });
  } else {
    ws.getRow(2).values = columns.map((c) => c.header);
    ws.mergeCells(3, 1, 3, Math.max(columns.length, 1));
    ws.getCell(3, 1).value = 'Keine Anfragen in dieser Auswahl.';
    ws.getCell(3, 1).font = font({ italic: true, color: { argb: ARGB.muted } });
  }
  const header = ws.getRow(2);
  header.height = 30;
  header.eachCell((cell) => {
    cell.font = font({ bold: true, color: { argb: ARGB.white } });
    cell.fill = fill(ARGB.ink);
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  return { ws, columns };
}

/** Readable summary of the dashboard filters the export was made with. */
export function describeSelection(f?: Filters): string {
  if (!f) return 'Alle Anfragen';
  const parts: string[] = [];
  if (f.statuses.length) parts.push(`Status: ${f.statuses.map((s) => STATUS_LABELS[s]).join(', ')}`);
  if (f.areas.length) parts.push(`Gebiet: ${f.areas.map((a) => AREA_TEXT[a]).join(', ')}`);
  if (f.channelGroup) parts.push(`Kanal: ${f.channelGroup}`);
  if (f.mine) parts.push('nur eigene Anfragen');
  if (f.unassigned) parts.push('nur nicht zugewiesene');
  if (f.hideTest) parts.push('ohne Testdaten');
  if (f.showSpam) parts.push('inkl. Spam');
  if (f.allSubmissions) parts.push('alle Einzelanfragen');
  if (f.q) parts.push(`Suche „${f.q}“`);
  return parts.length ? parts.join(' · ') : 'Alle Anfragen (keine Filter)';
}

const AREA_ORDER = ['inside', 'edge', 'outside', 'unclear', 'pending', 'failed'] as const;
const STATUS_ORDER = ['neu', 'in_bearbeitung', 'qualifiziert', 'gewonnen', 'nicht_qualifiziert', 'verloren'] as const;

export async function buildLeadsWorkbook(rows: LeadView[], meta: ExportMeta = {}): Promise<Buffer> {
  const exportedAt = meta.exportedAt ?? new Date();
  const now = exportedAt.getTime();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Standort-Check';
  wb.created = exportedAt;
  wb.calcProperties.fullCalcOnLoad = true;
  const overview = wb.addWorksheet('Übersicht', {
    properties: { tabColor: { argb: ARGB.ink } }, views: [{ showGridLines: false }],
    pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // Work lists: one row per lead group (no repeats), no spam. Open = nobody responsible yet; the rest by owner / outcome.
  const roots = rows.filter((r) => !r.duplicate_of && !r.spam_suspected);
  const isOpen = (r: LeadView) => !TERMINAL_STATUSES.includes(r.status);
  const open = sortRows(roots.filter((r) => isOpen(r) && !r.assigned_to), 'priority', 'asc');
  const working = sortRows(roots.filter((r) => isOpen(r) && r.assigned_to), 'priority', 'asc')
    .sort((a, b) => (a.ownerName ?? '').localeCompare(b.ownerName ?? '', 'de'));
  const closed = roots.filter((r) => !isOpen(r))
    .sort((a, b) => Date.parse(b.status_changed_at ?? b.created_at) - Date.parse(a.status_changed_at ?? a.created_at));

  const sheets = {
    open: addListSheet(wb, openSheet(now), open),
    working: addListSheet(wb, WORKING_SHEET, working),
    closed: addListSheet(wb, CLOSED_SHEET, closed),
    all: addListSheet(wb, ALL_SHEET, rows),
  };
  /** Absolute range of one column's data cells (row 3 to the last row; one row when the list is empty). */
  const range = (s: { ws: ExcelJS.Worksheet; columns: Column[] }, header: string, count: number) => {
    const letter = s.ws.getColumn(s.columns.findIndex((c) => c.header === header) + 1).letter;
    return `'${s.ws.name}'!$${letter}$3:$${letter}$${Math.max(3, count + 2)}`;
  };

  // ── Übersicht ──
  const ws = overview;
  ws.columns = [{ width: 46 }, { width: 12 }, { width: 62 }];
  let row = 1;
  const put = (col: number, value: ExcelJS.CellValue, f: Partial<ExcelJS.Font> = {}) => {
    const cell = ws.getCell(row, col);
    cell.value = value;
    cell.font = font(f);
    cell.alignment = { vertical: 'top', wrapText: col !== 2, ...(col === 3 ? { indent: 1 } : {}) };
    return cell;
  };
  // Excel does not grow a merged row to fit wrapped text: size it from the text (about 110 characters per line here).
  const fitHeight = (text: string, charsPerLine: number) => { ws.getRow(row).height = Math.max(15, Math.ceil(text.length / charsPerLine) * 14); };
  const line = (text: string, f: Partial<ExcelJS.Font> = {}) => { ws.mergeCells(row, 1, row, 3); put(1, text, f); fitHeight(text, 110); row++; };
  const section = (title: string) => {
    row++;
    for (let c = 1; c <= 3; c++) ws.getCell(row, c).border = { bottom: { style: 'thin', color: { argb: ARGB.hairline } } };
    put(1, title.toUpperCase(), { bold: true, size: 9, color: { argb: ARGB.muted } });
    row++;
  };
  const link = (sheet: string, text: string): ExcelJS.CellValue => ({ text, hyperlink: `#'${sheet}'!A1` });
  /** Label | formula with its cached result | optional third cell. Criteria come from the label cell, never from data. */
  const figure = (label: string, formula: string, result: number, third?: ExcelJS.CellValue, tone?: LabelTone) => {
    const labelCell = put(1, label);
    if (tone) { labelCell.fill = fill(WASH[tone]); labelCell.font = font({ color: { argb: TONE_TEXT[tone] } }); }
    const value = put(2, { formula: formula.replaceAll('{A}', `$A${row}`), result }, { bold: true });
    value.alignment = { horizontal: 'right', vertical: 'top' };
    if (third !== undefined) put(3, third, typeof third === 'object' ? { underline: true } : { color: { argb: ARGB.muted } });
    row++;
  };

  put(1, 'Standort-Check · Anfragen', { bold: true, size: 16 }); row++;
  line(`Stand ${formatBerlin(exportedAt.toISOString())} (Berlin)${meta.exporter ? ` · exportiert von ${meta.exporter}` : ''}`, { color: { argb: ARGB.muted } });
  line(`Auswahl: ${describeSelection(meta.filters)}`, { color: { argb: ARGB.muted } });
  line('Der Export dient der Auswertung. Anfragen bitte im Dashboard übernehmen, damit niemand doppelt anruft.', { italic: true, color: { argb: ARGB.muted } });

  const openArea = range(sheets.open, 'Gebiet', open.length);
  const openWait = range(sheets.open, 'Wartet', open.length);
  const waited = (h: number) => open.filter((r) => waitingTime(r, now) && now - Date.parse(r.created_at) >= h * 3_600_000).length;
  section('Jetzt zu tun');
  figure('Offen – noch niemand zuständig', `COUNTA(${range(sheets.open, 'Name', open.length)})`, open.length, link(sheets.open.ws.name, '→ Blatt „Offen – anrufen“'));
  figure('   davon im Gebiet oder in Randlage', `COUNTIF(${openArea},"${AREA_TEXT.inside}")+COUNTIF(${openArea},"${AREA_TEXT.edge}")`,
    open.filter((r) => r.area.verdict === 'inside' || r.area.verdict === 'edge').length);
  figure('   davon wartet seit 24 Std. oder länger', `COUNTIF(${openWait},">=24")`, waited(24));
  figure('   davon wartet seit 48 Std. oder länger', `COUNTIF(${openWait},">=48")`, waited(48));
  figure('In Bearbeitung', `COUNTA(${range(sheets.working, 'Name', working.length)})`, working.length, link(sheets.working.ws.name, '→ Blatt „In Bearbeitung“'));
  figure('Abgeschlossen', `COUNTA(${range(sheets.closed, 'Name', closed.length)})`, closed.length, link(sheets.closed.ws.name, '→ Blatt „Abgeschlossen“'));
  figure('Alle exportierten Zeilen', `COUNTA(${range(sheets.all, 'ID', rows.length)})`, rows.length, link(sheets.all.ws.name, '→ Blatt „Alle Daten“'));

  // Counted over "Alle Daten" without repeats ("Duplikat von" blank), so each person counts once.
  const allStatus = range(sheets.all, 'Status', rows.length);
  const allArea = range(sheets.all, 'Gebiet', rows.length);
  const allDup = range(sheets.all, 'Duplikat von', rows.length);
  const firsts = rows.filter((r) => !r.duplicate_of);
  section('Nach Status (je Person einmal)');
  for (const s of STATUS_ORDER) {
    figure(STATUS_LABELS[s], `COUNTIFS(${allStatus},{A},${allDup},"")`, firsts.filter((r) => r.status === s).length, undefined, STATUS_TONE[s]);
  }
  section('Nach Gebiet (je Person einmal)');
  for (const a of AREA_ORDER) {
    figure(AREA_TEXT[a], `COUNTIFS(${allArea},{A},${allDup},"")`, firsts.filter((r) => r.area.verdict === a).length, undefined, AREA_TONE[a]);
  }
  const owners = [...new Set(working.map((r) => r.ownerName ?? 'Unbekannt'))].sort((a, b) => a.localeCompare(b, 'de'));
  if (owners.length) {
    section('In Bearbeitung je Person');
    const ownerRange = range(sheets.working, 'Bearbeiter', working.length);
    for (const o of owners) figure(o, `COUNTIF(${ownerRange},{A})`, working.filter((r) => (r.ownerName ?? 'Unbekannt') === o).length);
  }

  section('So ist die Datei aufgebaut');
  const guide: [string, string][] = [
    [sheets.open.ws.name, 'Noch niemand zuständig. Reihenfolge wie „Priorität“ im Dashboard: im Gebiet zuerst, dann wer am längsten wartet.'],
    [sheets.working.ws.name, 'Übernommene, noch offene Anfragen – nach Person sortiert, mit Notiz.'],
    [sheets.closed.ws.name, 'Gewonnen, verloren oder nicht qualifiziert – zuletzt abgeschlossen zuerst.'],
    [sheets.all.ws.name, 'Jede Spalte für jede exportierte Zeile (auch Wiederholungen und ggf. Spam) – für Auswertungen oder den CRM-Import. Reihenfolge wie im Dashboard.'],
  ];
  for (const [sheet, text] of guide) {
    put(1, link(sheet, sheet), { underline: true });
    ws.mergeCells(row, 2, row, 3);
    put(2, text, { color: { argb: ARGB.muted } }).alignment = { wrapText: true, vertical: 'top' };
    fitHeight(text, 78);
    row++;
  }
  line('Jede Liste hat Filterknöpfe in der Kopfzeile; Kopfzeilen und Namen bleiben beim Scrollen stehen.', { color: { argb: ARGB.muted } });

  section('Farben');
  const legend: [LabelTone, string][] = [
    ['green', 'Im Gebiet · Qualifiziert · Gewonnen'],
    ['amber', 'Randlage · In Bearbeitung · wartet seit 24 Std. · Mail-Hinweis'],
    ['red', 'Außerhalb · wartet seit 48 Std. · Mail fehlgeschlagen'],
    ['violet', 'Unklar – bitte prüfen'],
    ['blue', 'Neu · Wird geprüft'],
    ['grey', 'Nicht qualifiziert · Verloren · Prüfung fehlgeschlagen'],
  ];
  for (const [tone, text] of legend) {
    ws.mergeCells(row, 1, row, 3);
    const cell = put(1, text, { color: { argb: TONE_TEXT[tone] } });
    cell.fill = fill(WASH[tone]);
    row++;
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
