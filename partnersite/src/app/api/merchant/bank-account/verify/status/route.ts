import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { getVerificationAttemptsOnDay, MAX_VERIFICATION_ATTEMPTS_PER_DAY } from "@/lib/bank-verification";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/merchant/bank-account/verify/status?storeId=...
 * Returns verification status for the store's primary bank/UPI.
 *
 * Cashfree BAV is synchronous, so the DB already holds the final state —
 * there is no external payout to poll (the old Razorpay ₹1-payout polling
 * was removed; Razorpay is not used for verification).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
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

    const storeId = request.nextUrl.searchParams.get("storeId") ?? request.nextUrl.searchParams.get("store_id");
    if (!storeId) {
      return NextResponse.json(
        { success: false, error: "storeId is required" },
        { status: 400 }
      );
    }

    const db = getSupabaseAdmin();

    const { data: storeRow, error: storeErr } = await db
      .from("merchant_stores")
      .select("id")
      .eq("store_id", String(storeId))
      .eq("parent_id", validation.merchantParentId)
      .single();

    if (storeErr || !storeRow) {
      return NextResponse.json(
        { success: false, error: "Store not found" },
        { status: 404 }
      );
    }

    const attemptsToday = await getVerificationAttemptsOnDay(db as any, validation.merchantParentId, new Date());
    const canTryVerify = attemptsToday < MAX_VERIFICATION_ATTEMPTS_PER_DAY;

    const { data: primaryBank } = await db
      .from("merchant_store_bank_accounts")
      .select("id, is_verified, upi_verified, verification_method, verification_status")
      .eq("store_id", storeRow.id)
      .eq("is_primary", true)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let verified = false;
    let verificationStatus: string = "pending";
    if (primaryBank) {
      const vStatus = (primaryBank as { verification_status?: string }).verification_status;
      verificationStatus = vStatus ?? (primaryBank.is_verified || primaryBank.upi_verified ? "verified" : "pending");
      verified = primaryBank.is_verified === true || primaryBank.upi_verified === true || verificationStatus === "verified";
    }

    return NextResponse.json({
      success: true,
      verified,
      verificationStatus,
      canEdit: !verified,
      canTryVerify,
      attemptsToday,
      maxAttemptsPerDay: MAX_VERIFICATION_ATTEMPTS_PER_DAY,
    });
  } catch (e) {
    console.error("[bank-account/verify/status] Error:", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
