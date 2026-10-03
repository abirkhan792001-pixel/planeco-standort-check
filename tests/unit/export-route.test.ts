import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { NextRequest } from 'next/server';
import { makeLeadRow } from '../fixtures/lead-row';

vi.mock('server-only', () => ({}));

const getUser = vi.fn();
const profilesSelect = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, from: () => ({ select: profilesSelect }) }),
}));
const loadLeadWindow = vi.fn();
vi.mock('@/lib/dashboard/load', () => ({ loadLeadWindow: (...a: unknown[]) => loadLeadWindow(...a) }));

import * as xlsx from '@/lib/export/xlsx';
import { GET, POST, maxDuration } from '@/app/dashboard/export/route';

const post = (fields: Record<string, string> = {}) =>
  new NextRequest('http://localhost/dashboard/export', { method: 'POST', body: new URLSearchParams(fields) });

async function sheet(res: Response) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await res.arrayBuffer()) as ArrayBuffer);
  return wb.getWorksheet('Anfragen')!;
}

async function expectErrorPage(res: Response) {
  expect(res.headers.get('content-type')).toContain('text/html');
  expect(res.headers.get('cache-control')).toBe('no-store');
  const html = await res.text();
  expect(html).toContain('<html lang="de">');
  expect(html).toContain('Export fehlgeschlagen');
  expect(html).toContain('<a href="/dashboard">');
  expect(html).not.toContain('boom'); // no internal detail leaks into the page
}

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1' } } });
  profilesSelect.mockReset().mockResolvedValue({ data: [{ id: 'u1', display_name: 'Ada' }], error: null });
  loadLeadWindow.mockReset().mockResolvedValue({ rows: [], truncated: false });
});

describe('POST /dashboard/export', () => {
  it('answers 401 without a user and does not touch the database', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(post());
    expect(res.status).toBe(401);
    expect(loadLeadWindow).not.toHaveBeenCalled();
  });

  it('loads the 5 000-row window and applies the filters from the form body', async () => {
    loadLeadWindow.mockResolvedValue({
      rows: [
        makeLeadRow({ id: '00000000-0000-4000-8000-000000000001', last_name: 'Alt', status: 'neu' }),
        makeLeadRow({ id: '00000000-0000-4000-8000-000000000002', last_name: 'Neu', status: 'gewonnen', assigned_to: 'u1' }),
      ],
      truncated: false,
    });
    const res = await POST(post({ status: 'gewonnen', sort: 'created_at', dir: 'desc' }));
    expect(loadLeadWindow).toHaveBeenCalledWith(expect.anything(), 5000);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="standort-check-anfragen-\d{4}-\d{2}-\d{2}\.xlsx"$/);
    const ws = await sheet(res);
    expect(ws.rowCount).toBe(2); // header + the one "gewonnen" lead
    expect(ws.getRow(2).getCell(3).value).toBe('Neu');
  });

  it('answers 500 (without row data) when the leads query fails', async () => {
    loadLeadWindow.mockRejectedValue({ code: 'XX000', message: 'boom' });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(post());
    expect(res.status).toBe(500);
    await expectErrorPage(res);
    expect(err).toHaveBeenCalledWith('export: leads query failed', { code: 'XX000', message: 'boom' });
    err.mockRestore();
  });

  it('answers 500 with the error page when building the workbook fails', async () => {
    loadLeadWindow.mockResolvedValue({ rows: [makeLeadRow()], truncated: false });
    const build = vi.spyOn(xlsx, 'buildLeadsWorkbook').mockRejectedValue(new Error('zip failed'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(post());
    expect(res.status).toBe(500);
    await expectErrorPage(res);
    build.mockRestore();
    err.mockRestore();
  });

  it('answers 400 with the error page when the body is not form data', async () => {
    const res = await POST(new NextRequest('http://localhost/dashboard/export', { method: 'POST', body: '{"a":1}', headers: { 'content-type': 'application/json' } }));
    expect(res.status).toBe(400);
    await expectErrorPage(res);
    expect(loadLeadWindow).not.toHaveBeenCalled();
  });

  it('keeps the 401 as JSON', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(post());
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('names the file after the Berlin calendar day, not the UTC day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-03T23:30:00Z')); // 01:30 on 4 October in Berlin
      const res = await POST(post());
      expect(res.headers.get('content-disposition')).toBe('attachment; filename="standort-check-anfragen-2026-10-04.xlsx"');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps working when the profiles query fails (owners fall back)', async () => {
    profilesSelect.mockResolvedValue({ data: null, error: { code: 'x', message: 'y' } });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(post());
    expect(res.status).toBe(200);
    err.mockRestore();
  });

  it('is not available as GET and allows 60 seconds', async () => {
    expect(GET().status).toBe(405);
    expect(maxDuration).toBe(60);
  });
});
