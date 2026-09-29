import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { error } = await createAdminClient().from('leads').select('id', { count: 'exact', head: true });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('health check failed', err);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
