import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import {
  isBeneficiaryNameAllowed,
  getVerificationAttemptsOnDay,
  MAX_VERIFICATION_ATTEMPTS_PER_DAY,
  maskAccountNumber,
} from "@/lib/bank-verification";
import {
  getCashfreeConfig,
  verifyBankAccountSync,
  verifyUpiSync,
} from "@/lib/cashfree-verification";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
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
 *
 * Verifies the merchant's bank account (Cashfree pennyless BAV — no ₹1
 * transfer) or UPI ID (Cashfree VPA validation). Result is synchronous: the
 * bank row is marked verified/failed immediately and the attempt is recorded
 * in merchant_bank_verification_payouts for the 3-per-day limit + audit.
 *
 * Razorpay is intentionally NOT used here: verification runs on Cashfree or
 * falls back to manual review by our team (backend/drizzle/0396).
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
      .select("id, store_id, parent_id, store_name, store_display_name, owner_full_name, store_email, store_phones")
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
      ownerName: storeRow.owner_full_name,
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

    const cfg = getCashfreeConfig();
    if (!cfg.ok) {
      // No provider configured — do not fail the merchant: record the details
      // as pending so our team verifies manually from the dashboard.
      console.error("[bank-account/verify] Cashfree not configured, falling back to manual review:", cfg.missing.join(", "));
    }

    const accountType = hasBank ? "bank" : "upi";
    const contactPhone = (Array.isArray(storeRow.store_phones)
      ? storeRow.store_phones[0]
      : typeof storeRow.store_phones === "string"
        ? storeRow.store_phones
        : "") || null;
    const refId = `merchant_verify_${storeRow.id}_${Date.now()}`;

    // Upsert the bank row first (same behaviour as before) so a failed
    // provider call still leaves the details saved as pending.
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

    // ── Cashfree verification (synchronous) or manual-review fallback ──────
    let status: "success" | "failed" | "pending_manual" = "pending_manual";
    let providerReference: string | null = null;
    let providerStatusCode: string | null = null;
    let failureReason: string | null = null;
    let nameAtBank: string | null = null;

    if (cfg.ok) {
      const result = hasBank
        ? await verifyBankAccountSync({
            accountNumber: String(bank!.account_number),
            ifsc: bank!.ifsc_code,
            name: beneficiaryName,
            phone: contactPhone,
            verificationId: refId,
          })
        : await verifyUpiSync({
            vpa: String(upi!.upi_id),
            name: beneficiaryName,
            verificationId: refId,
          });

      providerReference = result.referenceId;
      providerStatusCode = result.statusCode;
      nameAtBank = result.nameAtBank;

      if (result.outcome === "verified") {
        // Provider confirmed the account. Cross-check the name the bank
        // returned against the allowed store/owner names when we got one.
        const bankNameOk =
          !result.nameAtBank || isBeneficiaryNameAllowed(result.nameAtBank, allowedNames);
        if (bankNameOk) {
          status = "success";
        } else {
          status = "failed";
          failureReason = `Name at bank ("${result.nameAtBank}") does not match store/owner name.`;
        }
      } else if (result.outcome === "invalid") {
        status = "failed";
        failureReason = result.failureReason ?? "Account could not be verified.";
      } else {
        // Provider error — keep the row pending for manual review rather than
        // burning the merchant's attempt with a hard failure.
        status = "pending_manual";
        failureReason = result.failureReason;
        console.error("[bank-account/verify] Cashfree error:", result.statusCode, result.failureReason);
      }
    }

    // Reflect the outcome on the bank row.
    const nowIso = new Date().toISOString();
    const targetBankId = hasBank ? (resolvedBankAccountId || bankAccountId || null) : (bankAccountId || null);
    if (status === "success") {
      const updatePayload = hasBank
        ? {
            is_verified: true,
            verified_at: nowIso,
            verification_method: "CASHFREE_BAV",
            verification_status: "verified",
            beneficiary_name: nameAtBank ?? beneficiaryName,
            updated_at: nowIso,
          }
        : {
            upi_verified: true,
            verified_at: nowIso,
            verification_method: "CASHFREE_UPI",
            verification_status: "verified",
            updated_at: nowIso,
          };
      if (targetBankId) {
        await db.from("merchant_store_bank_accounts").update(updatePayload).eq("id", targetBankId);
      } else if (!hasBank) {
        // UPI verify without an explicit bank row: mark the primary row.
        const { data: primary } = await db
          .from("merchant_store_bank_accounts")
          .select("id")
          .eq("store_id", storeRow.id)
          .eq("is_primary", true)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        if (primary) {
          await db.from("merchant_store_bank_accounts").update(updatePayload).eq("id", primary.id);
        }
      }
    } else if (status === "failed" && targetBankId) {
      await db.from("merchant_store_bank_accounts").update({
        verification_status: "failed",
        updated_at: nowIso,
      }).eq("id", targetBankId);
    }
    // pending_manual leaves verification_status = 'pending' — the agent
    // dashboard picks it up for manual review.

    // Record the attempt (same table as before — feeds the 3/day limit and
    // the admin audit trail). amount_paise is 0: pennyless verification.
    const { data: insertRow, error: insertErr } = await db
      .from("merchant_bank_verification_payouts")
      .insert({
        merchant_parent_id: validation.merchantParentId,
        merchant_store_id: storeRow.id,
        bank_account_id: targetBankId,
        account_type: accountType,
        amount_paise: 0,
        beneficiary_name: beneficiaryName,
        account_number_masked: hasBank ? maskAccountNumber(bank!.account_number) : null,
        ifsc_code: hasBank ? bank!.ifsc_code : null,
        bank_name: hasBank ? bank!.bank_name : null,
        upi_id: hasUpi ? upi!.upi_id : null,
        status: status === "success" ? "success" : status === "failed" ? "failed" : "processing",
        failure_reason: failureReason,
        completed_at: status === "pending_manual" ? null : nowIso,
        metadata: {
          ref_id: refId,
          provider: "cashfree",
          provider_reference: providerReference,
          provider_status_code: providerStatusCode,
          name_at_bank: nameAtBank,
          manual_review: status === "pending_manual",
        },
      })
      .select("id, status")
      .single();

    if (insertErr) {
      console.error("[bank-account/verify] DB insert error:", insertErr);
      return NextResponse.json(
        { success: false, error: "Verification recorded but failed to save. Contact support." },
        { status: 500 }
      );
    }

    if (status === "failed") {
      return NextResponse.json({
        success: false,
        verificationId: insertRow.id,
        status: "failed",
        error: failureReason || "Account could not be verified. Check the details and try again.",
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      verificationId: insertRow.id,
      status: status === "success" ? "verified" : "processing",
      verified: status === "success",
      message:
        status === "success"
          ? (hasBank
              ? "Bank account verified successfully — no test transfer needed."
              : "UPI ID verified successfully.")
          : "We could not verify instantly. Your details are saved and our team will verify them manually within 24 hours.",
    });
  } catch (e) {
    console.error("[bank-account/verify] Error:", e);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
