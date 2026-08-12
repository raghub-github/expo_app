/**
 * GET /api/merchant/stores/[id]/bank-accounts - List ALL bank/UPI accounts (including disabled)
 * POST /api/merchant/stores/[id]/bank-accounts - Add new bank/UPI account
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveMerchantApiActor } from "@/lib/merchant-food-orders/store-access";
import { getMerchantAccess } from "@/lib/permissions/merchant-access";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import {
  canRevealStoreBankDetails,
  redactStoreBankAccounts,
} from "@/lib/merchants/store-legal-docs-access";
import { logActionByAuth, getIpAddress, getUserAgent } from "@/lib/audit/logger";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getStoreBankAccounts, addStoreBankAccount } from "@/lib/db/operations/merchant-store-bank-accounts";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";

export const runtime = "nodejs";

async function assertStoreAccess(storeId: number) {
  const actor = await resolveMerchantApiActor();
  if (!actor.ok) {
    return { ok: false as const, status: actor.status, error: actor.error };
  }

  const access = await getMerchantAccess(actor.id, actor.email);
  if (!access) return { ok: false as const, status: 403 as const, error: "Merchant access required" };

  const areaManagerId = await resolveMerchantListAreaManagerId({
    supabaseAuthId: actor.id,
    email: actor.email,
  });
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) return { ok: false as const, status: 404 as const, error: "Store not found" };
  return {
    ok: true as const,
    store,
    access,
    user: { id: actor.id, email: actor.email },
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }
    const store = access.store as {
      id: number;
      area_manager_id?: number | null;
      parent_id?: number | null;
    };
    const accounts = await getStoreBankAccounts(store.id);
    const canReveal = await canRevealStoreBankDetails({
      supabaseAuthId: access.user.id,
      email: access.user.email,
      store: {
        id: store.id,
        area_manager_id: store.area_manager_id ?? null,
        parent_id: store.parent_id ?? null,
      },
    });
    const safeAccounts = canReveal
      ? accounts
      : redactStoreBankAccounts(accounts as unknown as Array<Record<string, unknown>>);
    return NextResponse.json({
      success: true,
      accounts: safeAccounts,
      legalDocsRestricted: !canReveal,
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/bank-accounts]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }
    if (!access.access.can_update_bank_details) {
      return NextResponse.json({ success: false, error: "Permission denied: cannot update bank details" }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const payoutMethod = String(body.payout_method || "bank").toLowerCase();
    if (payoutMethod !== "bank" && payoutMethod !== "upi") {
      return NextResponse.json({ success: false, error: "payout_method must be bank or upi" }, { status: 400 });
    }
    const holderName = String(body.account_holder_name || "").trim();
    const accNum = String(body.account_number || "").trim();
    if (!holderName || !accNum) {
      return NextResponse.json({ success: false, error: "Account holder name and account number required" }, { status: 400 });
    }
    if (payoutMethod === "bank" && (!body.ifsc_code?.trim() || !body.bank_name?.trim())) {
      return NextResponse.json({ success: false, error: "IFSC and bank name required for bank account" }, { status: 400 });
    }
    if (payoutMethod === "upi" && !body.upi_id?.trim()) {
      return NextResponse.json({ success: false, error: "UPI ID required for UPI" }, { status: 400 });
    }
    const store = access.store as { id: number };
    const account = await addStoreBankAccount(store.id, {
      payout_method: payoutMethod,
      account_holder_name: holderName,
      account_number: accNum,
      ifsc_code: payoutMethod === "bank" ? String(body.ifsc_code).trim().toUpperCase() : "N/A",
      bank_name: payoutMethod === "bank" ? String(body.bank_name).trim() : "UPI",
      branch_name: body.branch_name?.trim() || null,
      account_type: body.account_type?.trim() || null,
      upi_id: payoutMethod === "upi" ? String(body.upi_id).trim() : null,
      beneficiary_name: body.beneficiary_name?.trim() || holderName,
    });
    await logStoreActivity({
      storeId: store.id, section: "bank_account", action: "create",
      entityId: account.id, entityName: holderName,
      summary: `Agent added ${payoutMethod} account "${holderName}"`,
      actorType: "agent", source: "dashboard",
    });
    await logActionByAuth(
      access.user.id,
      access.user.email,
      "MERCHANT",
      "UPDATE",
      {
        resourceType: "bank_account",
        resourceId: String(account.id),
        actionDetails: { storeId: store.id, payoutMethod, holderName },
        newValues: { accountId: account.id },
        ipAddress: getIpAddress(request),
        userAgent: getUserAgent(request),
        requestPath: `/api/merchant/stores/${storeId}/bank-accounts`,
        requestMethod: "POST",
      }
    );
    return NextResponse.json({ success: true, account }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/bank-accounts]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
