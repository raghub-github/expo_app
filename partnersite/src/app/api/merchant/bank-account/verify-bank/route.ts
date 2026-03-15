import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { isBeneficiaryNameAllowed } from "@/lib/bank-verification";
import {
  createBankValidation,
  fetchValidationById,
  parseValidationResult,
} from "@/lib/razorpay-fund-account-validation";
import {
  MAX_BANK_ATTEMPTS_PER_DAY,
  MAX_BANK_ACCOUNTS_PER_STORE,
  VERIFICATION_COOLDOWN_SEC,
} from "@/lib/bank-validation-constants";
import { encryptAccountNumber, isEncryptionConfigured } from "@/lib/bank-account-encrypt";

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

/** POST /api/merchant/bank-account/verify-bank – Razorpay Fund Account Validation (pennyiless, no transfer). */
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
    const accountHolderName = body.account_holder_name ?? body.accountHolderName;
    const accountNumber = body.account_number ?? body.accountNumber;
    const ifscCode = body.ifsc_code ?? body.ifscCode;
    const bankName = body.bank_name ?? body.bankName;
    const branchName = body.branch_name ?? body.branchName;

    if (!storeId || !accountHolderName || !accountNumber || !ifscCode || !bankName) {
      return NextResponse.json(
        { success: false, error: "storeId, account_holder_name, account_number, ifsc_code, bank_name are required" },
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

    if (!isBeneficiaryNameAllowed(accountHolderName, {
      storeName: storeRow.store_name,
      storeDisplayName: storeRow.store_display_name,
      ownerName: storeRow.owner_name,
      parentName: parentRow?.parent_name ?? null,
    })) {
      return NextResponse.json(
        { success: false, error: "Account holder name must match your store or owner name." },
        { status: 400 }
      );
    }

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
      .select("bank_attempts_today, last_reset_date")
      .eq("store_id", storeRow.id)
      .maybeSingle();

    let bankAttemptsToday = limitsRow?.bank_attempts_today ?? 0;
    const lastReset = limitsRow?.last_reset_date ?? today;
    if (lastReset !== today) {
      bankAttemptsToday = 0;
      await db.from("merchant_verification_limits").upsert({
        store_id: storeRow.id,
        bank_attempts_today: 0,
        upi_attempts_today: limitsRow ? undefined : 0,
        last_reset_date: today,
      }, { onConflict: "store_id" });
    }
    if (bankAttemptsToday >= MAX_BANK_ATTEMPTS_PER_DAY) {
      return NextResponse.json(
        { success: false, error: `Maximum ${MAX_BANK_ATTEMPTS_PER_DAY} bank verifications per day. Try again tomorrow.` },
        { status: 429 }
      );
    }

    const { count: bankCount } = await db
      .from("merchant_store_bank_accounts")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeRow.id)
      .eq("is_active", true);
    if ((bankCount ?? 0) >= MAX_BANK_ACCOUNTS_PER_STORE) {
      return NextResponse.json(
        { success: false, error: `Maximum ${MAX_BANK_ACCOUNTS_PER_STORE} bank accounts per store.` },
        { status: 400 }
      );
    }

    const existingBank = bankAccountId
      ? await db.from("merchant_store_bank_accounts").select("id, last_attempt_at").eq("id", bankAccountId).eq("store_id", storeRow.id).maybeSingle()
      : { data: null };
    const lastAttemptAt = existingBank.data?.last_attempt_at;
    if (lastAttemptAt) {
      const elapsed = (now.getTime() - new Date(lastAttemptAt).getTime()) / 1000;
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
    const referenceId = `bank_${storeRow.id}_${Date.now()}`;

    const result = await createBankValidation({
      authHeader: getAuthHeader(),
      sourceAccountNumber: razorpayXAccountNumber.trim(),
      accountHolderName: accountHolderName.trim(),
      accountNumber: String(accountNumber).replace(/\D/g, ""),
      ifsc: ifscCode.trim(),
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

    let resolvedBankAccountId = bankAccountId;
    let accountNumberEncrypted: string | null = null;
    if (isEncryptionConfigured()) {
      try {
        accountNumberEncrypted = encryptAccountNumber(String(accountNumber).replace(/\D/g, ""));
      } catch {
        accountNumberEncrypted = null;
      }
    }

    if (!resolvedBankAccountId) {
      const { data: existingPrimary } = await db
        .from("merchant_store_bank_accounts")
        .select("id, attempt_count")
        .eq("store_id", storeRow.id)
        .eq("is_primary", true)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (existingPrimary) {
        const nextAttempt = (existingPrimary.attempt_count ?? 0) + 1;
        await db.from("merchant_store_bank_accounts").update({
          account_holder_name: accountHolderName.trim(),
          account_number: String(accountNumber).replace(/\D/g, ""),
          account_number_encrypted: accountNumberEncrypted,
          ifsc_code: ifscCode.trim(),
          bank_name: bankName.trim(),
          branch_name: branchName?.trim() ?? null,
          verification_status: verificationStatus,
          verification_response: verificationResponse,
          beneficiary_name: beneficiaryName,
          attempt_count: nextAttempt,
          last_attempt_at: now.toISOString(),
          verified_at: verified ? now.toISOString() : null,
          is_verified: verified,
          razorpay_validation_id: validationId,
          updated_at: now.toISOString(),
        }).eq("id", existingPrimary.id);
        resolvedBankAccountId = existingPrimary.id;
      } else {
        const { data: inserted } = await db
          .from("merchant_store_bank_accounts")
          .insert({
            store_id: storeRow.id,
            account_holder_name: accountHolderName.trim(),
            account_number: String(accountNumber).replace(/\D/g, ""),
            account_number_encrypted: accountNumberEncrypted,
            ifsc_code: ifscCode.trim(),
            bank_name: bankName.trim(),
            branch_name: branchName?.trim() ?? null,
            is_primary: true,
            is_active: true,
            verification_status: verificationStatus,
            verification_response: verificationResponse,
            beneficiary_name: beneficiaryName,
            attempt_count: 1,
            last_attempt_at: now.toISOString(),
            verified_at: verified ? now.toISOString() : null,
            is_verified: verified,
            razorpay_validation_id: validationId,
          })
          .select("id")
          .single();
        if (inserted) resolvedBankAccountId = inserted.id;
      }
    } else {
      const { data: row } = await db.from("merchant_store_bank_accounts").select("attempt_count").eq("id", resolvedBankAccountId).eq("store_id", storeRow.id).single();
      const nextAttempt = (row?.attempt_count ?? 0) + 1;
      await db.from("merchant_store_bank_accounts").update({
        account_holder_name: accountHolderName.trim(),
        account_number: String(accountNumber).replace(/\D/g, ""),
        account_number_encrypted: accountNumberEncrypted,
        ifsc_code: ifscCode.trim(),
        bank_name: bankName.trim(),
        branch_name: branchName?.trim() ?? null,
        verification_status: verificationStatus,
        verification_response: verificationResponse,
        beneficiary_name: beneficiaryName,
        attempt_count: nextAttempt,
        last_attempt_at: now.toISOString(),
        verified_at: verified ? now.toISOString() : null,
        is_verified: verified,
        razorpay_validation_id: validationId,
        updated_at: now.toISOString(),
      }).eq("id", resolvedBankAccountId).eq("store_id", storeRow.id);
    }

    await db.from("merchant_verification_limits").upsert({
      store_id: storeRow.id,
      bank_attempts_today: bankAttemptsToday + 1,
      last_reset_date: today,
    }, { onConflict: "store_id" });

    await db.from("merchant_verification_attempts").insert({
      store_id: storeRow.id,
      merchant_parent_id: validation.merchantParentId,
      attempt_type: "bank",
      bank_account_id: resolvedBankAccountId,
      razorpay_validation_id: validationId,
      status: verificationStatus,
      verification_response: verificationResponse,
      metadata: { reference_id: referenceId },
    });

    return NextResponse.json({
      success: true,
      verification_status: verificationStatus,
      message: verificationStatus === "verified"
        ? "Bank account verified successfully."
        : verificationStatus === "failed"
          ? "Verification failed. Check account details and try again."
          : "Validation in progress. Refresh in a moment.",
      beneficiary_name: beneficiaryName ?? undefined,
    });
  } catch (e) {
    console.error("[verify-bank] Error:", e);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
