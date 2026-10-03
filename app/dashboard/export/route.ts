import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { deriveLeadViews, ownHost } from '@/lib/leads/derive';
import { applyFilters, filtersFromSearchParams, sortRows } from '@/lib/dashboard/filters';
import { loadLeadWindow } from '@/lib/dashboard/load';
import { buildLeadsWorkbook } from '@/lib/export/xlsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Building a 5 000-row workbook plus the duplicate-root lookups can exceed the platform default. */
export const maxDuration = 60;

/** Export limit (shortcut S11): the newest 5 000 leads plus the roots their duplicates point to. */
const EXPORT_LIMIT = 5000;

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * POST only: the dashboard's Export form sends the active filters as hidden fields, so neither filters nor search text
 * (names, phone numbers) ever appear in a URL. The middleware skips requests that carry a client-controlled `next-action`
 * header, so this handler is the real auth guard and checks the session itself.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: NO_STORE });
  }
  const params = new URLSearchParams();
  for (const [k, v] of form.entries()) if (typeof v === 'string') params.append(k, v);
  const f = filtersFromSearchParams(params);

  let rows;
  let profiles;
  try {
    const [leads, p] = await Promise.all([loadLeadWindow(supabase, EXPORT_LIMIT), supabase.from('profiles').select('id,display_name')]);
    rows = leads.rows;
    profiles = p;
  } catch (e) {
    // Log code/message only, never row data.
    const err = e as { code?: string; message?: string };
    console.error('export: leads query failed', { code: err.code, message: err.message });
    return NextResponse.json({ error: 'db' }, { status: 500, headers: NO_STORE });
  }
  // Without profiles the export still works; owners then read "Unbekannt" (same as the dashboard).
  if (profiles.error) console.error('export: profiles query failed', { code: profiles.error.code, message: profiles.error.message });

  const views = deriveLeadViews(rows, profiles.data ?? [], ownHost());
  const sorted = sortRows(applyFilters(views, f, user.id), f.sort, f.dir);
  const body = await buildLeadsWorkbook(sorted);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="standort-check-anfragen-${date}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}

/** No GET: it would invite filters (and PII) into URLs. */
export function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405, headers: { ...NO_STORE, Allow: 'POST' } });
}
