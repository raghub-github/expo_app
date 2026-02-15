import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { getVerificationAttemptsOnDay, MAX_VERIFICATION_ATTEMPTS_PER_DAY } from "@/lib/bank-verification";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
const RAZORPAY_BASE = "https://api.razorpay.com/v1";

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/merchant/bank-account/verify/status?storeId=...
 * Returns verification status for the store's primary bank/UPI: verified, canEdit, attemptsToday.
 * Optionally syncs last payout status from Razorpay and updates is_verified on bank account.
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

    const { data: lastPayout } = await db
      .from("merchant_bank_verification_payouts")
      .select("id, razorpay_payout_id, status, account_type, bank_account_id")
      .eq("merchant_store_id", storeRow.id)
      .order("attempted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      lastPayout?.razorpay_payout_id &&
      razorpayKeyId &&
      razorpayKeySecret &&
      lastPayout.status === "processing"
    ) {
      const authHeader = "Basic " + Buffer.from(razorpayKeyId + ":" + razorpayKeySecret).toString("base64");
      const payoutRes = await fetch(RAZORPAY_BASE + "/payouts/" + lastPayout.razorpay_payout_id, {
        headers: { Authorization: authHeader },
      });
      if (payoutRes.ok) {
        const payoutData = await payoutRes.json();
        const rpStatus = payoutData.status;
        const ourStatus = rpStatus === "processed" ? "success" : rpStatus === "failed" ? "failed" : "processing";
        await db.from("merchant_bank_verification_payouts").update({
          status: ourStatus,
          razorpay_status: rpStatus,
          completed_at: rpStatus === "processed" || rpStatus === "failed" ? new Date().toISOString() : null,
          failure_reason: payoutData.status_details?.description ?? null,
        }).eq("id", lastPayout.id);

        if (rpStatus === "processed") {
          const isUpi = lastPayout.account_type === "upi";
          const targetBankId = lastPayout.bank_account_id ?? primaryBank?.id;
          if (targetBankId) {
            await db.from("merchant_store_bank_accounts").update({
              is_verified: isUpi ? (primaryBank?.is_verified ?? false) : true,
              upi_verified: isUpi ? true : (primaryBank?.upi_verified ?? false),
              verified_at: new Date().toISOString(),
              verification_method: "PENNY_DROP",
              verification_status: "verified",
              updated_at: new Date().toISOString(),
            }).eq("id", targetBankId);
          }
          verified = true;
          verificationStatus = "verified";
        }
      }
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
