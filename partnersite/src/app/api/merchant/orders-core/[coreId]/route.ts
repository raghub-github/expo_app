import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { mapPartnerUiToCoreStatus } from '@/lib/partner-orders-unify';
import {
  actorTypeFromSource,
  recordOrderCancellation,
} from '@/lib/record-order-cancellation';
import {
  buildCancelledByLabel,
  normalizeActionMode,
  normalizeActionSource,
} from '@/lib/merchantOrderFoodActions';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveStoreId(db: ReturnType<typeof getSupabase>, storeIdParam: string): Promise<number | null> {
  const { data, error } = await db.from('merchant_stores').select('id').eq('store_id', storeIdParam).single();
  if (error || !data) return null;
  return data.id as number;
}

/**
 * PATCH /api/merchant/orders-core/:coreId
 * Body: { store_id, status } — food-style UI status (CREATED, ACCEPTED, …) applied to orders_core when no orders_food row exists.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ coreId: string }> }) {
  try {
    const { coreId: coreIdStr } = await params;
    const coreId = parseInt(coreIdStr, 10);
    if (Number.isNaN(coreId)) {
      return NextResponse.json({ error: 'Invalid core id' }, { status: 400 });
    }

    const body = await req.json();
    const storeId = body.store_id as string;
    const newStatusUi = String(body.status || '').toUpperCase();
    const rejectedReason = (body.rejected_reason as string | null) || null;

    if (!storeId || !newStatusUi) {
      return NextResponse.json({ error: 'store_id and status are required' }, { status: 400 });
    }

    const db = getSupabase();
    const storeInternalId = await resolveStoreId(db, storeId);
    if (storeInternalId === null) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const { data: coreRow, error: cErr } = await db
      .from('orders_core')
      .select('id, merchant_store_id, status')
      .eq('id', coreId)
      .single();

    if (cErr || !coreRow) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (Number(coreRow.merchant_store_id) !== storeInternalId) {
      return NextResponse.json({ error: 'Order does not belong to this store' }, { status: 403 });
    }

    const { data: foodRow } = await db.from('orders_food').select('id').eq('order_id', coreId).maybeSingle();
    if (foodRow) {
      return NextResponse.json(
        {
          error: 'This order has a kitchen row — update via /api/food-orders/:id instead',
        },
        { status: 409 }
      );
    }

    const nextCore = mapPartnerUiToCoreStatus(newStatusUi);
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      status: nextCore,
      // Keep partner pipeline consistent: current_status takes precedence in resolvePartnerPipeline.
      // For core-only orders, we treat it as the state-machine status.
      current_status:
        newStatusUi === 'CREATED'
          ? 'PLACED'
          : newStatusUi === 'RTO'
            ? 'FAILED'
            : newStatusUi,
      updated_at: now,
    };

    if (nextCore === 'cancelled' || nextCore === 'failed') {
      updates.cancelled_at = now;
      updates.cancelled_by = 'store';
      updates.cancelled_by_type = 'store';
      if (rejectedReason) {
        updates.cancellation_details = { reason: rejectedReason };
      }
    }

    const { error: uErr } = await db
      .from('orders_core')
      .update(updates)
      .eq('id', coreId)
      .eq('merchant_store_id', storeInternalId);

    if (uErr) {
      console.error('[orders-core PATCH]', uErr);
      return NextResponse.json({ error: uErr.message }, { status: 500 });
    }

    if (newStatusUi === 'CANCELLED' || nextCore === 'cancelled' || nextCore === 'failed') {
      const actionSource = normalizeActionSource(body.action_source);
      const actionMode = normalizeActionMode(body.cancel_mode ?? body.accept_mode);
      const displayReason = (rejectedReason ?? '').trim() || 'Order cancelled';
      const cancelledByLabel = buildCancelledByLabel(
        actionSource,
        actionMode,
        displayReason
      );
      try {
        await recordOrderCancellation(db, {
          orderCorePk: coreId,
          cancelledBy: 'merchant',
          displayReason,
          cancelledByType: actorTypeFromSource(actionSource),
          cancelledByLabel,
          actionSource,
          cancelMode: actionMode,
          refundStatus: 'no_refund',
        });
      } catch (cancelErr) {
        console.warn('[orders-core PATCH] order_cancellation_reasons failed:', cancelErr);
      }
    }

    return NextResponse.json({ ok: true, core_id: coreId, status: nextCore });
  } catch (e) {
    console.error('[orders-core PATCH]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
