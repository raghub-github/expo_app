import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import {
  isBeneficiaryNameAllowed,
  getVerificationAttemptsOnDay,
  MAX_VERIFICATION_ATTEMPTS_PER_DAY,
  VERIFICATION_AMOUNT_PAISE,
  maskAccountNumber,
} from "@/lib/bank-verification";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
/** RazorpayX Current Account number or Customer Identifier (from Dashboard → Banking). Required for payouts. */
const razorpayXAccountNumber = process.env.RAZORPAY_X_ACCOUNT_NUMBER;

const RAZORPAY_BASE = "https://api.razorpay.com/v1";

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getAuthHeader(): string {
  return "Basic " + Buffer.from(razorpayKeyId! + ":" + razorpayKeySecret!).toString("base64");
}

type BankPayload = {
  account_holder_name: string;
  account_number: string;
  ifsc_code: string;
  bank_name: string;
  branch_name?: string;
};

type UpiPayload = {
  upi_id: string;
  account_holder_name?: string;
};

/**
 * POST /api/merchant/bank-account/verify
 * Body: { storeId: string, bank?: BankPayload, upi?: UpiPayload, bankAccountId?: number }
 * Validates session, beneficiary name, 3/day limit; creates Razorpay contact + fund account + payout (₹1);
 * inserts merchant_bank_verification_payouts. Returns verification id and status.
 */
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
    const bankAccountId = body.bankAccountId ?? body.bank_account_id;
    const bank = body.bank as BankPayload | undefined;
    const upi = body.upi as UpiPayload | undefined;

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: "storeId is required" },
        { status: 400 }
      );
    }

    const hasBank = bank?.account_holder_name && bank?.account_number && bank?.ifsc_code && bank?.bank_name;
    const hasUpi = upi?.upi_id;
    if (!hasBank && !hasUpi) {
      return NextResponse.json(
        { success: false, error: "Provide either bank (account_holder_name, account_number, ifsc_code, bank_name) or upi (upi_id)" },
        { status: 400 }
      );
    }
    if (hasBank && hasUpi) {
      return NextResponse.json(
        { success: false, error: "Provide either bank or upi, not both" },
        { status: 400 }
      );
    }

    const db = getSupabaseAdmin();

    const { data: storeRow, error: storeErr } = await db
      .from("merchant_stores")
      .select("id, store_id, parent_id, store_name, store_display_name, owner_name, store_email, store_phones")
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
      .select("parent_name, owner_email")
      .eq("id", storeRow.parent_id)
      .single();

    const allowedNames = {
      storeName: storeRow.store_name,
      storeDisplayName: storeRow.store_display_name,
      ownerName: storeRow.owner_name,
      parentName: parentRow?.parent_name ?? null,
    };

    const beneficiaryName = hasBank
      ? (bank!.account_holder_name || "").trim()
      : (upi!.account_holder_name || upi!.upi_id || "UPI").trim();

    if (!isBeneficiaryNameAllowed(beneficiaryName, allowedNames)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Account holder name must match your store name, display name, or owner name (partial match allowed).",
        },
        { status: 400 }
      );
    }

    const attemptsToday = await getVerificationAttemptsOnDay(db as any, validation.merchantParentId, new Date());
    if (attemptsToday >= MAX_VERIFICATION_ATTEMPTS_PER_DAY) {
      return NextResponse.json(
        {
          success: false,
          error: `You can only try verification ${MAX_VERIFICATION_ATTEMPTS_PER_DAY} times per day. Try again tomorrow.`,
        },
        { status: 429 }
      );
    }

    if (!razorpayKeyId || !razorpayKeySecret) {
      return NextResponse.json(
        { success: false, error: "Payment not configured" },
        { status: 503 }
      );
    }
    if (!razorpayXAccountNumber?.trim()) {
      return NextResponse.json(
        { success: false, error: "RazorpayX account not configured for payouts. Contact support." },
        { status: 503 }
      );
    }

    const accountType = hasBank ? "bank" : "upi";
    const contactName = beneficiaryName.slice(0, 50);
    const contactEmail = (storeRow.store_email || parentRow?.owner_email || "noreply@merchant.local").slice(0, 255);
    const contactPhone = (Array.isArray(storeRow.store_phones)
      ? storeRow.store_phones[0]
      : typeof storeRow.store_phones === "string"
        ? storeRow.store_phones
        : "")
      ?.replace(/\D/g, "")
      .slice(0, 15) || "0000000000";

    const refId = `merchant_verify_${storeRow.id}_${Date.now()}`;

    const contactRes = await fetch(RAZORPAY_BASE + "/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: getAuthHeader(),
      },
      body: JSON.stringify({
        name: contactName,
        email: contactEmail,
        contact: contactPhone,
        type: "vendor",
        reference_id: refId,
      }),
    });
    if (!contactRes.ok) {
      const errText = await contactRes.text();
      console.error("[bank-account/verify] Razorpay contact error:", contactRes.status, errText);
      return NextResponse.json(
        { success: false, error: "Could not create payout contact. Please check details and try again." },
        { status: 502 }
      );
    }
    const contactData = await contactRes.json();
    const razorpayContactId = contactData.id;

    let razorpayFundAccountId: string;
    if (hasBank) {
      const faRes = await fetch(RAZORPAY_BASE + "/fund_accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: getAuthHeader(),
        },
        body: JSON.stringify({
          contact_id: razorpayContactId,
          account_type: "bank_account",
          bank_account: {
            name: (bank!.account_holder_name || "").slice(0, 100),
            ifsc: (bank!.ifsc_code || "").trim().slice(0, 11),
            account_number: String(bank!.account_number).replace(/\D/g, ""),
          },
        }),
      });
      if (!faRes.ok) {
        const errText = await faRes.text();
        console.error("[bank-account/verify] Razorpay fund account (bank) error:", faRes.status, errText);
        return NextResponse.json(
          { success: false, error: "Invalid bank account details. Check IFSC and account number." },
          { status: 400 }
        );
      }
      const faData = await faRes.json();
      razorpayFundAccountId = faData.id;
    } else {
      const vpaAddress = String(upi!.upi_id).trim().toLowerCase();
      const faRes = await fetch(RAZORPAY_BASE + "/fund_accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: getAuthHeader(),
        },
        body: JSON.stringify({
          contact_id: razorpayContactId,
          account_type: "vpa",
          vpa: { address: vpaAddress },
        }),
      });
      if (!faRes.ok) {
        const errText = await faRes.text();
        console.error("[bank-account/verify] Razorpay fund account (vpa) error:", faRes.status, errText);
        return NextResponse.json(
          { success: false, error: "Invalid UPI ID." },
          { status: 400 }
        );
      }
      const faData = await faRes.json();
      razorpayFundAccountId = faData.id;
    }

    let resolvedBankAccountId = bankAccountId;
    if (hasBank && !resolvedBankAccountId) {
      const { data: existingPrimary } = await db
        .from("merchant_store_bank_accounts")
        .select("id")
        .eq("store_id", storeRow.id)
        .eq("is_primary", true)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (existingPrimary) {
        await db.from("merchant_store_bank_accounts").update({
          account_holder_name: bank!.account_holder_name,
          account_number: bank!.account_number,
          ifsc_code: bank!.ifsc_code,
          bank_name: bank!.bank_name,
          branch_name: bank!.branch_name ?? null,
          verification_status: "pending",
          updated_at: new Date().toISOString(),
        }).eq("id", existingPrimary.id);
        resolvedBankAccountId = existingPrimary.id;
      } else {
        const { data: inserted } = await db
          .from("merchant_store_bank_accounts")
          .insert({
            store_id: storeRow.id,
            account_holder_name: bank!.account_holder_name,
            account_number: bank!.account_number,
            ifsc_code: bank!.ifsc_code,
            bank_name: bank!.bank_name,
            branch_name: bank!.branch_name ?? null,
            is_primary: true,
            is_active: true,
            verification_status: "pending",
          })
          .select("id")
          .single();
        if (inserted) resolvedBankAccountId = inserted.id;
      }
    }

    const idempotencyKey = `${refId}_payout`;
    const payoutRes = await fetch(RAZORPAY_BASE + "/payouts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: getAuthHeader(),
        "X-Payout-Idempotency": idempotencyKey,
      },
      body: JSON.stringify({
        account_number: razorpayXAccountNumber.trim(),
        fund_account_id: razorpayFundAccountId,
        amount: VERIFICATION_AMOUNT_PAISE,
        currency: "INR",
        mode: accountType === "bank" ? "IMPS" : "UPI",
        purpose: "refund",
        queue_if_low_balance: true,
        reference_id: refId.slice(0, 40),
        narration: "Verify",
        notes: { merchant_store_id: String(storeRow.id), type: "verification" },
      }),
    });

    let razorpayPayoutId: string | null = null;
    let razorpayStatus = "created";
    let failureReason: string | null = null;

    if (payoutRes.ok) {
      const payoutData = await payoutRes.json();
      razorpayPayoutId = payoutData.id;
      razorpayStatus = payoutData.status || "created";
    } else {
      const errText = await payoutRes.text();
      console.error("[bank-account/verify] Razorpay payout error:", payoutRes.status, errText);
      failureReason = errText.slice(0, 500);
      razorpayStatus = "failed";
    }

    const status = razorpayPayoutId
      ? ["processed", "processing", "queued", "pending"].includes(razorpayStatus)
        ? "processing"
        : razorpayStatus === "failed"
          ? "failed"
          : "processing"
      : "failed";

    const { data: insertRow, error: insertErr } = await db
      .from("merchant_bank_verification_payouts")
      .insert({
        merchant_parent_id: validation.merchantParentId,
        merchant_store_id: storeRow.id,
        bank_account_id: resolvedBankAccountId || bankAccountId || null,
        account_type: accountType,
        amount_paise: VERIFICATION_AMOUNT_PAISE,
        beneficiary_name: beneficiaryName,
        account_number_masked: hasBank ? maskAccountNumber(bank!.account_number) : null,
        ifsc_code: hasBank ? bank!.ifsc_code : null,
        bank_name: hasBank ? bank!.bank_name : null,
        upi_id: hasUpi ? upi!.upi_id : null,
        razorpay_contact_id: razorpayContactId,
        razorpay_fund_account_id: razorpayFundAccountId,
        razorpay_payout_id: razorpayPayoutId,
        razorpay_status: razorpayStatus,
        status,
        failure_reason: failureReason,
        metadata: { ref_id: refId },
      })
      .select("id, status, razorpay_payout_id")
      .single();

    if (insertErr) {
      console.error("[bank-account/verify] DB insert error:", insertErr);
      return NextResponse.json(
        { success: false, error: "Verification recorded but failed to save. Contact support." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      verificationId: insertRow.id,
      payoutId: razorpayPayoutId,
      status: insertRow.status,
      message:
        status === "processing"
          ? "We have sent ₹1 to your account. Verification will complete shortly. You can refresh in a few minutes."
          : status === "failed"
            ? "Payout could not be initiated. " + (failureReason || "Try again later.")
            : "Verification initiated.",
    });
  } catch (e) {
    console.error("[bank-account/verify] Error:", e);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
