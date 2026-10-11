import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildLeadsWorkbook, describeSelection, EXPORT_COLUMNS } from '@/lib/export/xlsx';
import { DEFAULT_FILTERS } from '@/lib/dashboard/filters';
import { deriveLeadViews } from '@/lib/leads/derive';
import { makeLeadRow } from '../fixtures/lead-row';

async function load(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}
async function readBack(buf: Buffer, sheet = 'Alle Daten') {
  return (await load(buf)).getWorksheet(sheet)!;
}

const col = (h: string) => EXPORT_COLUMNS.findIndex((c) => c.header === h) + 1;
/** Column number of a header in row 2 of any list sheet. */
const colOf = (ws: ExcelJS.Worksheet, h: string) => (ws.getRow(2).values as unknown[]).indexOf(h);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const FIRST = 3; // row 1: column groups, row 2: headers

describe('buildLeadsWorkbook: Alle Daten', () => {
  it('keeps phone numbers, umlauts and formula-like text as plain strings; Eingang is a real date in Berlin time', async () => {
    const views = deriveLeadViews([makeLeadRow({ first_name: '=1+1', city: 'Groß Grönau', phone_raw: '+49 40 / 123 456', phone_e164: '+4940123456' })], [], 'x');
    const ws = await readBack(await buildLeadsWorkbook(views));
    const cell = (h: string) => ws.getRow(FIRST).getCell(col(h));
    expect(cell('Vorname').value).toBe('=1+1');
    expect(cell('Vorname').type).toBe(ExcelJS.ValueType.String);
    expect(cell('Telefon (E.164)').value).toBe('+4940123456');
    expect(cell('Ort').value).toBe('Groß Grönau');
    // 08:00 UTC = 10:00 Berlin (CEST); Excel dates have no zone, so the cell carries the Berlin digits.
    expect((cell('Eingang').value as Date).toISOString()).toBe('2026-10-01T10:00:00.000Z');
    expect(cell('Eingang').numFmt).toBe('dd.mm.yyyy hh:mm');
  });

  it('has a band naming the column groups and a bold, frozen header row', async () => {
    const ws = await readBack(await buildLeadsWorkbook([]));
    expect(ws.getRow(1).getCell(1).value).toBe('ANFRAGE');
    expect(ws.getRow(1).getCell(col('Telefon')).value).toBe('KONTAKT');
    expect(ws.getRow(2).getCell(1).value).toBe('Eingang');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 2, xSplit: 3 });
    expect(ws.getRow(2).getCell(1).font?.bold).toBe(true);
    expect(ws.getRow(2).getCell(1).font?.name).toBe('Arial');
  });

  it('exports an empty selection as the headers plus a note', async () => {
    const ws = await readBack(await buildLeadsWorkbook([]));
    expect(ws.getRow(2).values).toEqual([undefined, ...EXPORT_COLUMNS.map((c) => c.header)]);
    expect(ws.getRow(FIRST).getCell(1).value).toBe('Keine Anfragen in dieser Auswahl.');
  });

  it('puts the phone extension (Durchwahl) right after the E.164 number as text', async () => {
    expect(col('Durchwahl')).toBe(col('Telefon (E.164)') + 1);
    const views = deriveLeadViews([makeLeadRow({ phone_extension: '0123' })], [], 'x');
    const ws = await readBack(await buildLeadsWorkbook(views));
    const cell = ws.getRow(FIRST).getCell(col('Durchwahl'));
    expect(cell.value).toBe('0123');
    expect(cell.type).toBe(ExcelJS.ValueType.String);
  });

  it('writes the same German mail-status and address-hint texts as the dashboard badges', async () => {
    const views = deriveLeadViews([
      makeLeadRow({ id: id(1), email_status: 'sending' }),
      makeLeadRow({ id: id(2), email_status: 'skipped', email_skip_reason: 'no_mx' }),
      makeLeadRow({ id: id(3), email_status: 'done', enrichment_status: 'done', geo_precision: 'street', geo_flags: ['plz_mismatch'], geo_found_postcode: '01069' }),
    ], [], 'x');
    const ws = await readBack(await buildLeadsWorkbook(views));
    expect(ws.getRow(FIRST).getCell(col('Bestätigungsmail')).value).toBe('wird gesendet');
    expect(ws.getRow(FIRST + 1).getCell(col('Bestätigungsmail')).value).toBe('Keine Mail – Domain ungültig');
    expect(ws.getRow(FIRST + 2).getCell(col('Bestätigungsmail')).value).toBe('gesendet');
    expect(ws.getRow(FIRST + 2).getCell(col('Adress-Hinweise')).value).toBe('PLZ passt nicht zur Straße (gefunden: 01069)');
    expect(ws.getRow(FIRST + 2).getCell(col('Adressgenauigkeit')).value).toBe('Straßengenau');
  });

  it('shows a dash instead of a raw code for leads without enrichment (spam)', async () => {
    const views = deriveLeadViews([makeLeadRow({ enrichment_status: 'skipped', spam_suspected: true })], [], 'x');
    const ws = await readBack(await buildLeadsWorkbook(views));
    expect(ws.getRow(FIRST).getCell(col('Adressgenauigkeit')).value).toBe('—');
    expect(ws.getRow(FIRST).getCell(col('Gebiet')).value).toBe('—');
  });

  it('writes numbers as numbers', async () => {
    const views = deriveLeadViews([makeLeadRow({ enrichment_status: 'done', geo_precision: 'house', geo_lat: 53.87, geo_lon: 10.69, duplicate_of: null })], [], 'x');
    const ws = await readBack(await buildLeadsWorkbook(views));
    expect(typeof ws.getRow(FIRST).getCell(col('Entfernung km')).value).toBe('number');
    expect(ws.getRow(FIRST).getCell(col('Anfragen (Gruppe)')).value).toBe(1);
  });

  it('writes missing values as truly blank cells, not as empty strings', async () => {
    const views = deriveLeadViews([makeLeadRow({ sales_note: null, plot_note: null, phone_extension: null, is_test: false, reachability: [], geo_flags: [], duplicate_of: null, disqualify_reason: null })], [], 'x');
    const ws = await readBack(await buildLeadsWorkbook(views));
    for (const h of ['Notiz', 'Angaben zum Grundstück', 'Durchwahl', 'Test', 'Erreichbarkeit', 'Adress-Hinweise', 'Grund', 'Bearbeiter', 'Duplikat von', 'Nächster Standort', 'Entfernung km', 'Breitengrad', 'Längengrad', 'utm_source', 'gclid']) {
      expect(col(h), h).toBeGreaterThan(0);
      const cell = ws.getRow(FIRST).getCell(col(h));
      expect(cell.value, h).toBeNull();
      expect(cell.type, h).toBe(ExcelJS.ValueType.Null);
    }
  });

  it.each([
    ['HYPERLINK formula', '=HYPERLINK("http://x","klick")'],
    ['plus formula', '+SUM(1)'],
    ['at command', '@cmd'],
    ['minus arithmetic', '-2+3'],
  ])('keeps formula-like text as a plain string on every sheet (F-3: %s)', async (_label, text) => {
    const views = deriveLeadViews([makeLeadRow({ first_name: text, last_name: text, plot_note: text, sales_note: text })], [], 'x');
    const wb = await load(await buildLeadsWorkbook(views));
    const all = wb.getWorksheet('Alle Daten')!;
    for (const h of ['Vorname', 'Nachname', 'Angaben zum Grundstück', 'Notiz']) {
      const cell = all.getRow(FIRST).getCell(col(h));
      expect(cell.type, h).toBe(ExcelJS.ValueType.String);
      expect(cell.value, h).toBe(text);
      expect(cell.formula, h).toBeUndefined();
    }
    const open = wb.getWorksheet('Offen – anrufen')!;
    const name = open.getRow(FIRST).getCell(colOf(open, 'Name'));
    expect(name.type).toBe(ExcelJS.ValueType.String);
    expect(name.formula).toBeUndefined();
  });

  it('adds the raw attribution and geo facts of spec §17', async () => {
    const views = deriveLeadViews([makeLeadRow({
      referrer: 'https://www.google.com/', landing_path: '/standort-check?x=1', gbraid: 'gb1', wbraid: 'wb1', msclkid: 'ms1', placement: 'plc', affiliate: 'aff',
      enrichment_status: 'done', geo_precision: 'house', geo_lat: 53.8697, geo_lon: 10.6866,
    })], [], 'x');
    const ws = await readBack(await buildLeadsWorkbook(views));
    const row = ws.getRow(FIRST);
    const expectText = { referrer: 'https://www.google.com/', landing_path: '/standort-check?x=1', gbraid: 'gb1', wbraid: 'wb1', msclkid: 'ms1', placement: 'plc', affiliate: 'aff' };
    for (const [h, v] of Object.entries(expectText)) {
      expect(col(h), h).toBeGreaterThan(0);
      expect(row.getCell(col(h)).value, h).toBe(v);
      expect(row.getCell(col(h)).type, h).toBe(ExcelJS.ValueType.String);
    }
    expect(row.getCell(col('Breitengrad')).value).toBe(53.8697);
    expect(row.getCell(col('Breitengrad')).type).toBe(ExcelJS.ValueType.Number);
    expect(row.getCell(col('Längengrad')).value).toBe(10.6866);
    expect(row.getCell(col('Längengrad')).type).toBe(ExcelJS.ValueType.Number);
  });

  it('writes the device type in German (Gerät)', async () => {
    const views = deriveLeadViews([
      makeLeadRow({ id: id(1), device_type: 'mobile' }),
      makeLeadRow({ id: id(2), device_type: 'tablet' }),
      makeLeadRow({ id: id(3), device_type: 'desktop' }),
      makeLeadRow({ id: id(4), device_type: 'unknown' }),
      makeLeadRow({ id: id(5), device_type: null }),
    ], [], 'x');
    const ws = await readBack(await buildLeadsWorkbook(views));
    expect([0, 1, 2, 3, 4].map((i) => ws.getRow(FIRST + i).getCell(col('Gerät')).value)).toEqual(['Mobil', 'Tablet', 'Desktop', 'Unbekannt', null]);
  });

  it('uses the badge wording for the area verdict (shared labels)', async () => {
    const views = deriveLeadViews([
      makeLeadRow({ id: id(1), enrichment_status: 'done', geo_precision: 'none' }), // no coordinates -> unclear
      makeLeadRow({ id: id(2) }), // enrichment pending
      makeLeadRow({ id: id(3), enrichment_status: 'done', geo_precision: 'house', geo_lat: 53.8697, geo_lon: 10.6866 }),
    ], [], 'x');
    const ws = await readBack(await buildLeadsWorkbook(views));
    expect(ws.getRow(FIRST).getCell(col('Gebiet')).value).toBe('Unklar – bitte prüfen');
    expect(ws.getRow(FIRST + 1).getCell(col('Gebiet')).value).toBe('Wird geprüft');
    expect(['Im Gebiet', 'Randlage', 'Außerhalb']).toContain(ws.getRow(FIRST + 2).getCell(col('Gebiet')).value);
  });
});

