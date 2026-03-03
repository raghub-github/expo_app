/**
 * GET /api/merchant/stores/[id]/bank-accounts - List bank/UPI accounts
 * POST /api/merchant/stores/[id]/bank-accounts - Add account
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getStoreBankAccounts } from "@/lib/db/operations/merchant-store-bank-accounts";

export const runtime = "nodejs";

async function assertStoreAccess(storeId: number) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return { ok: false as const, status: 401, error: "Not authenticated" };
  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) return { ok: false as const, status: 403, error: "Forbidden" };
  let areaManagerId: number | null = null;
  if (!(await isSuperAdmin(user.id, user.email))) {
    const systemUser = await getSystemUserByEmail(user.email);
    if (systemUser) {
      const am = await getAreaManagerByUserId(systemUser.id);
      if (am) areaManagerId = am.id;
    }
  }
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) return { ok: false as const, status: 404, error: "Store not found" };
  return { ok: true as const, store };
}

function stubAccount(id: number, storeId: number, isPrimary: boolean) {
  return {
    id,
    account_holder_name: "Account " + id,
    account_number_masked: "****" + (1000 + id),
    ifsc_code: "SBIN0001234",
    bank_name: "State Bank",
    upi_id: null as string | null,
    is_primary: isPrimary,
    is_active: true,
    is_disabled: false,
    payout_method: "bank" as string,
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
    const store = access.store as { id: number };
    const accounts = await getStoreBankAccounts(store.id);
    return NextResponse.json(accounts);
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
    const body = await request.json().catch(() => ({}));
    const {
      payout_method = "bank",
      account_holder_name,
      account_number,
      ifsc_code,
      bank_name,
      branch_name,
      upi_id,
      bank_proof_type,
      bank_proof_file_url,
    } = body;
    if (!account_holder_name || typeof account_holder_name !== "string" || !account_holder_name.trim()) {
      return NextResponse.json({ success: false, error: "Account holder name required" }, { status: 400 });
    }
    if (payout_method === "bank" && (!ifsc_code?.trim() || !bank_name?.trim())) {
      return NextResponse.json({ success: false, error: "IFSC and bank name required for bank account" }, { status: 400 });
    }
    if (payout_method === "upi" && !upi_id?.trim()) {
      return NextResponse.json({ success: false, error: "UPI ID required for UPI" }, { status: 400 });
    }
    // TODO: insert into merchant_bank_accounts; for now return success with stub
    const newId = Math.floor(Math.random() * 100000) + 1;
    const account = stubAccount(newId, storeId, true);
    return NextResponse.json({ success: true, account }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/bank-accounts]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
