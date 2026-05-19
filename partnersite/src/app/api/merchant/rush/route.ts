import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertStoreAccess } from '@/lib/auth/assert-store-access';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/merchant/rush?store_id=GMMC…
 */
export async function GET(req: NextRequest) {
  try {
    const storeId = new URL(req.url).searchParams.get('store_id');
    const gate = await assertStoreAccess(storeId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const db = getDb();
    const now = new Date();
    const { data: rows, error } = await db
      .from('merchant_store_rush_windows')
      .select('id, duration_minutes, started_at, ends_at, is_active, marked_from')
      .eq('store_id', gate.storeIdNum)
      .eq('is_active', true)
      .gt('ends_at', now.toISOString())
      .order('started_at', { ascending: false })
      .limit(1);
    if (error) {
      console.error('[merchant/rush GET]', error);
      return NextResponse.json({ error: 'Failed to load rush status' }, { status: 500 });
    }
    const row = rows?.[0];
    if (!row) {
      return NextResponse.json({
        store_id: gate.storeIdNum,
        is_active: false,
        duration_minutes: null,
        started_at: null,
        ends_at: null,
        remaining_minutes: 0,
      });
    }
    const endsAtMs = new Date(String(row.ends_at)).getTime();
    const remainingMinutes = Math.max(0, Math.floor((endsAtMs - now.getTime()) / 60000));
    return NextResponse.json({
      store_id: gate.storeIdNum,
      is_active: true,
      duration_minutes: Number(row.duration_minutes),
      started_at: new Date(String(row.started_at)).toISOString(),
      ends_at: new Date(String(row.ends_at)).toISOString(),
      remaining_minutes: remainingMinutes,
      marked_from: row.marked_from != null ? String(row.marked_from) : null,
    });
  } catch (e) {
    console.error('[merchant/rush GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/merchant/rush — body: { store_id, duration_minutes }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const storeIdParam = typeof body.store_id === 'string' ? body.store_id.trim() : '';
    const gate = await assertStoreAccess(storeIdParam || null);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const durationRaw = body.duration_minutes;
    const duration = typeof durationRaw === 'number' ? Math.floor(durationRaw) : NaN;
    if (!Number.isInteger(duration) || duration <= 0 || duration > 240) {
      return NextResponse.json(
        { error: 'invalid_duration', message: 'duration_minutes must be between 1 and 240.' },
        { status: 400 }
      );
    }
    const db = getDb();
    const now = new Date();
    const endsAt = new Date(now.getTime() + duration * 60000);

    const { data: existing } = await db
      .from('merchant_store_rush_windows')
      .select('id')
      .eq('store_id', gate.storeIdNum)
      .eq('is_active', true)
      .order('started_at', { ascending: false })
      .limit(1);
    if (existing?.[0]?.id) {
      await db
        .from('merchant_store_rush_windows')
        .update({ is_active: false })
        .eq('id', existing[0].id);
    }

    const { error: insErr } = await db.from('merchant_store_rush_windows').insert({
      store_id: gate.storeIdNum,
      duration_minutes: duration,
      started_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
      is_active: true,
      created_by: null,
      marked_from: 'partnersite',
    });
    if (insErr) {
      console.error('[merchant/rush POST]', insErr);
      return NextResponse.json({ error: 'Failed to start rush' }, { status: 500 });
    }

    const remainingMinutes = Math.max(0, Math.floor((endsAt.getTime() - now.getTime()) / 60000));
    return NextResponse.json({
      ok: true,
      store_id: gate.storeIdNum,
      is_active: true,
      duration_minutes: duration,
      started_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
      remaining_minutes: remainingMinutes,
    });
  } catch (e) {
    console.error('[merchant/rush POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/merchant/rush — body: { store_id, is_active: false }
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const storeIdParam = typeof body.store_id === 'string' ? body.store_id.trim() : '';
    const gate = await assertStoreAccess(storeIdParam || null);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    if (body.is_active !== false) {
      return NextResponse.json({ error: 'Only is_active=false is supported.' }, { status: 400 });
    }
    const db = getDb();
    const { data: rows } = await db
      .from('merchant_store_rush_windows')
      .select('id')
      .eq('store_id', gate.storeIdNum)
      .eq('is_active', true)
      .order('started_at', { ascending: false })
      .limit(1);
    const row = rows?.[0];
    if (row?.id) {
      const now = new Date();
      await db
        .from('merchant_store_rush_windows')
        .update({ is_active: false, ends_at: now.toISOString() })
        .eq('id', row.id);
    }
    return NextResponse.json({
      ok: true,
      store_id: gate.storeIdNum,
      is_active: false,
      duration_minutes: null,
      started_at: null,
      ends_at: null,
      remaining_minutes: 0,
    });
  } catch (e) {
    console.error('[merchant/rush PATCH]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
