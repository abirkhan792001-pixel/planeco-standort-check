import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { deriveLeadViews, ownHost } from '@/lib/leads/derive';
import { applyFilters, filtersFromSearchParams, sortRows } from '@/lib/dashboard/filters';
import { loadLeadWindow } from '@/lib/dashboard/load';
import { buildLeadsWorkbook } from '@/lib/export/xlsx';
import { berlinDate } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Building a 5 000-row workbook plus the duplicate-root lookups can exceed the platform default. */
export const maxDuration = 60;

/** Export limit (shortcut S11): the newest 5 000 leads plus the roots their duplicates point to. */
const EXPORT_LIMIT = 5000;

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * The export is a plain form POST that replaces the dashboard tab, so a failure must not end in raw JSON. 400 and 500 get a
 * small German page with a way back (static text only: no row data, no error detail). 401 stays JSON: the middleware
 * already redirects a logged-out browser to /login, so only scripted requests see it.
 */
function errorPage(status: 400 | 500) {
  const html = `<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Export fehlgeschlagen</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5">
<h1>Export fehlgeschlagen</h1>
<p>Der Export konnte nicht erstellt werden – bitte zurück zum Dashboard und noch einmal versuchen.</p>
<p><a href="/dashboard">Zurück zum Dashboard</a></p>
</body>
</html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE } });
}

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
    return errorPage(400);
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
    return errorPage(500);
  }
  // Without profiles the export still works; owners then read "Unbekannt" (same as the dashboard).
  if (profiles.error) console.error('export: profiles query failed', { code: profiles.error.code, message: profiles.error.message });

  let body: Buffer;
  try {
    const views = deriveLeadViews(rows, profiles.data ?? [], ownHost());
    const sorted = sortRows(applyFilters(views, f, user.id), f.sort, f.dir);
    body = await buildLeadsWorkbook(sorted);
  } catch (e) {
    console.error('export: building the workbook failed', { message: (e as Error).message });
    return errorPage(500);
  }
  // Berlin calendar day (spec §17 file name), not UTC: after 22:00/23:00 UTC the two differ.
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="standort-check-anfragen-${berlinDate()}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}

/** No GET: it would invite filters (and PII) into URLs. */
export function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405, headers: { ...NO_STORE, Allow: 'POST' } });
}
