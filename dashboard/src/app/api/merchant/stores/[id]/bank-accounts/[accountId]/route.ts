/**
 * PATCH /api/merchant/stores/[id]/bank-accounts/[accountId]
 * Body:
 * - { set_default?: boolean, set_disabled?: boolean }
 * - { update?: { ...fields } } (editable bank fields + proof urls)
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import {
  setBankAccountDefault,
  setBankAccountDisabled,
  updateStoreBankAccount,
} from "@/lib/db/operations/merchant-store-bank-accounts";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";
import { syncStep6FromBankAccounts } from "@/lib/db/operations/store-verification-steps";

export const runtime = "nodejs";

async function assertStoreAccess(storeId: number) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return { ok: false as const, status: 401, error: "Not authenticated" };
  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) return { ok: false as const, status: 403, error: "Forbidden" };
  const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) return { ok: false as const, status: 404, error: "Store not found" };
  return { ok: true as const, store };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; accountId: string }> }
) {
  try {
    const { id, accountId } = await params;
    const storeId = parseInt(id, 10);
    const accountIdNum = parseInt(accountId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(accountIdNum)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }
    const store = access.store as { id: number };
    const body = await request.json().catch(() => ({}));

    if (body.set_default === true) {
      await setBankAccountDefault(store.id, accountIdNum);
      await logStoreActivity({ storeId: store.id, section: "bank_account", action: "set_default", entityId: accountIdNum, summary: `Agent set bank account #${accountIdNum} as default`, actorType: "agent", source: "dashboard" });
      return NextResponse.json({ success: true });
    }

    if (body.set_disabled === true) {
      await setBankAccountDisabled(store.id, accountIdNum, true);
      await logStoreActivity({ storeId: store.id, section: "bank_account", action: "disable", entityId: accountIdNum, summary: `Agent disabled bank account #${accountIdNum}`, actorType: "agent", source: "dashboard" });
      return NextResponse.json({ success: true });
    }

    if (body.set_disabled === false) {
      await setBankAccountDisabled(store.id, accountIdNum, false);
      await logStoreActivity({ storeId: store.id, section: "bank_account", action: "enable", entityId: accountIdNum, summary: `Agent enabled bank account #${accountIdNum}`, actorType: "agent", source: "dashboard" });
      return NextResponse.json({ success: true });
    }

    if (body.update && typeof body.update === "object") {
      const u = body.update as Record<string, unknown>;
      const patch = {
        account_holder_name: typeof u.account_holder_name === "string" ? u.account_holder_name.trim() : undefined,
        beneficiary_name: typeof u.beneficiary_name === "string" ? u.beneficiary_name.trim() || null : undefined,
        account_number: typeof u.account_number === "string" ? u.account_number.trim() : undefined,
        ifsc_code: typeof u.ifsc_code === "string" ? u.ifsc_code.trim().toUpperCase() : undefined,
        bank_name: typeof u.bank_name === "string" ? u.bank_name.trim() : undefined,
        branch_name: typeof u.branch_name === "string" ? u.branch_name.trim() || null : undefined,
        account_type: typeof u.account_type === "string" ? u.account_type.trim() || null : undefined,
        upi_id: typeof u.upi_id === "string" ? u.upi_id.trim() || null : undefined,
        payout_method: typeof u.payout_method === "string" ? u.payout_method.trim().toLowerCase() : undefined,
        bank_proof_file_url: typeof u.bank_proof_file_url === "string" ? u.bank_proof_file_url.trim() || null : undefined,
        upi_qr_screenshot_url: typeof u.upi_qr_screenshot_url === "string" ? u.upi_qr_screenshot_url.trim() || null : undefined,
        is_verified: typeof u.is_verified === "boolean" ? u.is_verified : undefined,
        upi_verified: typeof u.upi_verified === "boolean" ? u.upi_verified : undefined,
        verification_status: typeof u.verification_status === "string" ? u.verification_status.trim() || null : undefined,
      };
      if (patch.payout_method && patch.payout_method !== "bank" && patch.payout_method !== "upi") {
        return NextResponse.json({ success: false, error: "payout_method must be bank or upi" }, { status: 400 });
      }
      const updated = await updateStoreBankAccount(store.id, accountIdNum, patch);
      if (!updated) {
        return NextResponse.json({ success: false, error: "Update failed" }, { status: 500 });
      }
      await logStoreActivity({
        storeId: store.id,
        section: "bank_account",
        action: "update",
        entityId: accountIdNum,
        summary: `Agent updated bank account #${accountIdNum}`,
        actorType: "agent",
        source: "dashboard",
      });
      if (patch.is_verified === true) {
        await syncStep6FromBankAccounts(store.id).catch(() => {});
      }
      return NextResponse.json({ success: true, account: updated });
    }

    return NextResponse.json(
      { success: false, error: "No valid action (set_default / set_disabled / update)" },
      { status: 400 }
    );
  } catch (e) {
    console.error("[PATCH /api/merchant/stores/[id]/bank-accounts/[accountId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
