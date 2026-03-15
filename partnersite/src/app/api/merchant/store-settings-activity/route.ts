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
 * POST /api/merchant/store-settings-activity
 * Logs activity when store settings are changed
 * Body: { storeId: string, activityType: string, description: string, metadata?: object }
 */
export async function POST(req: NextRequest) {
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
    const { storeId, activityType, description, metadata } = body;

    if (!storeId || !activityType || !description) {
      return NextResponse.json(
        { error: 'storeId, activityType, and description are required' },
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

    // Log activity in merchant_store_activity_log
    // Use SETTINGS_CHANGE enum value (will be added via migration)
    const { error: activityError } = await supabase
      .from('merchant_store_activity_log')
      .insert({
        store_id: store.id,
        activity_type: 'SETTINGS_CHANGE' as any, // Enum value from migration
        activity_reason: description,
        activity_reason_code: activityType, // Store the specific activity type (e.g., DAY_TOGGLE, TIMING_UPDATE)
        activity_notes: JSON.stringify(metadata || {}),
        actioned_by: 'MERCHANT',
        actioned_by_id: parseInt(user.id) || null,
        actioned_by_name: user.email?.split('@')[0] || 'Merchant',
        actioned_by_email: user.email || null,
      });

    if (activityError) {
      console.error('Error logging activity:', activityError);
      // Don't fail the request if logging fails
    }

    // Also log in merchant_audit_logs for comprehensive audit trail
    const { error: auditError } = await supabase
      .from('merchant_audit_logs')
      .insert({
        entity_type: 'STORE',
        entity_id: store.id,
        action: 'UPDATE',
        action_field: activityType,
        old_value: metadata?.oldValue || null,
        new_value: metadata?.newValue || null,
        performed_by: 'MERCHANT',
        performed_by_id: parseInt(user.id) || null,
        performed_by_name: user.email?.split('@')[0] || 'Merchant',
        performed_by_email: user.email || null,
        audit_metadata: {
          ...metadata,
          description,
        },
      });

    if (auditError) {
      console.error('Error logging audit:', auditError);
      // Don't fail the request if logging fails
    }

    return NextResponse.json({
      success: true,
      message: 'Activity logged successfully',
    });
  } catch (e: unknown) {
    console.error('[store-settings-activity] Error:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}
