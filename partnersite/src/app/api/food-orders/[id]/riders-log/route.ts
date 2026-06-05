import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildRiderSelfieUrlMap, resolveRiderSelfieFromStored } from '@/lib/rider-selfie-url';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface RiderLogEntry {
  rider_id: number;
  rider_name: string | null;
  rider_mobile: string | null;
  selfie_url: string | null;
  assignment_status: string;
  assignment_sequence?: number | null;
  is_active?: boolean | null;
  assigned_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  reached_merchant_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  unassigned_at?: string | null;
}

async function resolveCoreFromFoodOrderId(
  db: ReturnType<typeof getSupabase>,
  foodOrderId: number
): Promise<{ coreId: number; orderIdText: string | null } | null> {
  const { data: foodOrder } = await db
    .from('orders_food')
    .select('order_id, core_order_id')
    .eq('id', foodOrderId)
    .maybeSingle();

  if (!foodOrder) return null;

  const coreId =
    foodOrder.order_id != null && Number.isFinite(Number(foodOrder.order_id))
      ? Number(foodOrder.order_id)
      : null;

  if (coreId != null) {
    const { data: core } = await db
      .from('orders_core')
      .select('order_id')
      .eq('id', coreId)
      .maybeSingle();
    return { coreId, orderIdText: (core?.order_id as string | null) ?? null };
  }

  const textId = String(foodOrder.core_order_id ?? '').trim();
  if (!textId) return null;

  const { data: core } = await db
    .from('orders_core')
    .select('id, order_id')
    .eq('order_id', textId)
    .maybeSingle();

  if (!core?.id) return null;
  return { coreId: Number(core.id), orderIdText: (core.order_id as string | null) ?? textId };
}

/**
 * GET /api/food-orders/[id]/riders-log
 * All rider assignments for an order (Past riders panel).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const foodOrderId = parseInt(id, 10);
    if (Number.isNaN(foodOrderId)) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
    }

    const db = getSupabase();
    const resolved = await resolveCoreFromFoodOrderId(db, foodOrderId);
    if (!resolved) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const { coreId, orderIdText } = resolved;

    let assignments: Array<Record<string, unknown>> = [];

    const { data: byCore, error: coreErr } = await db
      .from('order_rider_assignments')
      .select(
        'id, rider_id, rider_name, rider_mobile, assignment_status, assignment_sequence, is_active, assigned_at, accepted_at, rejected_at, reached_merchant_at, picked_up_at, delivered_at, cancelled_at, unassigned_at'
      )
      .eq('order_core_id', coreId)
      .order('assignment_sequence', { ascending: false })
      .order('created_at', { ascending: false });

    if (!coreErr && byCore?.length) {
      assignments = byCore as Array<Record<string, unknown>>;
    } else {
      const { data: legacy } = await db
        .from('order_rider_assignments')
        .select(
          'id, rider_id, rider_name, rider_mobile, assignment_status, assignment_sequence, is_active, assigned_at, accepted_at, rejected_at, reached_merchant_at, picked_up_at, delivered_at, cancelled_at, unassigned_at'
        )
        .eq('order_id', coreId)
        .order('created_at', { ascending: false });
      assignments = (legacy ?? []) as Array<Record<string, unknown>>;
    }

    if (!assignments.length && orderIdText) {
      const { data: deliveryRows } = await db
        .from('delivery_assignments')
        .select('rider_id, assignment_status, assigned_at, accepted_at, picked_up_at, delivered_at')
        .eq('order_id', orderIdText);

      if (deliveryRows?.length) {
        assignments = deliveryRows.map((a) => ({
          rider_id: a.rider_id,
          rider_name: null,
          rider_mobile: null,
          assignment_status: String(a.assignment_status ?? 'accepted').toLowerCase(),
          assignment_sequence: 1,
          is_active: true,
          assigned_at: a.assigned_at,
          accepted_at: a.accepted_at,
          rejected_at: null,
          reached_merchant_at: null,
          picked_up_at: a.picked_up_at,
          delivered_at: a.delivered_at,
          cancelled_at: null,
          unassigned_at: null,
        }));
      }
    }

    if (!assignments.length) {
      return NextResponse.json({
        riders: [] as RiderLogEntry[],
        summary: { total_assignments: 0, distinct_riders: 0 },
      });
    }

    const riderIds = [...new Set(assignments.map((a) => Number(a.rider_id)).filter(Boolean))];
    const riderSelfieById =
      riderIds.length > 0 ? await buildRiderSelfieUrlMap(db, riderIds) : new Map<number, string | null>();
    const { data: riders } = await db
      .from('riders')
      .select('id, name, mobile, selfie_url')
      .in('id', riderIds);

    const riderMap = new Map(
      (riders || []).map(
        (r: { id: number; name: string | null; mobile: string | null; selfie_url: string | null }) => [
          r.id,
          r,
        ]
      )
    );

    const ridersLog: RiderLogEntry[] = assignments.map((a) => {
      const riderId = Number(a.rider_id);
      const r = riderMap.get(riderId);
      return {
        rider_id: riderId,
        rider_name: (a.rider_name as string | null) ?? r?.name ?? null,
        rider_mobile: (a.rider_mobile as string | null) ?? r?.mobile ?? null,
        selfie_url:
          riderSelfieById.get(riderId) ??
          resolveRiderSelfieFromStored(r?.selfie_url ?? null),
        assignment_status: String(a.assignment_status ?? 'pending'),
        assignment_sequence: (a.assignment_sequence as number | null) ?? null,
        is_active: (a.is_active as boolean | null) ?? null,
        assigned_at: (a.assigned_at as string | null) ?? null,
        accepted_at: (a.accepted_at as string | null) ?? null,
        rejected_at: (a.rejected_at as string | null) ?? null,
        reached_merchant_at: (a.reached_merchant_at as string | null) ?? null,
        picked_up_at: (a.picked_up_at as string | null) ?? null,
        delivered_at: (a.delivered_at as string | null) ?? null,
        cancelled_at: (a.cancelled_at as string | null) ?? null,
        unassigned_at: (a.unassigned_at as string | null) ?? null,
      };
    });

    return NextResponse.json({
      riders: ridersLog,
      summary: {
        total_assignments: ridersLog.length,
        distinct_riders: new Set(ridersLog.map((r) => r.rider_id)).size,
      },
    });
  } catch (err) {
    console.error('[riders-log] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
