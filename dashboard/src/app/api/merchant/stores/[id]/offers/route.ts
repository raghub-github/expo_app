/**
 * GET /api/merchant/stores/[id]/offers - List offers for the store
 * POST /api/merchant/stores/[id]/offers - Create offer for the store
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getMerchantAccess } from "@/lib/permissions/merchant-access";
import { logActionByAuth, getIpAddress, getUserAgent } from "@/lib/audit/logger";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";

export const runtime = "nodejs";

function mapRowToOffer(row: Record<string, unknown>) {
  const id = Number(row.id);
  const offerId = String(row.offer_id ?? id);
  const offerType = (row.offer_type as string) || "PERCENTAGE";
  const discountValue = row.discount_value != null ? String(row.discount_value) : null;
  const discountPct = row.discount_percentage != null ? Number(row.discount_percentage) : null;
  const meta = (row.offer_metadata as Record<string, unknown>) ?? {};
  const metaMenuIds = (meta.menu_item_ids as string[] | null) ?? (row.menu_item_ids as string[] | null) ?? null;
  const rawAspectRatio = meta.offer_image_aspect_ratio;
  const offer_image_aspect_ratio =
    rawAspectRatio == null
      ? null
      : Number.isFinite(Number(rawAspectRatio))
        ? Number(rawAspectRatio)
        : null;
  const effectiveSubType =
    (row.offer_sub_type as string) ||
    (metaMenuIds && metaMenuIds.length ? "SPECIFIC_ITEM" : "ALL_ORDERS");
  return {
    id,
    offer_id: offerId,
    store_id: row.store_id != null ? Number(row.store_id) : 0,
    offer_title: (row.offer_title as string) || "",
    offer_description: (row.offer_description as string) ?? null,
    offer_type: ["BUY_N_GET_M", "PERCENTAGE", "FLAT", "COUPON", "FREE_ITEM"].includes(offerType) ? offerType : "PERCENTAGE",
    offer_sub_type: effectiveSubType as "ALL_ORDERS" | "SPECIFIC_ITEM",
    menu_item_ids: metaMenuIds,
    discount_value: discountValue ?? (discountPct != null ? String(discountPct) : null),
    min_order_amount: row.min_order_amount != null ? String(row.min_order_amount) : null,
    buy_quantity: row.buy_quantity != null ? Number(row.buy_quantity) : null,
    get_quantity: row.get_quantity != null ? Number(row.get_quantity) : null,
    coupon_code: (meta.coupon_code as string) ?? (row.coupon_code as string) ?? null,
    image_url: (row.offer_image_url as string) ?? (row.image_url as string) ?? null,
    offer_image_aspect_ratio,
    valid_from: (row.valid_from as string) || new Date().toISOString(),
    valid_till: (row.valid_till as string) || new Date().toISOString(),
    is_active: row.is_active != null ? Boolean(row.is_active) : true,
    created_at: (row.created_at as string) || new Date().toISOString(),
    updated_at: (row.updated_at as string) || (row.created_at as string) || new Date().toISOString(),
  };
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
  return { ok: true as const, store, user: { id: user.id, email: user.email } };
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
    const sql = getSql();
    const rows = await sql`
      SELECT id, offer_id, store_id, offer_title, offer_description, offer_type, offer_sub_type,
        discount_value, discount_percentage, min_order_amount, buy_quantity, get_quantity, coupon_code,
        offer_image_url, offer_metadata,
        valid_from, valid_till, is_active, created_at, updated_at
      FROM merchant_offers
      WHERE store_id = ${storeId}
      ORDER BY created_at DESC
    `;
    const raw = Array.isArray(rows) ? rows : [rows];
    const offers = raw.map((r) => mapRowToOffer(r as Record<string, unknown>));
    return NextResponse.json({
      success: true,
      offers,
      store_name: access.store?.store_name ?? access.store?.store_display_name ?? null,
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/offers]", e);
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
    const merchantAccess = await getMerchantAccess(access.user.id, access.user.email);
    if (!merchantAccess) {
      return NextResponse.json({ success: false, error: "Merchant access required" }, { status: 403 });
    }
    if (!merchantAccess.can_update_offers) {
      return NextResponse.json({ success: false, error: "Permission denied: cannot update offers" }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
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
      is_active = true,
    } = body;
    if (!offer_title || !valid_from || !valid_till) {
      return NextResponse.json({ success: false, error: "Offer title and validity dates required" }, { status: 400 });
    }
    if (new Date(valid_from) >= new Date(valid_till)) {
      return NextResponse.json({ success: false, error: "Valid till must be after valid from" }, { status: 400 });
    }
    const type = ["BUY_N_GET_M", "PERCENTAGE", "FLAT", "COUPON", "FREE_ITEM"].includes(offer_type) ? offer_type : "PERCENTAGE";
    const discountNum = discount_value !== "" && discount_value != null ? Number(discount_value) : null;
    const isPct = type === "PERCENTAGE";
    const sql = getSql();
    const offerIdCode = (coupon_code && type === "COUPON")
      ? String(coupon_code).trim().toUpperCase().replace(/\s+/g, "_")
      : `OFF-${storeId}-${Date.now()}`;
    const meta: Record<string, unknown> = {};
    if (menu_item_ids != null) meta.menu_item_ids = Array.isArray(menu_item_ids) ? menu_item_ids : null;
    if (offer_image_aspect_ratio != null && Number.isFinite(Number(offer_image_aspect_ratio))) {
      meta.offer_image_aspect_ratio = Number(offer_image_aspect_ratio);
    }
    if (coupon_code != null) meta.coupon_code = coupon_code;
    const [inserted] = await sql`
      INSERT INTO merchant_offers (
        offer_id, offer_title, store_id, offer_type,
        discount_value, discount_percentage, min_order_amount,
        buy_quantity, get_quantity, coupon_code,
        offer_image_url, offer_metadata,
        valid_from, valid_till, is_active
      )
      VALUES (
        ${offerIdCode},
        ${String(offer_title).trim()},
        ${storeId},
        ${type},
        ${isPct ? null : discountNum},
        ${isPct ? discountNum : null},
        ${min_order_amount !== "" && min_order_amount != null ? Number(min_order_amount) : null},
        ${buy_quantity != null ? Number(buy_quantity) : null},
        ${get_quantity != null ? Number(get_quantity) : null},
        ${coupon_code ?? null},
        ${offer_image_url ?? null},
        ${Object.keys(meta).length ? JSON.stringify(meta) : null},
        ${new Date(valid_from).toISOString()},
        ${new Date(valid_till).toISOString()},
        ${Boolean(is_active)}
      )
      RETURNING id, offer_id, store_id, offer_title, offer_type, discount_value, discount_percentage,
        min_order_amount, buy_quantity, get_quantity, coupon_code, offer_image_url, offer_metadata,
        valid_from, valid_till, is_active, created_at, updated_at
    `;
    if (!inserted) {
      return NextResponse.json({ success: false, error: "Failed to create offer" }, { status: 500 });
    }
    const row = inserted as Record<string, unknown>;
    const offer = mapRowToOffer({
      ...row,
      offer_description: offer_description ?? null,
      offer_sub_type: offer_sub_type ?? "ALL_ORDERS",
      menu_item_ids: menu_item_ids ?? null,
      buy_quantity: buy_quantity != null ? Number(buy_quantity) : null,
      get_quantity: get_quantity != null ? Number(get_quantity) : null,
      coupon_code: coupon_code ?? null,
      offer_image_url: offer_image_url ?? (row as any).offer_image_url ?? null,
      updated_at: (row as any).updated_at ?? row.created_at,
    });
    await logStoreActivity({
      storeId, section: "offer", action: "create",
      entityId: offer.id, entityName: String(offer_title).trim(),
      summary: `Agent created offer "${String(offer_title).trim()}" (${type})`,
      actorType: "agent", source: "dashboard",
    });
    await logActionByAuth(
      access.user.id,
      access.user.email,
      "MERCHANT",
      "CREATE",
      {
        resourceType: "OFFER",
        resourceId: String(offer.id),
        actionDetails: { storeId, offerTitle: String(offer_title).trim(), offerType: type },
        newValues: { offerId: offer.id },
        ipAddress: getIpAddress(request),
        userAgent: getUserAgent(request),
        requestPath: `/api/merchant/stores/${storeId}/offers`,
        requestMethod: "POST",
      }
    );
    return NextResponse.json({ success: true, offer }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/offers]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
