import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { createVpaValidation, fetchValidationById, parseValidationResult } from "@/lib/razorpay-fund-account-validation";
import {
  MAX_UPI_ATTEMPTS_PER_DAY,
  MAX_UPI_ACCOUNTS_PER_STORE,
  VERIFICATION_COOLDOWN_SEC,
} from "@/lib/bank-validation-constants";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
const razorpayXAccountNumber = process.env.RAZORPAY_X_ACCOUNT_NUMBER;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getAuthHeader(): string {
  return "Basic " + Buffer.from(razorpayKeyId! + ":" + razorpayKeySecret!).toString("base64");
}

/** POST /api/merchant/bank-account/verify-upi – Razorpay VPA validation (no transfer). */
export async function POST(request: NextRequest) {
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

    const body = await request.json().catch(() => ({}));
    const storeId = body.storeId ?? body.store_id;
    const upiId = (body.upi_id ?? body.upiId ?? "").trim().toLowerCase();
    const holderName = (body.holder_name ?? body.holderName ?? body.account_holder_name ?? "").trim();

    if (!storeId || !upiId) {
      return NextResponse.json(
        { success: false, error: "storeId and upi_id are required" },
        { status: 400 }
      );
    }
    if (!/^[\w.-]+@[\w.-]+$/.test(upiId)) {
      return NextResponse.json(
        { success: false, error: "Invalid UPI ID format (e.g. name@paytm)" },
        { status: 400 }
      );
    }

    const db = getSupabaseAdmin();
    const { data: storeRow, error: storeErr } = await db
      .from("merchant_stores")
      .select("id, store_id, parent_id, store_name, store_email, store_phones")
      .eq("store_id", String(storeId))
      .eq("parent_id", validation.merchantParentId)
      .single();

    if (storeErr || !storeRow) {
      return NextResponse.json(
        { success: false, error: "Store not found or access denied" },
        { status: 404 }
      );
    }

    const { data: parentRow } = await db
      .from("merchant_parents")
      .select("owner_email")
      .eq("id", storeRow.parent_id)
      .single();

    if (!razorpayKeyId || !razorpayKeySecret) {
      return NextResponse.json(
        { success: false, error: "Payment gateway not configured" },
        { status: 503 }
      );
    }
    if (!razorpayXAccountNumber?.trim()) {
      return NextResponse.json(
        { success: false, error: "RazorpayX account not configured. Contact support." },
        { status: 503 }
      );
    }

    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const { data: limitsRow } = await db
      .from("merchant_verification_limits")
      .select("upi_attempts_today, last_reset_date")
      .eq("store_id", storeRow.id)
      .maybeSingle();

    let upiAttemptsToday = limitsRow?.upi_attempts_today ?? 0;
    const lastReset = limitsRow?.last_reset_date ?? today;
    if (lastReset !== today) {
      upiAttemptsToday = 0;
      await db.from("merchant_verification_limits").upsert({
        store_id: storeRow.id,
        bank_attempts_today: limitsRow ? undefined : 0,
        upi_attempts_today: 0,
        last_reset_date: today,
      }, { onConflict: "store_id" });
    }
    if (upiAttemptsToday >= MAX_UPI_ATTEMPTS_PER_DAY) {
      return NextResponse.json(
        { success: false, error: `Maximum ${MAX_UPI_ATTEMPTS_PER_DAY} UPI verifications per day. Try again tomorrow.` },
        { status: 429 }
      );
    }

    const { count: upiCount } = await db
      .from("merchant_store_upi_accounts")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeRow.id);
    if ((upiCount ?? 0) >= MAX_UPI_ACCOUNTS_PER_STORE) {
      return NextResponse.json(
        { success: false, error: `Maximum ${MAX_UPI_ACCOUNTS_PER_STORE} UPI IDs per store.` },
        { status: 400 }
      );
    }

    const existingUpi = await db
      .from("merchant_store_upi_accounts")
      .select("id, last_attempt_at")
      .eq("store_id", storeRow.id)
      .ilike("upi_id", upiId)
      .maybeSingle();
    if (existingUpi.data?.last_attempt_at) {
      const elapsed = (now.getTime() - new Date(existingUpi.data.last_attempt_at).getTime()) / 1000;
      if (elapsed < VERIFICATION_COOLDOWN_SEC) {
        return NextResponse.json(
          { success: false, error: `Please wait ${Math.ceil(VERIFICATION_COOLDOWN_SEC - elapsed)} seconds between attempts.` },
          { status: 429 }
        );
      }
    }

    const contactEmail = (storeRow.store_email || parentRow?.owner_email || "noreply@merchant.local").slice(0, 255);
    const contactPhone = (Array.isArray(storeRow.store_phones) ? storeRow.store_phones[0] : typeof storeRow.store_phones === "string" ? storeRow.store_phones : "")
      ?.replace(/\D/g, "").slice(0, 15) || "0000000000";
    const referenceId = `upi_${storeRow.id}_${Date.now()}`;

    const result = await createVpaValidation({
      authHeader: getAuthHeader(),
      sourceAccountNumber: razorpayXAccountNumber.trim(),
      vpaAddress: upiId,
      holderName: holderName || upiId,
      contactEmail,
      contactPhone,
      referenceId,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, verification_status: "failed", message: result.error },
        { status: 400 }
      );
    }

    const validationId = result.data.id;
    await new Promise((r) => setTimeout(r, 2500));
    const fetchResult = await fetchValidationById(getAuthHeader(), validationId);
    const finalData = fetchResult.success ? fetchResult.data : result.data;
    const { verified, beneficiaryName } = parseValidationResult(finalData);
    const verificationStatus = finalData.status === "failed" ? "failed" : verified ? "verified" : "pending";
    const verificationResponse = finalData as unknown as Record<string, unknown>;

    let upiAccountId: number;
    const existing = await db.from("merchant_store_upi_accounts").select("id, attempt_count").eq("store_id", storeRow.id).ilike("upi_id", upiId).maybeSingle();
    if (existing.data) {
      upiAccountId = existing.data.id;
      const nextAttempt = (existing.data.attempt_count ?? 0) + 1;
      await db.from("merchant_store_upi_accounts").update({
        holder_name: holderName || null,
        verification_status: verificationStatus,
        verification_response: verificationResponse,
        attempt_count: nextAttempt,
        last_attempt_at: now.toISOString(),
        verified_at: verified ? now.toISOString() : null,
        razorpay_validation_id: validationId,
        updated_at: now.toISOString(),
      }).eq("id", existing.data.id);
    } else {
      const { data: inserted } = await db
        .from("merchant_store_upi_accounts")
        .insert({
          store_id: storeRow.id,
          upi_id: upiId,
          holder_name: holderName || null,
          verification_status: verificationStatus,
          verification_response: verificationResponse,
          attempt_count: 1,
          last_attempt_at: now.toISOString(),
          verified_at: verified ? now.toISOString() : null,
          razorpay_validation_id: validationId,
        })
        .select("id")
        .single();
      upiAccountId = inserted?.id ?? 0;
    }

    await db.from("merchant_verification_limits").upsert({
      store_id: storeRow.id,
      upi_attempts_today: upiAttemptsToday + 1,
      last_reset_date: today,
    }, { onConflict: "store_id" });

    await db.from("merchant_verification_attempts").insert({
      store_id: storeRow.id,
      merchant_parent_id: validation.merchantParentId,
      attempt_type: "upi",
      upi_account_id: upiAccountId,
      razorpay_validation_id: validationId,
      status: verificationStatus,
      verification_response: verificationResponse,
      metadata: { reference_id: referenceId },
    });

    return NextResponse.json({
      success: true,
      verification_status: verificationStatus,
      message: verificationStatus === "verified"
        ? "UPI ID verified successfully."
        : verificationStatus === "failed"
          ? "Verification failed. Check UPI ID and try again."
          : "Validation in progress. Refresh in a moment.",
      beneficiary_name: beneficiaryName ?? undefined,
    });
  } catch (e) {
    console.error("[verify-upi] Error:", e);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
