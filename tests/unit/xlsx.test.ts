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

  it('writes numbers as numbers and missing values as empty cells', async () => {
    const views = deriveLeadViews([makeLeadRow({ enrichment_status: 'done', geo_precision: 'house', geo_lat: 53.87, geo_lon: 10.69, duplicate_of: null })], [], 'x');
    const ws = await readBack(await buildLeadsWorkbook(views));
    const dist = ws.getRow(2).getCell(col('Entfernung km'));
    expect(typeof dist.value).toBe('number');
    expect(ws.getRow(2).getCell(col('Anfragen (Gruppe)')).value).toBe(1);
    expect(ws.getRow(2).getCell(col('Notiz')).value ?? '').toBe('');
  });
});
