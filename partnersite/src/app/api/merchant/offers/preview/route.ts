/**
 * Proxy to backend PricingService for Partner Site offer drawer.
 */
import { NextRequest, NextResponse } from 'next/server';

const BACKEND =
  process.env.GATIMITRA_BACKEND_API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:3000';

async function backendPost(path: string, body: unknown) {
  const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
  if (!secret) {
    return { ok: false as const, status: 503, data: { error: 'backend_secret_not_configured' } };
  }
  const res = await fetch(`${BACKEND}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': secret,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await backendPost('/v1/pricing/preview', body);
    if (!result.ok) {
      return NextResponse.json(result.data, { status: result.status });
    }
    return NextResponse.json(result.data);
  } catch (e) {
    console.error('[merchant/offers/preview]', e);
    return NextResponse.json({ error: 'preview_failed' }, { status: 500 });
  }
}
