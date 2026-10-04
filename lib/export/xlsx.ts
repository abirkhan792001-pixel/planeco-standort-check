import ExcelJS from 'exceljs';
import type { LeadView } from '@/lib/leads/derive';
import { formatBerlin } from '@/lib/format';
import {
  ADDRESS_TEXT, AREA_TEXT, DEVICE_LABELS, geoFlagTexts, mailStatusLabel, PROJECT_TYPE_LABELS, REASON_LABELS, STATE_LABELS, STATUS_LABELS,
} from '@/lib/labels';

/** `null` (or an empty string) leaves the cell truly blank, so Excel's filters and COUNTBLANK treat it as missing. */
type Column = { header: string; width: number; value: (r: LeadView) => string | number | null };

export const EXPORT_COLUMNS: Column[] = [
  { header: 'Eingang', width: 17, value: (r) => formatBerlin(r.created_at) },
  { header: 'Vorname', width: 14, value: (r) => r.first_name },
  { header: 'Nachname', width: 16, value: (r) => r.last_name },
  { header: 'Telefon', width: 18, value: (r) => r.phone_raw },
  { header: 'Telefon (E.164)', width: 16, value: (r) => r.phone_e164 },
  { header: 'Durchwahl', width: 11, value: (r) => r.phone_extension },
  { header: 'E-Mail', width: 26, value: (r) => r.email },
  { header: 'Straße', width: 20, value: (r) => r.street },
  { header: 'Nr.', width: 6, value: (r) => r.house_number },
  { header: 'PLZ', width: 7, value: (r) => r.postal_code },
  { header: 'Ort', width: 16, value: (r) => r.city },
  { header: 'Angaben zum Grundstück', width: 30, value: (r) => r.plot_note },
  { header: 'Vorhaben', width: 11, value: (r) => (r.project_type ? PROJECT_TYPE_LABELS[r.project_type] : null) },
  { header: 'Erreichbarkeit', width: 16, value: (r) => r.reachability.join(', ') },
  { header: 'Gebiet', width: 13, value: (r) => AREA_TEXT[r.area.verdict] },
  { header: 'Nächster Hub', width: 13, value: (r) => r.area.hub ?? null },
  { header: 'Entfernung km', width: 8, value: (r) => r.area.distanceKm ?? null },
  { header: 'Adressgenauigkeit', width: 13, value: (r) => ADDRESS_TEXT[r.addressQuality] },
  { header: 'Adress-Hinweise', width: 28, value: (r) => geoFlagTexts(r).join(', ') },
  { header: 'Gemeinde', width: 16, value: (r) => r.geo_municipality },
  { header: 'Kreis', width: 18, value: (r) => r.geo_district },
  { header: 'Bundesland', width: 16, value: (r) => (r.geo_state_code ? STATE_LABELS[r.geo_state_code] ?? r.geo_state_code : null) },
  { header: 'Breitengrad', width: 11, value: (r) => r.geo_lat },
  { header: 'Längengrad', width: 11, value: (r) => r.geo_lon },
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
  { header: 'Status', width: 16, value: (r) => STATUS_LABELS[r.status] },
  { header: 'Grund', width: 16, value: (r) => (r.disqualify_reason ? REASON_LABELS[r.disqualify_reason] : null) },
  { header: 'Bearbeiter', width: 12, value: (r) => r.ownerName },
  { header: 'Anfragen (Gruppe)', width: 9, value: (r) => r.groupSize },
  { header: 'Duplikat von', width: 12, value: (r) => r.duplicate_of },
  { header: 'Notiz', width: 30, value: (r) => r.sales_note },
  { header: 'Bestätigungsmail', width: 24, value: (r) => mailStatusLabel(r).text },
  { header: 'Test', width: 6, value: (r) => (r.is_test ? 'ja' : null) },
  { header: 'ID', width: 36, value: (r) => r.id },
];

export async function buildLeadsWorkbook(rows: LeadView[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Anfragen', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  ws.getRow(1).font = { bold: true };
  // Values are passed as JS strings/numbers → exceljs writes plain cells, never formulas. Missing values are `null`, not ''.
  for (const r of rows) ws.addRow(EXPORT_COLUMNS.map((c) => { const v = c.value(r); return v === '' ? null : v; }));
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
