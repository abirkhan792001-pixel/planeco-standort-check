import { after, NextResponse } from 'next/server';
import { MAX_BODY_BYTES, parseJsonBody } from '@/lib/leads/body';
import { createLead } from '@/lib/leads/create';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendFallbackMail } from '@/lib/email/fallback';
import { runSideEffects } from '@/lib/leads/side-effects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 });
  }
  // The header can be absent or wrong (chunked bodies): the real size is checked on the text.
  const parsedBody = parseJsonBody(await req.text());
  if (!parsedBody.ok) {
    return NextResponse.json({ error: parsedBody.status === 413 ? 'too_large' : 'bad_json' }, { status: parsedBody.status });
  }
  const body = parsedBody.body;

  const result = await createLead(body, {
    now: new Date(),
    userAgent: req.headers.get('user-agent'),
    getDb: createAdminClient,
    sendFallback: sendFallbackMail,
  });

  switch (result.kind) {
    case 'created':
      if (result.runSideEffects) after(() => runSideEffects(result.id));
      return NextResponse.json({ id: result.id }, { status: 201 });
    case 'replay':
      return NextResponse.json({ id: result.id }, { status: 200 });
    case 'invalid':
      return NextResponse.json({ errors: result.errors }, { status: 422 });
    case 'fallback':
      return NextResponse.json({ fallback: true }, { status: 202 });
    case 'unavailable':
      return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
