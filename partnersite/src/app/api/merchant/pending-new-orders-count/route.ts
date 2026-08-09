/**
 * GET /api/merchant/pending-new-orders-count?store_id=GMMC1001
 * Count of orders still awaiting merchant acceptance (partner UI CREATED pipeline).
 * Excludes orders past the acceptance window (those should be auto-cancelled).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertStoreAccess } from '@/lib/auth/assert-store-access';
import { isNetworkOrTransientError } from '@/lib/auth/session-errors';
import { resolvePartnerPipeline } from '@/lib/partner-orders-unify';
import {
  isWithinAcceptanceDeadline,
  loadAcceptanceWindowMinutes,
} from '@/lib/order-acceptance-timeout-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getDb() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase env not configured');
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(req: NextRequest) {
  try {
    const storeId = new URL(req.url).searchParams.get('store_id');
    const gate = await assertStoreAccess(storeId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const db = getDb();
    const windowMins = await loadAcceptanceWindowMinutes(db, gate.storeIdNum);

    const { data: rows, error } = await db
      .from('orders_core')
      .select('id, status, current_status, created_at')
      .eq('merchant_store_id', gate.storeIdNum)
      .eq('status', 'assigned')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[pending-new-orders-count]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const coreIds = (rows ?? []).map((o) => Number((o as { id?: number }).id)).filter((id) => id > 0);
    const foodByCore = new Map<
      number,
      {
        order_status?: string | null;
        created_at?: string | null;
        merchant_acceptance_deadline_at?: string | null;
        merchant_acceptance_window_seconds?: number | null;
      }
    >();

    if (coreIds.length > 0) {
      const { data: foodRows } = await db
        .from('orders_food')
        .select(
          'order_id, order_status, created_at, merchant_acceptance_deadline_at, merchant_acceptance_window_seconds'
        )
        .eq('merchant_store_id', gate.storeIdNum)
        .in('order_id', coreIds);
      for (const f of foodRows ?? []) {
        const coreId = Number((f as { order_id?: number }).order_id);
        if (coreId > 0) {
          foodByCore.set(
            coreId,
            f as {
              order_status?: string | null;
              created_at?: string | null;
              merchant_acceptance_deadline_at?: string | null;
              merchant_acceptance_window_seconds?: number | null;
            }
          );
        }
      }
    }

    let count = 0;
    const nowMs = Date.now();
    for (const o of rows ?? []) {
      const row = o as {
        id?: number;
        status?: string;
        current_status?: string | null;
        created_at?: string | null;
      };
      const coreId = Number(row.id ?? 0);
      const food = coreId > 0 ? foodByCore.get(coreId) : undefined;
      const pipeline = resolvePartnerPipeline(
        food?.order_status ?? null,
        row.status ?? 'assigned',
        row.current_status ?? null
      );
      if (pipeline !== 'CREATED') continue;

      if (
        !isWithinAcceptanceDeadline(
          {
            createdAtIso: food?.created_at ?? row.created_at ?? '',
            merchantAcceptanceDeadlineAt: food?.merchant_acceptance_deadline_at,
            merchantAcceptanceWindowSeconds: food?.merchant_acceptance_window_seconds,
          },
          windowMins,
          nowMs
        )
      ) {
        continue;
      }
      count += 1;
    }

    return NextResponse.json(
      { count, store_id: String(storeId).trim() },
      {
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
        },
      }
    );
  } catch (e) {
    if (isNetworkOrTransientError(e)) {
      return NextResponse.json(
        { count: 0, store_id: null, error: 'Auth service unavailable' },
        { status: 503, headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
      );
    }
    console.error('[pending-new-orders-count]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
