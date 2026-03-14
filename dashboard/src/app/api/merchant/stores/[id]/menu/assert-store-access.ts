/**
 * Shared store access for dashboard menu API routes.
 */
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import crypto from "node:crypto";

export async function assertStoreAccess(storeId: number) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return { ok: false as const, status: 401, error: "Not authenticated" };
  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) return { ok: false as const, status: 403, error: "Merchant dashboard access required" };
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
  return { ok: true as const };
}

function genId(prefix: string) {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 26);
}

export const DEFAULT_PLAN = "basic";

export async function getModifierLimits(storeIdNum: number): Promise<{
  max_modifier_groups: number;
  max_modifier_options: number;
  max_modifier_groups_per_item: number;
  max_options_per_group: number;
}> {
  const { getSql } = await import("@/lib/db/client");
  const sql = getSql();
  const [limits] = await sql`
    SELECT max_modifier_groups, max_modifier_options, max_modifier_groups_per_item, max_options_per_group
    FROM merchant_modifier_subscription_limits WHERE plan_key = ${DEFAULT_PLAN}
  `;
  if (limits) {
    const L = limits as Record<string, unknown>;
    return {
      max_modifier_groups: Number(L.max_modifier_groups) ?? 20,
      max_modifier_options: Number(L.max_modifier_options) ?? 100,
      max_modifier_groups_per_item: Number(L.max_modifier_groups_per_item) ?? 10,
      max_options_per_group: Number(L.max_options_per_group) ?? 20,
    };
  }
  return {
    max_modifier_groups: 20,
    max_modifier_options: 100,
    max_modifier_groups_per_item: 10,
    max_options_per_group: 20,
  };
}

export { genId };
