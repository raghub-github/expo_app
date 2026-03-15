import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
 * GET /api/food-orders/[id]/otp?store_id=...
 * Returns OTP for display. id = orders_food.id (row id), we resolve order_id from orders_food.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const storeId = req.nextUrl.searchParams.get('store_id');
    if (!storeId) return NextResponse.json({ error: 'store_id required' }, { status: 400 });

    const db = getSupabase();
    const storeInternalId = await resolveStoreId(db, storeId);
    if (!storeInternalId) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

    const foodId = parseInt(id, 10);
    if (isNaN(foodId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const { data: food, error: fe } = await db
      .from('orders_food')
      .select('order_id, merchant_store_id')
      .eq('id', foodId)
      .single();
    if (fe || !food || food.merchant_store_id !== storeInternalId) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const { data: otp, error: oe } = await db
      .from('order_food_otps')
      .select('otp_code, otp_type, verified_at')
      .eq('order_id', food.order_id)
      .single();
    if (oe || !otp) return NextResponse.json({ error: 'OTP not found' }, { status: 404 });

    return NextResponse.json({ otp_code: otp.otp_code, otp_type: otp.otp_type, verified_at: otp.verified_at });
  } catch (err) {
    console.error('[food-orders otp GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
