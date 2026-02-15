import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/auth/resolve-session
 * Requires valid session. Returns parent, child stores, and onboarding progress
 * so the client can redirect: no children → register-store; in progress → resume; has verified → dashboard.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });

    if (!validation.isValid || validation.merchantParentId == null) {
      return NextResponse.json(
        { success: false, error: validation.error ?? "Merchant not found" },
        { status: 403 }
      );
    }

    const parentId = validation.merchantParentId;
    const db = getSupabaseAdmin();

    const { data: parentRow } = await db
      .from("merchant_parents")
      .select("parent_name, owner_name, owner_email, parent_merchant_id")
      .eq("id", parentId)
      .single();

    const { data: stores, error: storesError } = await db
      .from("merchant_stores")
      .select("store_id, store_name, full_address, store_phones, approval_status, is_active, current_onboarding_step, onboarding_completed")
      .eq("parent_id", parentId);

    if (storesError) {
      return NextResponse.json(
        { success: false, error: "Failed to fetch stores" },
        { status: 500 }
      );
    }

    const { data: progress, error: progressError } = await db
      .from("merchant_store_registration_progress")
      .select("*")
      .eq("parent_id", parentId)
      .is("store_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (progressError) {
      return NextResponse.json(
        { success: false, error: "Failed to fetch onboarding progress" },
        { status: 500 }
      );
    }

    const storeList = stores ?? [];
    const verifiedStores = storeList.filter((s) => s.approval_status === "APPROVED");

    return NextResponse.json({
      success: true,
      parentId,
      parentMerchantId: validation.parentMerchantId,
      parentName: parentRow?.parent_name ?? null,
      ownerName: parentRow?.owner_name ?? null,
      ownerEmail: parentRow?.owner_email ?? null,
      stores: storeList,
      onboardingProgress: progress ?? null,
      hasVerifiedStore: verifiedStores.length > 0,
      verifiedStores,
    });
  } catch (e) {
    console.error("[resolve-session] Error:", e);
    return NextResponse.json(
      { success: false, error: "An error occurred" },
      { status: 500 }
    );
  }
}
