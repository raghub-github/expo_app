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

/** Check if rider has any order not in DELIVERED/CANCELLED (uses orders_food.merchant_self_delivery_rider_id if column exists) */
async function riderHasActiveOrders(db: ReturnType<typeof getDb>, riderId: number): Promise<boolean> {
  const { data, error } = await db
    .from('orders_food')
    .select('id')
    .eq('merchant_self_delivery_rider_id', riderId)
    .in('order_status', ACTIVE_ORDER_STATUSES)
    .limit(1);
  if (error) return false; // column may not exist yet; treat as no active orders
  return (data?.length ?? 0) > 0;
}

/**
 * GET /api/merchant/self-delivery-riders?storeId=GMMC1015
 * Returns riders for the store with has_active_orders flag.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const storeId = req.nextUrl.searchParams.get('storeId')?.trim();
    if (!storeId) return NextResponse.json({ error: 'storeId is required' }, { status: 400 });

    const db = getDb();
    const storeInternalId = await resolveStoreInternalId(db, storeId);
    if (storeInternalId === null) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

    const { data: rows, error } = await db
      .from('merchant_store_self_delivery_riders')
      .select('id, store_id, rider_name, rider_mobile, rider_email, vehicle_number, is_primary, is_active, created_at, updated_at')
      .eq('store_id', storeInternalId)
      .order('is_primary', { ascending: false })
      .order('id', { ascending: true });

    if (error) {
      console.error('[self-delivery-riders GET]', error);
      return NextResponse.json({ error: 'Failed to load riders' }, { status: 500 });
    }

    const riders = await Promise.all(
      (rows || []).map(async (r) => {
        const has_active_orders = await riderHasActiveOrders(db, r.id as number);
        return {
          id: r.id,
          store_id: r.store_id,
          rider_name: r.rider_name,
          rider_mobile: r.rider_mobile,
          rider_email: r.rider_email ?? null,
          vehicle_number: r.vehicle_number ?? null,
          is_primary: !!r.is_primary,
          is_active: r.is_active !== false,
          has_active_orders,
          created_at: r.created_at,
          updated_at: r.updated_at,
        };
      })
    );

    return NextResponse.json({ success: true, riders });
  } catch (e) {
    console.error('[self-delivery-riders GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/merchant/self-delivery-riders
 * Body: { storeId: string, rider_name: string, rider_mobile: string, rider_email?: string, vehicle_number?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const storeId = body?.storeId?.trim();
    const rider_name = body?.rider_name?.trim();
    const rider_mobile = body?.rider_mobile?.trim();
    if (!storeId || !rider_name || !rider_mobile) {
      return NextResponse.json({ error: 'storeId, rider_name, and rider_mobile are required' }, { status: 400 });
    }

    const db = getDb();
    const storeInternalId = await resolveStoreInternalId(db, storeId);
    if (storeInternalId === null) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

    const payload: Record<string, unknown> = {
      store_id: storeInternalId,
      rider_name,
      rider_mobile,
      rider_email: body.rider_email?.trim() || null,
      vehicle_number: body.vehicle_number?.trim() || null,
      is_primary: false,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const { data: inserted, error } = await db
      .from('merchant_store_self_delivery_riders')
      .insert(payload)
      .select('id, store_id, rider_name, rider_mobile, rider_email, vehicle_number, is_primary, is_active, created_at, updated_at')
      .single();

    if (error) {
      console.error('[self-delivery-riders POST]', error);
      return NextResponse.json({ error: error.message || 'Failed to add rider' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      rider: {
        id: inserted.id,
        store_id: inserted.store_id,
        rider_name: inserted.rider_name,
        rider_mobile: inserted.rider_mobile,
        rider_email: inserted.rider_email ?? null,
        vehicle_number: inserted.vehicle_number ?? null,
        is_primary: !!inserted.is_primary,
        is_active: inserted.is_active !== false,
        has_active_orders: false,
        created_at: inserted.created_at,
        updated_at: inserted.updated_at,
      },
    });
  } catch (e) {
    console.error('[self-delivery-riders POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
