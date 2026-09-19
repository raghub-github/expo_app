import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant';
import { verifyMerchantDuesPaymentViaEngine } from '@/lib/merchant-dues-payment-client';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/merchant/wallet/dues/verify-payment
 * Body: { storeId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 */
export async function POST(request: NextRequest) {
  try {
    const supabaseServer = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabaseServer.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (!validation.isValid || validation.merchantParentId == null) {
      return NextResponse.json(
        { error: validation.error ?? 'Merchant not found' },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const storeId = String(body.storeId ?? body.store_id ?? '').trim();
    const razorpayOrderId = String(body.razorpay_order_id ?? '').trim();
    const razorpayPaymentId = String(body.razorpay_payment_id ?? '').trim();
    const razorpaySignature = String(body.razorpay_signature ?? '').trim();

    if (!storeId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return NextResponse.json(
        { success: false, error: 'storeId and payment fields are required' },
        { status: 400 },
      );
    }

    const db = getDb();
    const { data: store } = await db
      .from('merchant_stores')
      .select('id, parent_id')
      .eq('store_id', storeId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!store?.id || Number(store.parent_id) !== Number(validation.merchantParentId)) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const result = await verifyMerchantDuesPaymentViaEngine(
      Number(store.id),
      {
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: razorpaySignature,
      },
      'partnersite',
    );
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.data.error ?? 'Payment verification failed' },
        { status: result.status },
      );
    }
    return NextResponse.json({ success: true, ...result.data });
  } catch (e) {
    console.error('[wallet/dues/verify-payment]', e);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
