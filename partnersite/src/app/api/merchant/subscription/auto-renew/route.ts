import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * PATCH /api/merchant/subscription/auto-renew
 * Body: { storeId: string, autoRenew: boolean }
 * Updates auto-renew status for a subscription
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

    // Get store info
    const { data: store } = await supabase
      .from('merchant_stores')
      .select('id, parent_id')
      .eq('store_id', storeId)
      .single();

    if (!store?.id || !store?.parent_id) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Get user ID for tracking who enabled/disabled auto-pay
    const userId = user.id;

    // Get current subscription to check next_billing_date
    const { data: currentSub } = await supabase
      .from('merchant_subscriptions')
      .select('next_billing_date, auto_renew')
      .eq('merchant_id', store.parent_id)
      .eq('store_id', store.id)
      .single();

    if (!currentSub) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    // Update subscription auto-renew with tracking
    const updateData: any = {
      auto_renew: autoRenew,
      updated_at: new Date().toISOString(),
    };

    // Note: Auto-pay tracking fields will be added after migration runs
    // For now, only update auto_renew flag
    // TODO: Uncomment after running migration 0023_update_subscriptions_auto_pay.sql
    /*
    if (autoRenew && !currentSub.auto_renew) {
      // Enabling auto-pay (was previously disabled)
      updateData.auto_pay_enabled_at = new Date().toISOString();
      updateData.auto_pay_enabled_by = userId;
      updateData.auto_pay_disabled_at = null;
      updateData.auto_pay_disabled_by = null;
      // Set next auto-pay date to next billing date
      if (currentSub.next_billing_date) {
        updateData.next_auto_pay_date = currentSub.next_billing_date;
      }
    } else if (!autoRenew && currentSub.auto_renew) {
      // Disabling auto-pay (was previously enabled)
      updateData.auto_pay_disabled_at = new Date().toISOString();
      updateData.auto_pay_disabled_by = userId;
      updateData.next_auto_pay_date = null;
    }
    */

    const { data: subscription, error: updateError } = await supabase
      .from('merchant_subscriptions')
      .update(updateData)
      .eq('merchant_id', store.parent_id)
      .eq('store_id', store.id)
      .select('id')
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      autoRenew,
      message: `Auto-renew ${autoRenew ? 'enabled' : 'disabled'}`,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}
