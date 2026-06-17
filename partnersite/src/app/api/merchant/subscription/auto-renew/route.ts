import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * PATCH /api/merchant/subscription/auto-renew
 * Body: { storeId: string, autoRenew: boolean }
 * Updates auto-renew status for a subscription (wallet auto-pay on billing date).
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabaseServer = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabaseServer.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error ?? 'Merchant not found' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { storeId, autoRenew } = body;

    if (!storeId || typeof autoRenew !== 'boolean') {
      return NextResponse.json(
        { error: 'storeId and autoRenew (boolean) are required' },
        { status: 400 }
      );
    }

    const { data: store } = await supabase
      .from('merchant_stores')
      .select('id, parent_id')
      .eq('store_id', storeId)
      .single();

    if (!store?.id || !store?.parent_id) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const { data: currentSub } = await supabase
      .from('merchant_subscriptions')
      .select('id, next_billing_date, expiry_date, billing_end_at, auto_renew, subscription_status, is_active')
      .eq('merchant_id', store.parent_id)
      .eq('store_id', store.id)
      .eq('subscription_status', 'ACTIVE')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!currentSub) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const billingAnchor =
      currentSub.next_billing_date ??
      currentSub.billing_end_at ??
      currentSub.expiry_date;

    if (autoRenew && !billingAnchor) {
      return NextResponse.json(
        { error: 'Cannot enable auto-renew without billing date' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      auto_renew: autoRenew,
      updated_at: now,
    };

    if (autoRenew) {
      updateData.next_billing_date = billingAnchor;
      updateData.next_auto_pay_date = billingAnchor;
      if (!currentSub.auto_renew) {
        updateData.auto_pay_enabled_at = now;
        updateData.auto_pay_disabled_at = null;
        updateData.auto_pay_disabled_by = null;
      }
    } else if (currentSub.auto_renew) {
      updateData.next_auto_pay_date = null;
      updateData.auto_pay_disabled_at = now;
    }

    const { error: updateError } = await supabase
      .from('merchant_subscriptions')
      .update(updateData)
      .eq('id', currentSub.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      autoRenew,
      nextBillingDate: billingAnchor,
      message: `Auto-renew ${autoRenew ? 'enabled' : 'disabled'}`,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}
