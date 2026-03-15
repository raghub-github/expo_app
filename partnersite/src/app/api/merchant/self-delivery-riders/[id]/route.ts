import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveStoreInternalId(db: ReturnType<typeof getDb>, storeId: string): Promise<number | null> {
  const { data, error } = await db
    .from('merchant_stores')
    .select('id')
    .eq('store_id', storeId)
    .single();
  if (error || !data) return null;
  return data.id as number;
}

const ACTIVE_ORDER_STATUSES = ['CREATED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'RTO'];

async function riderHasActiveOrders(db: ReturnType<typeof getDb>, riderId: number): Promise<boolean> {
  const { data, error } = await db
    .from('orders_food')
    .select('id')
    .eq('merchant_self_delivery_rider_id', riderId)
    .in('order_status', ACTIVE_ORDER_STATUSES)
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/**
 * PATCH /api/merchant/self-delivery-riders/[id]
 * Body: { storeId: string, rider_name?: string, rider_mobile?: string, rider_email?: string, vehicle_number?: string }
 * Edit disabled if rider has active orders.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: riderIdParam } = await params;
    const riderId = parseInt(riderIdParam, 10);
    if (Number.isNaN(riderId)) return NextResponse.json({ error: 'Invalid rider id' }, { status: 400 });

    const body = await req.json();
    const storeId = body?.storeId?.trim();
    if (!storeId) return NextResponse.json({ error: 'storeId is required' }, { status: 400 });

    const db = getDb();
    const storeInternalId = await resolveStoreInternalId(db, storeId);
    if (storeInternalId === null) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

    const { data: existing } = await db
      .from('merchant_store_self_delivery_riders')
      .select('id, store_id')
      .eq('id', riderId)
      .eq('store_id', storeInternalId)
      .single();
    if (!existing) return NextResponse.json({ error: 'Rider not found' }, { status: 404 });

    const hasActive = await riderHasActiveOrders(db, riderId);
    if (hasActive) {
      return NextResponse.json(
        { error: 'Cannot edit rider while they have an active order', code: 'RIDER_HAS_ACTIVE_ORDER' },
        { status: 403 }
      );
    }

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.rider_name !== undefined) payload.rider_name = String(body.rider_name).trim();
    if (body.rider_mobile !== undefined) payload.rider_mobile = String(body.rider_mobile).trim();
    if (body.rider_email !== undefined) payload.rider_email = body.rider_email?.trim() || null;
    if (body.vehicle_number !== undefined) payload.vehicle_number = body.vehicle_number?.trim() || null;
    if (body.is_primary !== undefined) payload.is_primary = !!body.is_primary;
    if (body.is_active !== undefined) payload.is_active = !!body.is_active;

    const { data: updated, error } = await db
      .from('merchant_store_self_delivery_riders')
      .update(payload)
      .eq('id', riderId)
      .eq('store_id', storeInternalId)
      .select('id, store_id, rider_name, rider_mobile, rider_email, vehicle_number, is_primary, is_active, created_at, updated_at')
      .single();

    if (error) {
      console.error('[self-delivery-riders PATCH]', error);
      return NextResponse.json({ error: error.message || 'Failed to update rider' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      rider: {
        id: updated.id,
        store_id: updated.store_id,
        rider_name: updated.rider_name,
        rider_mobile: updated.rider_mobile,
        rider_email: updated.rider_email ?? null,
        vehicle_number: updated.vehicle_number ?? null,
        is_primary: !!updated.is_primary,
        is_active: updated.is_active !== false,
        has_active_orders: false,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
      },
    });
  } catch (e) {
    console.error('[self-delivery-riders PATCH]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/merchant/self-delivery-riders/[id]?storeId=GMMC1015
 * Delete disabled if rider has active orders.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: riderIdParam } = await params;
    const riderId = parseInt(riderIdParam, 10);
    if (Number.isNaN(riderId)) return NextResponse.json({ error: 'Invalid rider id' }, { status: 400 });

    const storeId = req.nextUrl.searchParams.get('storeId')?.trim();
    if (!storeId) return NextResponse.json({ error: 'storeId is required' }, { status: 400 });

    const db = getDb();
    const storeInternalId = await resolveStoreInternalId(db, storeId);
    if (storeInternalId === null) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

    const { data: existing } = await db
      .from('merchant_store_self_delivery_riders')
      .select('id')
      .eq('id', riderId)
      .eq('store_id', storeInternalId)
      .single();
    if (!existing) return NextResponse.json({ error: 'Rider not found' }, { status: 404 });

    const hasActive = await riderHasActiveOrders(db, riderId);
    if (hasActive) {
      return NextResponse.json(
        { error: 'Cannot delete rider while they have an active order', code: 'RIDER_HAS_ACTIVE_ORDER' },
        { status: 403 }
      );
    }

    const { error } = await db
      .from('merchant_store_self_delivery_riders')
      .delete()
      .eq('id', riderId)
      .eq('store_id', storeInternalId);

    if (error) {
      console.error('[self-delivery-riders DELETE]', error);
      return NextResponse.json({ error: error.message || 'Failed to delete rider' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[self-delivery-riders DELETE]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
