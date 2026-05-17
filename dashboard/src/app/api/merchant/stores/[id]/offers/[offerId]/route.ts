/**
 * PATCH /api/merchant/stores/[id]/offers/[offerId] - Update offer
 * DELETE /api/merchant/stores/[id]/offers/[offerId] - Delete offer (soft: set is_active = false)
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";
import { deleteDocument } from "@/lib/services/r2";

export const runtime = "nodejs";

function extractKeyFromProxyOrUrl(value: string): string | null {
  const v = (value || "").trim();
  if (!v) return null;
  // proxy format
  if (v.includes("/api/attachments/proxy") && v.includes("key=")) {
    try {
      const u = new URL(v, "http://dummy");
      const k = u.searchParams.get("key");
      return k ? decodeURIComponent(k) : null;
    } catch {
      return null;
    }
  }
  // full url => key = pathname
  if (v.startsWith("http://") || v.startsWith("https://")) {
    try {
      const u = new URL(v);
      return u.pathname.replace(/^\/+/, "") || null;
    } catch {
      return null;
    }
  }
  // already a key
  return v.replace(/^\/+/, "");
}

async function assertStoreAccess(storeId: number) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) {
    return { ok: false as const, status: 401, error: "Not authenticated" };
  }
  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) {
    return { ok: false as const, status: 403, error: "Merchant dashboard access required" };
  }
  let areaManagerId: number | null = null;
  if (!(await isSuperAdmin(user.id, user.email))) {
    const systemUser = await getSystemUserByEmail(user.email);
    if (systemUser) {
      const am = await getAreaManagerByUserId(systemUser.id);
      if (am) areaManagerId = am.id;
    }
  }
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) {
    return { ok: false as const, status: 404, error: "Store not found" };
  }
  return { ok: true as const, store };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; offerId: string }> }
) {
  try {
    const { id, offerId } = await params;
    const storeId = parseInt(id, 10);
    const offerIdNum = parseInt(offerId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(offerIdNum)) {
      return NextResponse.json({ success: false, error: "Invalid store or offer id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }
    const body = await request.json().catch(() => ({}));
    const sourcePlatformHeader = request.headers.get("x-source-platform") ?? "AGENT_DASHBOARD";
    const VALID_PLATFORMS = ["MERCHANT_APP","MERCHANT_PORTAL","ADMIN_DASHBOARD","AGENT_DASHBOARD","SYSTEM"];
    const updatedSourcePlatform = VALID_PLATFORMS.includes(sourcePlatformHeader) ? sourcePlatformHeader : "AGENT_DASHBOARD";

    // Determine caller role
    const { createServerSupabaseClient: getSupabase } = await import("@/lib/supabase/server");
    const { isSuperAdmin: checkAdmin } = await import("@/lib/permissions/engine");
    const supabaseCaller = await getSupabase();
    const { data: { user: caller } } = await supabaseCaller.auth.getUser();
    const isAdmin = caller ? await checkAdmin(caller.id, caller.email ?? "") : false;
    const updaterRole = isAdmin ? "ADMIN" : "AGENT";
    const { getSystemUserByEmail: getSysUser } = await import("@/lib/auth/user-mapping");
    const sysUser = caller?.email ? await getSysUser(caller.email) : null;
    const updatedByUserId: number | null = sysUser ? sysUser.id : null;
    const updatedByName =
      sysUser?.full_name?.trim() || caller?.email?.trim() || null;

    const sql = getSql();
    const [existing] = await sql`
      SELECT id, offer_metadata FROM merchant_offers WHERE id = ${offerIdNum} AND store_id = ${storeId}
    `;
    if (!existing) {
      return NextResponse.json({ success: false, error: "Offer not found" }, { status: 404 });
    }
    const {
      offer_title, offer_description, offer_type, offer_sub_type, menu_item_ids,
      offer_image_aspect_ratio, discount_value, discount_percentage,
      max_discount_amount, min_order_amount, max_order_amount,
      buy_quantity, get_quantity, coupon_code, offer_image_url, valid_from, valid_till,
      is_active, is_stackable, priority, first_order_only, new_user_only,
      max_uses_total, max_uses_per_user, applicable_on_days,
      applicable_time_start, applicable_time_end, offer_metadata,
    } = body;
    const updates: string[] = [
      "updated_at = NOW()",
      `updated_source_platform = '${updatedSourcePlatform}'`,
      `updated_by_role = '${updaterRole}'`,
      `updated_by_user_id = ${updatedByUserId ?? "NULL"}`,
    ];
    const values: unknown[] = [];
    let p = 1;
    if (updatedByName) {
      updates.push(`updated_by_name = $${p++}`);
      values.push(updatedByName);
    }
    if (offer_title !== undefined) { updates.push(`offer_title = $${p++}`); values.push(String(offer_title).trim()); }
    if (offer_description !== undefined) { updates.push(`offer_description = $${p++}`); values.push(offer_description == null || offer_description === "" ? null : String(offer_description)); }
    if (offer_sub_type !== undefined) { updates.push(`offer_sub_type = $${p++}`); values.push(String(offer_sub_type)); }
    if (coupon_code !== undefined) { updates.push(`coupon_code = $${p++}`); values.push(coupon_code == null || coupon_code === "" ? null : String(coupon_code)); }
    if (offer_image_url !== undefined) { updates.push(`offer_image_url = $${p++}`); values.push(offer_image_url == null || offer_image_url === "" ? null : String(offer_image_url)); }
    if (valid_from !== undefined) { updates.push(`valid_from = $${p++}`); values.push(new Date(valid_from).toISOString()); }
    if (valid_till !== undefined) { updates.push(`valid_till = $${p++}`); values.push(new Date(valid_till).toISOString()); }
    if (is_active !== undefined) { updates.push(`is_active = $${p++}`); values.push(Boolean(is_active)); }
    if (offer_type !== undefined) { updates.push(`offer_type = $${p++}`); values.push(offer_type); }
    if (is_stackable !== undefined) { updates.push(`is_stackable = $${p++}`); values.push(Boolean(is_stackable)); }
    if (priority !== undefined) { updates.push(`priority = $${p++}`); values.push(Number(priority)); }
    if (first_order_only !== undefined) { updates.push(`first_order_only = $${p++}`); values.push(Boolean(first_order_only)); }
    if (new_user_only !== undefined) { updates.push(`new_user_only = $${p++}`); values.push(Boolean(new_user_only)); }
    if (max_uses_total !== undefined) { updates.push(`max_uses_total = $${p++}`); values.push(max_uses_total == null || max_uses_total === "" ? null : Number(max_uses_total)); }
    if (max_uses_per_user !== undefined) { updates.push(`max_uses_per_user = $${p++}`); values.push(max_uses_per_user == null || max_uses_per_user === "" ? null : Number(max_uses_per_user)); }
    if (min_order_amount !== undefined) { updates.push(`min_order_amount = $${p++}`); values.push(min_order_amount === "" || min_order_amount == null ? null : Number(min_order_amount)); }
    if (max_order_amount !== undefined) { updates.push(`max_order_amount = $${p++}`); values.push(max_order_amount === "" || max_order_amount == null ? null : Number(max_order_amount)); }
    if (max_discount_amount !== undefined) { updates.push(`max_discount_amount = $${p++}`); values.push(max_discount_amount === "" || max_discount_amount == null ? null : Number(max_discount_amount)); }
    if (buy_quantity !== undefined) { updates.push(`buy_quantity = $${p++}`); values.push(buy_quantity == null ? null : Number(buy_quantity)); }
    if (get_quantity !== undefined) { updates.push(`get_quantity = $${p++}`); values.push(get_quantity == null ? null : Number(get_quantity)); }
    if (applicable_time_start !== undefined) { updates.push(`applicable_time_start = $${p++}`); values.push(applicable_time_start || null); }
    if (applicable_time_end !== undefined) { updates.push(`applicable_time_end = $${p++}`); values.push(applicable_time_end || null); }
    if (applicable_on_days !== undefined) { updates.push(`applicable_on_days = $${p++}`); values.push(Array.isArray(applicable_on_days) && applicable_on_days.length > 0 ? applicable_on_days : null); }
    // discount fields
    if (discount_percentage !== undefined && discount_percentage !== "") {
      updates.push(`discount_percentage = $${p++}`); values.push(Number(discount_percentage));
    }
    if (discount_value !== undefined && discount_value !== "") {
      updates.push(`discount_value = $${p++}`); values.push(Number(discount_value));
    }
    // metadata merge
    const needsMetaUpdate = menu_item_ids !== undefined || offer_image_aspect_ratio !== undefined || offer_metadata !== undefined;
    if (needsMetaUpdate) {
      const currentMeta = ((existing as any).offer_metadata as Record<string, unknown>) ?? {};
      const nextMeta: Record<string, unknown> = { ...currentMeta, ...(typeof offer_metadata === "object" && offer_metadata != null ? offer_metadata as Record<string, unknown> : {}) };
      if (menu_item_ids !== undefined) nextMeta.menu_item_ids = Array.isArray(menu_item_ids) ? menu_item_ids : null;
      if (offer_image_aspect_ratio !== undefined) {
        nextMeta.offer_image_aspect_ratio = offer_image_aspect_ratio == null || !Number.isFinite(Number(offer_image_aspect_ratio)) ? null : Number(offer_image_aspect_ratio);
      }
      updates.push(`offer_metadata = $${p++}::jsonb`);
      values.push(JSON.stringify(nextMeta));
    }
    if (updates.length <= 4) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }
    values.push(offerIdNum);
    const setClause = updates.join(", ");
    const sqlUnsafe = sql as { unsafe: (q: string, v?: unknown[]) => Promise<unknown[]> };
    const [updated] = await sqlUnsafe.unsafe(
      `UPDATE merchant_offers SET ${setClause} WHERE id = $${p} AND store_id = ${storeId} RETURNING id, offer_id, store_id, offer_title, offer_description, offer_sub_type, offer_type, coupon_code, offer_image_url, discount_value, discount_percentage, max_discount_amount, min_order_amount, max_order_amount, buy_quantity, get_quantity, is_stackable, priority, first_order_only, new_user_only, max_uses_total, max_uses_per_user, current_uses, applicable_on_days, applicable_time_start, applicable_time_end, created_source_platform, updated_source_platform, created_by_role, updated_by_role, approval_status, valid_from, valid_till, is_active, created_at, updated_at, created_by_name, updated_by_name`,
      values
    );
    if (!updated) {
      return NextResponse.json({ success: false, error: "Offer not found" }, { status: 404 });
    }
    try {
      await logStoreActivity({ storeId, section: "offer", action: "update", entityId: offerIdNum, summary: `Agent updated offer`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    return NextResponse.json({ success: true, offer: updated });
  } catch (e) {
    console.error("[PATCH /api/merchant/stores/[id]/offers/[offerId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; offerId: string }> }
) {
  try {
    const { id, offerId } = await params;
    const storeId = parseInt(id, 10);
    const offerIdNum = parseInt(offerId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(offerIdNum)) {
      return NextResponse.json({ success: false, error: "Invalid store or offer id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }
    const sql = getSql();

    // Read banner URL before soft-delete so we can remove the object from R2.
    const [offerRow] = await sql`
      SELECT offer_image_url
      FROM merchant_offers
      WHERE id = ${offerIdNum} AND store_id = ${storeId}
      LIMIT 1
    `;
    const oldOfferImageUrl = (offerRow as any)?.offer_image_url as string | null | undefined;
    const oldKey = oldOfferImageUrl ? extractKeyFromProxyOrUrl(oldOfferImageUrl) : null;

    const [updated] = await sql`
      UPDATE merchant_offers SET is_active = false, updated_at = NOW()
      WHERE id = ${offerIdNum} AND store_id = ${storeId}
      RETURNING id
    `;
    if (!updated) {
      return NextResponse.json({ success: false, error: "Offer not found" }, { status: 404 });
    }

    // Best-effort cleanup: banner deletion should never block the offer delete.
    if (oldKey) {
      deleteDocument(oldKey).catch(() => undefined);
    }

    try {
      await logStoreActivity({ storeId, section: "offer", action: "delete", entityId: offerIdNum, summary: `Agent deleted offer`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DELETE /api/merchant/stores/[id]/offers/[offerId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
