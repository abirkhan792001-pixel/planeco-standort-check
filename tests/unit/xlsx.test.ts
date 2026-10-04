import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildLeadsWorkbook, EXPORT_COLUMNS } from '@/lib/export/xlsx';
import { deriveLeadViews } from '@/lib/leads/derive';
import { makeLeadRow } from '../fixtures/lead-row';

async function readBack(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb.getWorksheet('Anfragen')!;
}

const col = (h: string) => EXPORT_COLUMNS.findIndex((c) => c.header === h) + 1;

describe('buildLeadsWorkbook', () => {
  it('keeps phone numbers, umlauts and formula-like text as plain strings', async () => {
    const views = deriveLeadViews([makeLeadRow({ first_name: '=1+1', city: 'Groß Grönau', phone_raw: '+49 40 / 123 456', phone_e164: '+4940123456' })], [], 'x');
    const ws = await readBack(await buildLeadsWorkbook(views));
    const cell = (h: string) => ws.getRow(2).getCell(col(h));
    expect(cell('Vorname').value).toBe('=1+1');
    expect(cell('Vorname').type).toBe(ExcelJS.ValueType.String);
    expect(cell('Telefon (E.164)').value).toBe('+4940123456');
    expect(cell('Ort').value).toBe('Groß Grönau');
    expect(cell('Eingang').value).toBe('01.10.2026 10:00');
  });

  it('has a bold, frozen header row', async () => {
    const ws = await readBack(await buildLeadsWorkbook([]));
    expect(ws.getRow(1).getCell(1).value).toBe('Eingang');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.getRow(1).getCell(1).font?.bold).toBe(true);
  });

  it('exports an empty selection as the header row only', async () => {
    const ws = await readBack(await buildLeadsWorkbook([]));
    expect(ws.rowCount).toBe(1);
    expect(ws.getRow(1).values).toEqual([undefined, ...EXPORT_COLUMNS.map((c) => c.header)]);
  });

  it('puts the phone extension (Durchwahl) right after the E.164 number as text', async () => {
    expect(col('Durchwahl')).toBe(col('Telefon (E.164)') + 1);
    const views = deriveLeadViews([makeLeadRow({ phone_extension: '0123' })], [], 'x');
    const ws = await readBack(await buildLeadsWorkbook(views));
    const cell = ws.getRow(2).getCell(col('Durchwahl'));
    expect(cell.value).toBe('0123');
    expect(cell.type).toBe(ExcelJS.ValueType.String);
  });

  it('writes the same German mail-status and address-hint texts as the dashboard badges', async () => {
    const views = deriveLeadViews([
      makeLeadRow({ id: '00000000-0000-4000-8000-000000000001', email_status: 'sending' }),
      makeLeadRow({ id: '00000000-0000-4000-8000-000000000002', email_status: 'skipped', email_skip_reason: 'no_mx' }),
      makeLeadRow({ id: '00000000-0000-4000-8000-000000000003', email_status: 'done', enrichment_status: 'done', geo_precision: 'street', geo_flags: ['plz_mismatch'], geo_found_postcode: '01069' }),
    ], [], 'x');
    const ws = await readBack(await buildLeadsWorkbook(views));
    expect(ws.getRow(2).getCell(col('Bestätigungsmail')).value).toBe('wird gesendet');
    expect(ws.getRow(3).getCell(col('Bestätigungsmail')).value).toBe('Keine Mail – Domain ungültig');
    expect(ws.getRow(4).getCell(col('Bestätigungsmail')).value).toBe('gesendet');
    expect(ws.getRow(4).getCell(col('Adress-Hinweise')).value).toBe('PLZ passt nicht zur Straße (gefunden: 01069)');
    expect(ws.getRow(4).getCell(col('Adressgenauigkeit')).value).toBe('Straßengenau');
  });

  it('shows a dash instead of a raw code for leads without enrichment (spam)', async () => {
    const views = deriveLeadViews([makeLeadRow({ enrichment_status: 'skipped', spam_suspected: true })], [], 'x');
    const ws = await readBack(await buildLeadsWorkbook(views));
    expect(ws.getRow(2).getCell(col('Adressgenauigkeit')).value).toBe('—');
    expect(ws.getRow(2).getCell(col('Gebiet')).value).toBe('—');
  });

  it('writes numbers as numbers', async () => {
    const views = deriveLeadViews([makeLeadRow({ enrichment_status: 'done', geo_precision: 'house', geo_lat: 53.87, geo_lon: 10.69, duplicate_of: null })], [], 'x');
    const ws = await readBack(await buildLeadsWorkbook(views));
    const dist = ws.getRow(2).getCell(col('Entfernung km'));
    expect(typeof dist.value).toBe('number');
    expect(ws.getRow(2).getCell(col('Anfragen (Gruppe)')).value).toBe(1);
  });

  it('writes missing values as truly blank cells, not as empty strings', async () => {
    const views = deriveLeadViews([makeLeadRow({ sales_note: null, plot_note: null, phone_extension: null, is_test: false, reachability: [], geo_flags: [], duplicate_of: null, disqualify_reason: null })], [], 'x');
    const ws = await readBack(await buildLeadsWorkbook(views));
    for (const h of ['Notiz', 'Angaben zum Grundstück', 'Durchwahl', 'Test', 'Erreichbarkeit', 'Adress-Hinweise', 'Grund', 'Bearbeiter', 'Duplikat von', 'Nächster Hub', 'Entfernung km', 'Breitengrad', 'Längengrad', 'utm_source', 'gclid']) {
      expect(col(h), h).toBeGreaterThan(0);
      const cell = ws.getRow(2).getCell(col(h));
      expect(cell.value, h).toBeNull();
      expect(cell.type, h).toBe(ExcelJS.ValueType.Null);
    }
  });

  it.each([
    ['HYPERLINK formula', '=HYPERLINK("http://x","klick")'],
    ['plus formula', '+SUM(1)'],
    ['at command', '@cmd'],
    ['minus arithmetic', '-2+3'],
  ])('keeps formula-like text in a name as a plain string (F-3: %s)', async (_label, text) => {
    const views = deriveLeadViews([makeLeadRow({ first_name: text, last_name: text, plot_note: text, sales_note: text })], [], 'x');
    const ws = await readBack(await buildLeadsWorkbook(views));
    for (const h of ['Vorname', 'Nachname', 'Angaben zum Grundstück', 'Notiz']) {
      const cell = ws.getRow(2).getCell(col(h));
      expect(cell.type, h).toBe(ExcelJS.ValueType.String);
      expect(cell.value, h).toBe(text);
      expect(cell.formula, h).toBeUndefined();
    }
  });

  it('adds the raw attribution and geo facts of spec §17', async () => {
    const views = deriveLeadViews([makeLeadRow({
      referrer: 'https://www.google.com/', landing_path: '/standort-check?x=1', gbraid: 'gb1', wbraid: 'wb1', msclkid: 'ms1', placement: 'plc', affiliate: 'aff',
      enrichment_status: 'done', geo_precision: 'house', geo_lat: 53.8697, geo_lon: 10.6866,
    })], [], 'x');
    const ws = await readBack(await buildLeadsWorkbook(views));
    const row = ws.getRow(2);
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
      makeLeadRow({ id: '00000000-0000-4000-8000-000000000001', device_type: 'mobile' }),
      makeLeadRow({ id: '00000000-0000-4000-8000-000000000002', device_type: 'tablet' }),
      makeLeadRow({ id: '00000000-0000-4000-8000-000000000003', device_type: 'desktop' }),
      makeLeadRow({ id: '00000000-0000-4000-8000-000000000004', device_type: 'unknown' }),
      makeLeadRow({ id: '00000000-0000-4000-8000-000000000005', device_type: null }),
    ], [], 'x');
    const ws = await readBack(await buildLeadsWorkbook(views));
    expect([2, 3, 4, 5, 6].map((i) => ws.getRow(i).getCell(col('Gerät')).value)).toEqual(['Mobil', 'Tablet', 'Desktop', 'Unbekannt', null]);
  });

  it('uses the badge wording for the area verdict (shared labels)', async () => {
    const views = deriveLeadViews([
      makeLeadRow({ id: '00000000-0000-4000-8000-000000000001', enrichment_status: 'done', geo_precision: 'none' }), // no coordinates -> unclear
      makeLeadRow({ id: '00000000-0000-4000-8000-000000000002' }), // enrichment pending
      makeLeadRow({ id: '00000000-0000-4000-8000-000000000003', enrichment_status: 'done', geo_precision: 'house', geo_lat: 53.8697, geo_lon: 10.6866 }),
    ], [], 'x');
    const ws = await readBack(await buildLeadsWorkbook(views));
    expect(ws.getRow(2).getCell(col('Gebiet')).value).toBe('Unklar – bitte prüfen');
    expect(ws.getRow(3).getCell(col('Gebiet')).value).toBe('Wird geprüft');
    expect(['Im Gebiet', 'Randlage', 'Außerhalb']).toContain(ws.getRow(4).getCell(col('Gebiet')).value);
  });
});
