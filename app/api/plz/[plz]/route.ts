import { NextResponse } from 'next/server';
import { lookupPostalCode, toLocalitySummary } from '@/lib/enrichment/openplz';
import { errInfo } from '@/lib/log';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ plz: string }> }) {
  const { plz } = await params;
  if (!/^\d{5}$/.test(plz)) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  try {
    const list = (await lookupPostalCode(plz)).map(toLocalitySummary);
    return NextResponse.json(list, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } });
  } catch (err) {
    console.error('plz lookup failed', errInfo(err));
    return NextResponse.json({ error: 'upstream' }, { status: 502 });
  }
}
