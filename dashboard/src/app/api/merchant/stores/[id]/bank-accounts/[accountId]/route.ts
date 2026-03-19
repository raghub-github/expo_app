/**
 * PATCH /api/merchant/stores/[id]/bank-accounts/[accountId]
 * Body: { set_default?: boolean, set_disabled?: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { setBankAccountDefault, setBankAccountDisabled } from "@/lib/db/operations/merchant-store-bank-accounts";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";

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

    return NextResponse.json({ success: false, error: "No valid action (set_default or set_disabled)" }, { status: 400 });
  } catch (e) {
    console.error("[PATCH /api/merchant/stores/[id]/bank-accounts/[accountId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
