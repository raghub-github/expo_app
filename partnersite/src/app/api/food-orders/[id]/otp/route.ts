import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

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

type OtpRow = { otp_code: string; otp_type: string; verified_at: string | null };

async function readOtpsForCore(
  db: ReturnType<typeof getSupabase>,
  corePk: number,
  foodPickup: string | null,
  foodRto: string | null
) {
  const { data: core } = await db.from('orders_core').select('pickup_otp, rto_otp').eq('id', corePk).maybeSingle();

  const { data: otpRows } = await db
    .from('order_food_otps')
    .select('otp_code, otp_type, verified_at')
    .eq('order_id', corePk);

  const byType = new Map<string, OtpRow>();
  for (const row of (otpRows || []) as OtpRow[]) {
    const t = String(row.otp_type || '').toUpperCase();
    if (t) byType.set(t, row);
  }

  const pickup_otp =
    byType.get('PICKUP')?.otp_code ??
    foodPickup ??
    ((core as { pickup_otp?: string } | null)?.pickup_otp ?? null);
  const rto_otp =
    byType.get('RTO')?.otp_code ??
    foodRto ??
    ((core as { rto_otp?: string } | null)?.rto_otp ?? null);

  return {
    pickup_otp,
    rto_otp,
    byType,
    otps: (otpRows || []) as OtpRow[],
  };
}

/**
 * GET /api/food-orders/[id]/otp?store_id=...&otp_type=PICKUP|RTO (optional)
 * Returns pickup + RTO OTPs; generates via RPC if missing.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const storeId = req.nextUrl.searchParams.get('store_id');
    const otpTypeFilter = req.nextUrl.searchParams.get('otp_type')?.toUpperCase();
    if (!storeId) return NextResponse.json({ error: 'store_id required' }, { status: 400 });

    const db = getSupabase();
    const storeInternalId = await resolveStoreId(db, storeId);
    if (!storeInternalId) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

    const foodId = parseInt(id, 10);
    if (isNaN(foodId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const { data: food, error: fe } = await db
      .from('orders_food')
      .select('order_id, merchant_store_id, pickup_otp, rto_otp')
      .eq('id', foodId)
      .single();
    if (fe || !food || food.merchant_store_id !== storeInternalId) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const corePk = food.order_id as number;

    let resolved = await readOtpsForCore(
      db,
      corePk,
      food.pickup_otp as string | null,
      food.rto_otp as string | null
    );

    if (!resolved.pickup_otp && !resolved.rto_otp) {
      try {
        await db.rpc('generate_unique_order_otps', { p_order_id: corePk });
        const { data: food2 } = await db
          .from('orders_food')
          .select('pickup_otp, rto_otp')
          .eq('id', foodId)
          .single();
        resolved = await readOtpsForCore(
          db,
          corePk,
          (food2?.pickup_otp as string | null) ?? null,
          (food2?.rto_otp as string | null) ?? null
        );
      } catch (genErr) {
        console.warn('[food-orders otp GET] generate_unique_order_otps:', genErr);
      }
    }

    const { pickup_otp, rto_otp, byType, otps } = resolved;

    if (otpTypeFilter === 'PICKUP') {
      return NextResponse.json({
        otp_code: pickup_otp,
        otp_type: 'PICKUP',
        verified_at: byType.get('PICKUP')?.verified_at ?? null,
        pickup_otp,
        rto_otp,
      });
    }
    if (otpTypeFilter === 'RTO') {
      return NextResponse.json({
        otp_code: rto_otp,
        otp_type: 'RTO',
        verified_at: byType.get('RTO')?.verified_at ?? null,
        pickup_otp,
        rto_otp,
      });
    }

    return NextResponse.json({
      otp_code: pickup_otp ?? rto_otp,
      otp_type: pickup_otp ? 'PICKUP' : rto_otp ? 'RTO' : null,
      pickup_otp,
      rto_otp,
      otps,
    });
  } catch (err) {
    console.error('[food-orders otp GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
