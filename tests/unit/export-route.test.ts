import { beforeEach, describe, expect, it, vi } from 'vitest';
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

import { GET, POST, maxDuration } from '@/app/dashboard/export/route';

const post = (fields: Record<string, string> = {}) =>
  new NextRequest('http://localhost/dashboard/export', { method: 'POST', body: new URLSearchParams(fields) });

async function sheet(res: Response) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await res.arrayBuffer()) as ArrayBuffer);
  return wb.getWorksheet('Anfragen')!;
}

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
    expect(await res.json()).toEqual({ error: 'db' });
    err.mockRestore();
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
