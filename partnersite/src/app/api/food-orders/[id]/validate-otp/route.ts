import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

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
 * POST /api/food-orders/[id]/validate-otp
 * Body: { store_id, otp }
 * Validates OTP; prevents reuse; rate limits failures.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const storeId = body.store_id;
    const inputOtp = String(body.otp || '').trim();
    if (!storeId || !inputOtp) {
      return NextResponse.json({ error: 'store_id and otp required' }, { status: 400 });
    }

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

    const { data: otpRow, error: oe } = await db
      .from('order_food_otps')
      .select('id, otp_code, otp_type, verified_at, attempt_count, locked_until')
      .eq('order_id', food.order_id)
      .single();
    if (oe || !otpRow) return NextResponse.json({ error: 'OTP not found' }, { status: 404 });

    const now = new Date();
    if (otpRow.verified_at) {
      await db.from('order_food_otp_audit').insert({ order_id: food.order_id, action: 'VALIDATE_FAIL', otp_type: otpRow.otp_type, metadata: { reason: 'already_verified' } });
      return NextResponse.json({ valid: false, error: 'OTP already used' }, { status: 400 });
    }
    if (otpRow.locked_until && new Date(otpRow.locked_until) > now) {
      return NextResponse.json({ valid: false, error: 'Too many attempts. Try again later.' }, { status: 429 });
    }

    const match = otpRow.otp_code === inputOtp;
    if (match) {
      await db.from('order_food_otps').update({ verified_at: now.toISOString(), verified_by: 'merchant', attempt_count: 0, locked_until: null, updated_at: now.toISOString() }).eq('id', otpRow.id);
      await db.from('order_food_otp_audit').insert({ order_id: food.order_id, action: 'VALIDATE_SUCCESS', otp_type: otpRow.otp_type });
      return NextResponse.json({ valid: true });
    }

    const newAttempts = (otpRow.attempt_count || 0) + 1;
    const lockUntil = newAttempts >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCK_MINUTES * 60 * 1000) : null;
    await db.from('order_food_otps').update({ attempt_count: newAttempts, locked_until: lockUntil?.toISOString() ?? null, updated_at: now.toISOString() }).eq('id', otpRow.id);
    await db.from('order_food_otp_audit').insert({ order_id: food.order_id, action: 'VALIDATE_FAIL', otp_type: otpRow.otp_type });

    return NextResponse.json({ valid: false, error: 'Invalid OTP', attempts_remaining: Math.max(0, MAX_ATTEMPTS - newAttempts) }, { status: 400 });
  } catch (err) {
    console.error('[food-orders validate-otp]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
