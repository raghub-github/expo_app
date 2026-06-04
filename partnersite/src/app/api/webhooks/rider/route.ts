import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { finalizePartnerOrderDelivered } from '@/lib/finalize-partner-order-delivered';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Rider status webhook — updates canonical orders_core / orders_food and credits merchant wallet on DELIVERED.
 * Body: { orderId: "GMF100024" | numeric food id, status: "DELIVERED"|..., riderId }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const orderId = body.orderId ?? body.order_id;
    const status = body.status ?? body.event_type;
    const riderId = body.riderId ?? body.rider_id;

    if (!orderId || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const validStatuses = ['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'];
    const normalizedStatus =
      String(status).toUpperCase() === 'COMPLETED' ? 'DELIVERED' : String(status).toUpperCase();
    if (!validStatuses.includes(normalizedStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const db = getSupabase();
    let orderIdText = String(orderId).trim();

    if (/^\d+$/.test(orderIdText)) {
      const foodPk = Number(orderIdText);
      const { data: foodRow } = await db
        .from('orders_food')
        .select('id, order_id')
        .eq('id', foodPk)
        .maybeSingle();
      if (foodRow?.order_id) {
        const { data: coreRow } = await db
          .from('orders_core')
          .select('order_id')
          .eq('id', foodRow.order_id)
          .maybeSingle();
        if (coreRow?.order_id) orderIdText = String(coreRow.order_id);
      }
    }

    const result = await finalizePartnerOrderDelivered(db, {
      orderIdText,
      status: normalizedStatus,
      riderId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? 'update_failed' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      credited: result.credited ?? false,
      message: 'Order updated successfully',
    });
  } catch (error) {
    console.error('[webhooks/rider] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
