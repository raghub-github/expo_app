import { NextResponse } from 'next/server';
import { getRiderSelfieViewUrl } from '@/lib/rider-selfie-url';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ensureMerchantStoreDashboardAccess } from '@/lib/merchant-food-orders/store-access';
import { resolveMerchantFoodOrder } from '@/lib/merchant-food-orders/resolve-order-food-row';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; orderId: string }> }
) {
  try {
    const { id, orderId: orderIdStr } = await params;
    const storeId = parseInt(id, 10);
    const orderIdParam = parseInt(orderIdStr, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(orderIdParam)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const access = await ensureMerchantStoreDashboardAccess(storeId);
    if ('error' in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    if (!supabaseAdmin) return NextResponse.json({ rider: null, location: null });

    const db = supabaseAdmin;
    const resolved = await resolveMerchantFoodOrder(db, access.store.id, orderIdParam);
    if (!resolved) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const coreOrderId = resolved.coreOrderId;

    const { data: foodOrder } = await db
      .from('orders_food')
      .select('order_id, merchant_store_id, rider_id, rider_name, rider_phone')
      .eq('order_id', coreOrderId)
      .eq('merchant_store_id', access.store.id)
      .maybeSingle();

    if (!foodOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const { data: tracking } = await db
      .from('order_rider_tracking')
      .select('latitude, longitude, heading_degrees, created_at')
      .eq('order_id', coreOrderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let riderName = foodOrder.rider_name as string | null;
    let riderMobile = foodOrder.rider_phone as string | null;
    let selfieUrl: string | null = null;

    const riderId = foodOrder.rider_id as number | null;
    if (riderId) {
      const { data: rider } = await db
        .from('riders')
        .select('name, mobile, selfie_url')
        .eq('id', riderId)
        .maybeSingle();
      if (rider) {
        riderName = riderName ?? (rider.name as string | null);
        riderMobile = riderMobile ?? (rider.mobile as string | null);
      }
      selfieUrl = await getRiderSelfieViewUrl(riderId);
    }

    const { data: assignment } = await db
      .from('order_rider_assignments')
      .select('rider_name, rider_mobile, assignment_status')
      .eq('order_id', coreOrderId)
      .order('assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (assignment) {
      riderName = riderName ?? (assignment.rider_name as string | null);
      riderMobile = riderMobile ?? (assignment.rider_mobile as string | null);
    }

    return NextResponse.json({
      rider: {
        name: riderName,
        mobile: riderMobile,
        selfie_url: selfieUrl,
        assignment_status: assignment?.assignment_status ?? null,
      },
      location: tracking
        ? {
            latitude: Number(tracking.latitude),
            longitude: Number(tracking.longitude),
            heading_degrees: tracking.heading_degrees,
            updated_at: tracking.created_at,
          }
        : null,
    });
  } catch (e) {
    console.error('[GET rider-tracking]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
