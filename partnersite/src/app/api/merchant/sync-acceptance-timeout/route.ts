import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertStoreAccess } from '@/lib/auth/assert-store-access';
import { fetchBackend } from '@/lib/fetch-backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

// Kept for potential future use; ensures server-only Supabase client is available if this route
// grows to need direct DB queries again. The current path delegates to Fastify.
const _supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
void _supabaseAdmin;

/**
 * POST /api/merchant/sync-acceptance-timeout?store_id=GMMC1001
 * Cancels unaccepted orders past the acceptance window (runs on portal open).
 * Partnersite validates merchant session, then delegates to the Fastify backend
 * via X-Internal-Secret so the acceptance-timeout logic stays server-side.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'method_not_allowed', hint: 'Use POST' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const storeId = new URL(req.url).searchParams.get('store_id');
    const gate = await assertStoreAccess(storeId);
    if (!gate.ok) {
      console.warn('[sync-acceptance-timeout] gate.deny', {
        storeId,
        status: gate.status,
        error: gate.error,
      });
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET?.trim();
    if (!secret) {
      return NextResponse.json(
        { error: 'backend_not_configured', cancelled: 0, store_id: String(storeId).trim() },
        { status: 503 },
      );
    }

    const backendRes = await fetchBackend(
      `/v1/internal/stores/${gate.storeIdNum}/sync-acceptance-timeout`,
      {
        method: 'POST',
        headers: { 'X-Internal-Secret': secret },
        timeoutMs: 30_000,
      },
    );

    if (!backendRes) {
      return NextResponse.json(
        { error: 'backend_unreachable', cancelled: 0, store_id: String(storeId).trim() },
        { status: 503 },
      );
    }

    const body = (await backendRes.json().catch(() => ({}))) as {
      cancelled?: number;
      error?: string;
    };
    const cancelled = typeof body.cancelled === 'number' ? body.cancelled : 0;

    if (backendRes.ok) {
      return NextResponse.json(
        { cancelled, store_id: String(storeId).trim() },
        { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
      );
    }

    const status =
      backendRes.status >= 400 && backendRes.status < 600 ? backendRes.status : 502;
    return NextResponse.json(
      {
        error: body.error ?? 'sync_failed',
        cancelled: 0,
        store_id: String(storeId).trim(),
      },
      { status },
    );
  } catch (e) {
    console.error('[sync-acceptance-timeout]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
