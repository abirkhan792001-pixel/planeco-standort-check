import { NextResponse } from 'next/server';
import { createLead } from '@/lib/leads/create';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendFallbackMail } from '@/lib/email/fallback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (Number(req.headers.get('content-length') ?? '0') > 16_000) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const result = await createLead(body, {
    now: new Date(),
    userAgent: req.headers.get('user-agent'),
    getDb: createAdminClient,
    sendFallback: sendFallbackMail,
  });

  switch (result.kind) {
    case 'created':
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
