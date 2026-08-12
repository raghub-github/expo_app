/**
 * POST /api/merchant/stores/[id]/bank-accounts/[accountId]/verify
 * Cashfree bank / UPI verification for an existing merchant_store_bank_accounts row.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { backendFetch } from "@/lib/notif-backend";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";

export const runtime = "nodejs";

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_VPA_RE = /^[a-z0-9.\-_]{2,256}@[a-z0-9]{2,64}$/i;

async function assertStoreAccess(storeIdNum: number) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.email) {
    return { ok: false as const, status: 401, error: "Not authenticated" };
  }
  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT")) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "AREA_MANAGER"));
  if (!allowed) {
    return { ok: false as const, status: 403, error: "Dashboard access required" };
  }
  const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });
  const store = await getMerchantStoreById(storeIdNum, areaManagerId);
  if (!store) {
    return { ok: false as const, status: 404, error: "Store not found" };
  }
  return { ok: true as const, store };
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; accountId: string }> }
) {
  try {
    const { id, accountId: accountIdRaw } = await params;
    const storeId = parseInt(id, 10);
    const accountId = parseInt(accountIdRaw, 10);
    if (!Number.isFinite(storeId) || storeId < 1 || !Number.isFinite(accountId) || accountId < 1) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const sql = getSql();
    const rows = (await sql`
      SELECT id, store_id, account_holder_name, account_number, ifsc_code, bank_name,
             payout_method, upi_id, is_verified, verification_status
        FROM public.merchant_store_bank_accounts
       WHERE id = ${accountId} AND store_id = ${storeId}
       LIMIT 1
    `) as unknown as Array<{
      id: number;
      account_holder_name: string;
      account_number: string;
      ifsc_code: string;
      bank_name: string;
      payout_method: string | null;
      upi_id: string | null;
      is_verified: boolean;
    }>;

    const acc = rows[0];
    if (!acc) {
      return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });
    }

    if (acc.is_verified) {
      return NextResponse.json({
        success: true,
        verified: true,
        status: "verified",
        message: "Account is already verified.",
      });
    }

    const method = String(acc.payout_method || "bank").toLowerCase();
    const subject = { subject_type: "merchant_store", subject_id: storeId };
    const name = String(acc.account_holder_name || "").trim() || undefined;

    let path: string;
    let payload: Record<string, unknown>;

    if (method === "upi") {
      const vpa = String(acc.upi_id || "").trim().toLowerCase();
      if (!UPI_VPA_RE.test(vpa)) {
        return NextResponse.json({ success: false, error: "Invalid UPI ID on this account." }, { status: 400 });
      }
      path = "/v1/verification/submit/upi";
      payload = { ...subject, vpa, name };
    } else {
      const bankAccount = String(acc.account_number || "").replace(/\D/g, "");
      const ifsc = String(acc.ifsc_code || "").trim().toUpperCase();
      if (!/^\d{6,20}$/.test(bankAccount)) {
        return NextResponse.json({ success: false, error: "Invalid account number." }, { status: 400 });
      }
      if (!IFSC_RE.test(ifsc)) {
        return NextResponse.json({ success: false, error: "Invalid IFSC." }, { status: 400 });
      }
      path = "/v1/verification/submit/bank";
      payload = { ...subject, bank_account: bankAccount, ifsc, name };
    }

    const res = await backendFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.status === 503 && (res.body as { error?: string })?.error === "backend_not_configured") {
      return NextResponse.json({
        success: true,
        verified: false,
        status: "processing",
        message: "Verification service is temporarily unavailable. Details saved for manual review.",
      });
    }

    const data = (res.body ?? {}) as {
      kind?: string;
      status?: string;
      status_reason?: string;
      verified_data?: Record<string, unknown>;
      error?: string;
      reason?: string;
      detail?: string | null;
    };

    if (res.status < 200 || res.status >= 300) {
      const detail = String(data.detail ?? data.reason ?? data.error ?? "").trim();
      return NextResponse.json({
        success: false,
        verified: false,
        status: "failed",
        error: detail || `Verification failed (${res.status}).`,
      }, { status: 400 });
    }

    if (data.kind === "manual") {
      await sql`
        UPDATE public.merchant_store_bank_accounts
           SET verification_status = 'pending', updated_at = NOW()
         WHERE id = ${accountId}
      `;
      return NextResponse.json({
        success: true,
        verified: false,
        status: "processing",
        message: "Could not verify instantly. Saved for manual review.",
      });
    }

    const status = String(data.status ?? "").toLowerCase();
    if (status === "verified") {
      const vd = data.verified_data ?? {};
      const nameAtBank =
        typeof vd.name_at_bank === "string"
          ? vd.name_at_bank
          : typeof vd.account_name === "string"
            ? vd.account_name
            : null;
      const nowIso = new Date().toISOString();
      if (method === "upi") {
        await sql`
          UPDATE public.merchant_store_bank_accounts SET
            is_verified = true,
            upi_verified = true,
            verified_at = ${nowIso}::timestamptz,
            verification_method = 'CASHFREE_UPI',
            verification_status = 'verified',
            updated_at = NOW()
          WHERE id = ${accountId}
        `;
      } else {
        await sql`
          UPDATE public.merchant_store_bank_accounts SET
            is_verified = true,
            verified_at = ${nowIso}::timestamptz,
            verification_method = 'CASHFREE_BAV',
            verification_status = 'verified',
            beneficiary_name = COALESCE(${nameAtBank}, beneficiary_name, account_holder_name),
            updated_at = NOW()
          WHERE id = ${accountId}
        `;
      }
      await logStoreActivity({
        storeId,
        section: "bank_account",
        action: "verify",
        entityId: accountId,
        summary: `Cashfree verified ${method} account #${accountId}`,
        actorType: "agent",
        source: "dashboard",
      });
      return NextResponse.json({
        success: true,
        verified: true,
        status: "verified",
        message:
          method === "upi"
            ? "UPI ID verified successfully with Cashfree."
            : "Bank account verified successfully with Cashfree.",
        name_at_bank: nameAtBank,
      });
    }

    await sql`
      UPDATE public.merchant_store_bank_accounts
         SET verification_status = 'failed', updated_at = NOW()
       WHERE id = ${accountId}
    `;
    return NextResponse.json({
      success: false,
      verified: false,
      status: "failed",
      error: data.status_reason || "Account could not be verified. Check the details and try again.",
    }, { status: 400 });
  } catch (e) {
    console.error("[POST bank-accounts verify]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
