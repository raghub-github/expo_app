/**
 * Proxy to backend conflict detection for Partner Site offer drawer.
 */
import { NextRequest, NextResponse } from 'next/server';

const BACKEND =
  process.env.GATIMITRA_BACKEND_API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:3000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
    if (!secret) {
      return NextResponse.json({ error: 'backend_secret_not_configured' }, { status: 503 });
    }
    const res = await fetch(`${BACKEND}/v1/pricing/conflicts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': secret,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error('[merchant/offers/conflicts]', e);
    return NextResponse.json({ error: 'conflict_check_failed' }, { status: 500 });
  }
}
