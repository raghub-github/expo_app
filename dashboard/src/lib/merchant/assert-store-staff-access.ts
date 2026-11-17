import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";

export type StoreStaffAccessOk = {
  ok: true;
  storeIdNum: number;
  parentId: number;
  userId: string;
  owner: {
    owner_name: string | null;
    owner_email: string | null;
    registered_phone: string | null;
    parent_name: string | null;
  };
};

export type StoreStaffAccessResult =
  | StoreStaffAccessOk
  | { ok: false; error: string; status: number };

export async function assertDashboardStoreStaffAccess(
  storeIdParam: string
): Promise<StoreStaffAccessResult> {
  const storeId = parseInt(storeIdParam, 10);
  if (!Number.isFinite(storeId) || storeId < 1) {
    return { ok: false, error: "Invalid store id", status: 400 };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.email || !user.id) {
    return { ok: false, error: "Not authenticated", status: 401 };
  }

  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) {
    return { ok: false, error: "Merchant dashboard access required", status: 403 };
  }

  const areaManagerId = await resolveMerchantListAreaManagerId({
    supabaseAuthId: user.id,
    email: user.email,
  });
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) {
    return { ok: false, error: "Store not found", status: 404 };
  }

  const parentId = Number((store as { parent_id?: number | null }).parent_id);
  if (!Number.isFinite(parentId) || parentId < 1) {
    return { ok: false, error: "Store parent not found", status: 404 };
  }

  const sql = getSql();
  const owners = await sql`
    SELECT owner_name, owner_email, registered_phone, parent_name
    FROM merchant_parents WHERE id = ${parentId} LIMIT 1
  `;
  const o = (Array.isArray(owners) ? owners[0] : owners) as Record<string, unknown> | undefined;

  return {
    ok: true,
    storeIdNum: storeId,
    parentId,
    userId: user.id,
    owner: {
      owner_name: o?.owner_name != null ? String(o.owner_name) : null,
      owner_email: o?.owner_email != null ? String(o.owner_email) : null,
      registered_phone: o?.registered_phone != null ? String(o.registered_phone) : null,
      parent_name: o?.parent_name != null ? String(o.parent_name) : null,
    },
  };
}

export function toE164In(phone: string): string {
  const d = String(phone ?? "").replace(/\D/g, "");
  const last10 = d.length > 10 ? d.slice(-10) : d;
  return last10.length === 10 ? `+91${last10}` : phone.startsWith("+") ? phone : `+91${last10}`;
}