describe('buildLeadsWorkbook: work sheets and overview', () => {
  const now = new Date('2026-10-11T13:00:00Z');
  const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
  const hamburg = { enrichment_status: 'done' as const, geo_precision: 'house' as const, geo_lat: 53.56, geo_lon: 10.0 };
  const passau = { enrichment_status: 'done' as const, geo_precision: 'house' as const, geo_lat: 48.57, geo_lon: 13.43 }; // outside (Regensburg ~110 km)
  const rows = [
    makeLeadRow({ id: id(1), last_name: 'Fresh', created_at: ago(2), ...hamburg }),
    makeLeadRow({ id: id(2), last_name: 'Waiting', created_at: ago(30), ...hamburg }),
    makeLeadRow({ id: id(3), last_name: 'Outside', created_at: ago(60), ...passau }),
    makeLeadRow({ id: id(4), last_name: 'Repeat', created_at: ago(1), duplicate_of: id(3), ...passau }),
    makeLeadRow({ id: id(5), last_name: 'Spam', created_at: ago(1), spam_suspected: true, enrichment_status: 'skipped' }),
    makeLeadRow({ id: id(6), last_name: 'Claimed', created_at: ago(40), status: 'in_bearbeitung', assigned_to: 'u2', ...hamburg }),
    makeLeadRow({ id: id(7), last_name: 'Mine', created_at: ago(45), status: 'qualifiziert', assigned_to: 'u1', ...hamburg }),
    makeLeadRow({ id: id(8), last_name: 'WonOld', created_at: ago(300), status: 'gewonnen', assigned_to: 'u1', status_changed_at: ago(100) }),
    makeLeadRow({ id: id(9), last_name: 'LostNew', created_at: ago(200), status: 'verloren', assigned_to: 'u1', status_changed_at: ago(10) }),
  ];
  const views = deriveLeadViews(rows, [{ id: 'u1', display_name: 'Vertrieb A' }, { id: 'u2', display_name: 'B "quoted"' }], 'x');
  const build = () => buildLeadsWorkbook(views, { filters: { ...DEFAULT_FILTERS, showSpam: true, allSubmissions: true }, exportedAt: now, exporter: 'Vertrieb A' });
  const names = (ws: ExcelJS.Worksheet, n: number) => Array.from({ length: n }, (_, i) => ws.getRow(FIRST + i).getCell(colOf(ws, 'Name')).value);

  it('has the five sheets in reading order, each list as an Excel table', async () => {
    const wb = await load(await build());
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Übersicht', 'Offen – anrufen', 'In Bearbeitung', 'Abgeschlossen', 'Alle Daten']);
    expect(wb.getWorksheet('Offen – anrufen')!.getTable('Offen')).toBeDefined();
    expect(wb.getWorksheet('Alle Daten')!.getTable('AlleDaten')).toBeDefined();
  });

  it('"Offen – anrufen": unclaimed open leads in priority order, without repeats or spam, with waiting hours', async () => {
    const ws = (await load(await build())).getWorksheet('Offen – anrufen')!;
    expect(names(ws, 4)).toEqual(['Thomas Waiting', 'Thomas Fresh', 'Thomas Outside', null]);
    expect(ws.getRow(FIRST).getCell(colOf(ws, 'Nr.')).value).toBe(1);
    const wait = ws.getRow(FIRST).getCell(colOf(ws, 'Wartet'));
    expect(wait.value).toBe(30);
    expect(wait.numFmt).toBe('0" Std."');
  });

  it('"In Bearbeitung" groups claimed open leads by person; "Abgeschlossen" lists the latest outcome first', async () => {
    const wb = await load(await build());
    const working = wb.getWorksheet('In Bearbeitung')!;
    expect(working.getRow(FIRST).getCell(1).value).toBe('B "quoted"');
    expect(names(working, 2)).toEqual(['Thomas Claimed', 'Thomas Mine']);
    expect(names(wb.getWorksheet('Abgeschlossen')!, 2)).toEqual(['Thomas LostNew', 'Thomas WonOld']);
  });

  it('"Übersicht": formulas with cached results; criteria come from label cells, never from lead data', async () => {
    const ws = (await load(await build())).getWorksheet('Übersicht')!;
    const byLabel = new Map<string, ExcelJS.Cell>();
    ws.eachRow((row) => { const label = row.getCell(1).value; if (typeof label === 'string') byLabel.set(label.trim(), row.getCell(2)); });
    const result = (label: string) => (byLabel.get(label)!.value as ExcelJS.CellFormulaValue).result;
    expect(result('Offen – noch niemand zuständig')).toBe(3);
    expect(result('davon im Gebiet oder in Randlage')).toBe(2);
    expect(result('davon wartet seit 24 Std. oder länger')).toBe(2);
    expect(result('davon wartet seit 48 Std. oder länger')).toBe(1);
    expect(result('Abgeschlossen')).toBe(2);
    expect(result('Alle exportierten Zeilen')).toBe(9);
    expect(result('B "quoted"')).toBe(1);
    const ownerFormula = (byLabel.get('B "quoted"')!.value as ExcelJS.CellFormulaValue).formula;
    expect(ownerFormula).toMatch(/^COUNTIF\('In Bearbeitung'!\$A\$3:\$A\$4,\$A\d+\)$/);
    expect(ownerFormula).not.toContain('quoted');
    expect(ws.getCell('A2').value).toBe('Stand 11.10.2026 15:00 (Berlin) · exportiert von Vertrieb A');
    expect(ws.getCell('A3').value).toBe('Auswahl: inkl. Spam · alle Einzelanfragen');
  });

  it('an empty export still has every sheet, each saying so', async () => {
    const wb = await load(await buildLeadsWorkbook([], { exportedAt: now }));
    for (const name of ['Offen – anrufen', 'In Bearbeitung', 'Abgeschlossen', 'Alle Daten']) {
      expect(wb.getWorksheet(name)!.getRow(FIRST).getCell(1).value, name).toBe('Keine Anfragen in dieser Auswahl.');
    }
  });
});

describe('describeSelection', () => {
  it('spells the dashboard filters out in German', () => {
    expect(describeSelection()).toBe('Alle Anfragen');
    expect(describeSelection(DEFAULT_FILTERS)).toBe('Alle Anfragen (keine Filter)');
    expect(describeSelection({ ...DEFAULT_FILTERS, statuses: ['neu'], areas: ['inside', 'edge'], channelGroup: 'Paid Social', mine: true, hideTest: true, q: 'Kröger' }))
      .toBe('Status: Neu · Gebiet: Im Gebiet, Randlage · Kanal: Paid Social · nur eigene Anfragen · ohne Testdaten · Suche „Kröger“');
  });
});
