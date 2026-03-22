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
    const sql = getSql();
    const [existing] = await sql`
      SELECT id, offer_metadata FROM merchant_offers WHERE id = ${offerIdNum} AND store_id = ${storeId}
    `;
    if (!existing) {
      return NextResponse.json({ success: false, error: "Offer not found" }, { status: 404 });
    }
    const {
      offer_title,
      offer_description,
      offer_type,
      offer_sub_type,
      menu_item_ids,
      offer_image_aspect_ratio,
      discount_value,
      min_order_amount,
      buy_quantity,
      get_quantity,
      coupon_code,
      offer_image_url,
      valid_from,
      valid_till,
      is_active,
    } = body;
    const updates: string[] = ["updated_at = NOW()"];
    const values: unknown[] = [];
    let p = 1;
    if (offer_title !== undefined) {
      updates.push(`offer_title = $${p++}`);
      values.push(String(offer_title).trim());
    }
    if (offer_description !== undefined) {
      updates.push(`offer_description = $${p++}`);
      values.push(offer_description == null || offer_description === "" ? null : String(offer_description));
    }
    if (offer_sub_type !== undefined) {
      updates.push(`offer_sub_type = $${p++}`);
      values.push(String(offer_sub_type));
    }
    if (coupon_code !== undefined) {
      updates.push(`coupon_code = $${p++}`);
      values.push(coupon_code == null || coupon_code === "" ? null : String(coupon_code));
    }
    if (offer_image_url !== undefined) {
      updates.push(`offer_image_url = $${p++}`);
      values.push(offer_image_url == null || offer_image_url === "" ? null : String(offer_image_url));
    }
    if (valid_from !== undefined) {
      updates.push(`valid_from = $${p++}`);
      values.push(new Date(valid_from).toISOString());
    }
    if (valid_till !== undefined) {
      updates.push(`valid_till = $${p++}`);
      values.push(new Date(valid_till).toISOString());
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${p++}`);
      values.push(Boolean(is_active));
    }
    if (offer_type !== undefined) {
      updates.push(`offer_type = $${p++}`);
      values.push(offer_type);
    }
    if (menu_item_ids !== undefined || offer_image_aspect_ratio !== undefined) {
      // Keep offer targeting + rendering metadata consistent across platforms: store both inside offer_metadata.
      const currentMeta = ((existing as any).offer_metadata as Record<string, unknown>) ?? {};
      const nextMeta: Record<string, unknown> = { ...currentMeta };
      if (menu_item_ids !== undefined) {
        nextMeta.menu_item_ids = Array.isArray(menu_item_ids) ? menu_item_ids : null;
      }
      if (offer_image_aspect_ratio !== undefined) {
        nextMeta.offer_image_aspect_ratio =
          offer_image_aspect_ratio == null || !Number.isFinite(Number(offer_image_aspect_ratio))
            ? null
            : Number(offer_image_aspect_ratio);
      }
      updates.push(`offer_metadata = $${p++}::jsonb`);
      values.push(JSON.stringify(nextMeta));
    }
    if (discount_value !== undefined && discount_value !== "") {
      const type = offer_type ?? "PERCENTAGE";
      if (type === "PERCENTAGE") {
        updates.push(`discount_percentage = $${p++}`);
        updates.push(`discount_value = NULL`);
        values.push(Number(discount_value));
      } else {
        updates.push(`discount_value = $${p++}`);
        updates.push(`discount_percentage = NULL`);
        values.push(Number(discount_value));
      }
    }
    if (min_order_amount !== undefined) {
      updates.push(`min_order_amount = $${p++}`);
      values.push(min_order_amount === "" || min_order_amount == null ? null : Number(min_order_amount));
    }
    if (buy_quantity !== undefined) {
      updates.push(`buy_quantity = $${p++}`);
      values.push(buy_quantity == null ? null : Number(buy_quantity));
    }
    if (get_quantity !== undefined) {
      updates.push(`get_quantity = $${p++}`);
      values.push(get_quantity == null ? null : Number(get_quantity));
    }
    if (updates.length <= 1) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }
    values.push(offerIdNum);
    const setClause = updates.join(", ");
    const sqlUnsafe = sql as { unsafe: (q: string, v?: unknown[]) => Promise<unknown[]> };
    const [updated] = await sqlUnsafe.unsafe(
      `UPDATE merchant_offers SET ${setClause} WHERE id = $${p} AND store_id = ${storeId} RETURNING id, offer_id, store_id, offer_title, offer_description, offer_sub_type, coupon_code, offer_image_url, offer_type, discount_value, discount_percentage, min_order_amount, valid_from, valid_till, is_active, created_at, updated_at`,
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
