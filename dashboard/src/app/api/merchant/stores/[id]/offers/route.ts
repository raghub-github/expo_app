/**
 * GET /api/merchant/stores/[id]/offers - List offers for the store
 * POST /api/merchant/stores/[id]/offers - Create offer for the store
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getMerchantAccess } from "@/lib/permissions/merchant-access";
import { logActionByAuth, getIpAddress, getUserAgent } from "@/lib/audit/logger";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";

export const runtime = "nodejs";

const CANONICAL_OFFER_TYPES = [
  "PERCENTAGE","FLAT","CART_PERCENTAGE","CART_FLAT",
  "BUY_X_GET_Y","BUY_N_GET_M","BOGO","FREE_ITEM","FREE_DELIVERY","BUNDLE","TIERED","COUPON",
] as const;
type CanonicalOfferType = typeof CANONICAL_OFFER_TYPES[number];

function mapRowToOffer(row: Record<string, unknown>) {
  const id = Number(row.id);
  const offerId = String(row.offer_id ?? id);
  const offerType = (row.offer_type as string) || "PERCENTAGE";
  const discountValue = row.discount_value != null ? String(row.discount_value) : null;
  const discountPct = row.discount_percentage != null ? String(row.discount_percentage) : null;
  const meta = (row.offer_metadata as Record<string, unknown>) ?? {};
  const metaMenuIds = (meta.menu_item_ids as string[] | null) ?? (row.menu_item_ids as string[] | null) ?? null;
  const rawAspectRatio = meta.offer_image_aspect_ratio;
  const offer_image_aspect_ratio = rawAspectRatio == null ? null : Number.isFinite(Number(rawAspectRatio)) ? Number(rawAspectRatio) : null;
  const effectiveSubType = (row.offer_sub_type as string) || (metaMenuIds && metaMenuIds.length ? "SPECIFIC_ITEM" : "ALL_ORDERS");
  const safeType: CanonicalOfferType = (CANONICAL_OFFER_TYPES as readonly string[]).includes(offerType) ? offerType as CanonicalOfferType : "PERCENTAGE";
  return {
    id,
    offer_id: offerId,
    store_id: row.store_id != null ? Number(row.store_id) : 0,
    offer_title: (row.offer_title as string) || "",
    offer_description: (row.offer_description as string) ?? null,
    offer_type: safeType,
    offer_sub_type: effectiveSubType as "ALL_ORDERS" | "SPECIFIC_ITEM",
    menu_item_ids: metaMenuIds,
    discount_value: discountValue,
    discount_percentage: discountPct,
    max_discount_amount: row.max_discount_amount != null ? String(row.max_discount_amount) : null,
    min_order_amount: row.min_order_amount != null ? String(row.min_order_amount) : null,
    max_order_amount: row.max_order_amount != null ? String(row.max_order_amount) : null,
    buy_quantity: row.buy_quantity != null ? Number(row.buy_quantity) : null,
    get_quantity: row.get_quantity != null ? Number(row.get_quantity) : null,
    coupon_code: (row.coupon_code as string) ?? (meta.coupon_code as string) ?? null,
    image_url: (row.offer_image_url as string) ?? (row.image_url as string) ?? null,
    offer_image_aspect_ratio,
    valid_from: row.valid_from != null ? new Date(row.valid_from as string | Date).toISOString() : new Date().toISOString(),
    valid_till: row.valid_till != null ? new Date(row.valid_till as string | Date).toISOString() : new Date().toISOString(),
    is_active: row.is_active != null ? Boolean(row.is_active) : true,
    auto_apply: row.auto_apply != null ? Boolean(row.auto_apply) : true,
    is_stackable: row.is_stackable != null ? Boolean(row.is_stackable) : false,
    priority: row.priority != null ? Number(row.priority) : 0,
    per_order_limit: row.per_order_limit != null ? Number(row.per_order_limit) : null,
    first_order_only: row.first_order_only != null ? Boolean(row.first_order_only) : false,
    new_user_only: row.new_user_only != null ? Boolean(row.new_user_only) : false,
    max_uses_total: row.max_uses_total != null ? Number(row.max_uses_total) : null,
    max_uses_per_user: row.max_uses_per_user != null ? Number(row.max_uses_per_user) : null,
    current_uses: row.current_uses != null ? Number(row.current_uses) : 0,
    applicable_on_days: Array.isArray(row.applicable_on_days) ? row.applicable_on_days : null,
    applicable_time_start: (row.applicable_time_start as string) ?? null,
    applicable_time_end: (row.applicable_time_end as string) ?? null,
    offer_metadata: meta,
    created_source_platform: (row.created_source_platform as string) ?? null,
    updated_source_platform: (row.updated_source_platform as string) ?? null,
    created_by_role: (row.created_by_role as string) ?? null,
    updated_by_role: (row.updated_by_role as string) ?? null,
    approval_status: (row.approval_status as string) ?? null,
    created_at: (row.created_at as string) || new Date().toISOString(),
    updated_at: (row.updated_at as string) || (row.created_at as string) || new Date().toISOString(),
    created_by_name: (row.created_by_name as string) ?? null,
    updated_by_name: (row.updated_by_name as string) ?? null,
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
  const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });
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
        discount_value, discount_percentage, max_discount_amount, min_order_amount, max_order_amount,
        buy_quantity, get_quantity, coupon_code, offer_image_url, offer_metadata,
        auto_apply, is_stackable, priority, per_order_limit,
        first_order_only, new_user_only,
        max_uses_total, max_uses_per_user, current_uses,
        applicable_on_days, applicable_time_start, applicable_time_end,
        created_source_platform, updated_source_platform, created_by_role, updated_by_role, approval_status,
        valid_from, valid_till, is_active,
        created_at, updated_at, created_by_name, updated_by_name
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
      offer_title, offer_description, offer_type, offer_sub_type, menu_item_ids,
      offer_image_aspect_ratio, discount_value, discount_percentage, max_discount_amount,
      min_order_amount, max_order_amount, buy_quantity, get_quantity, coupon_code,
      offer_image_url, valid_from, valid_till, is_active = true,
      max_uses_total, max_uses_per_user, is_stackable, priority,
      first_order_only, new_user_only, applicable_on_days,
      applicable_time_start, applicable_time_end, offer_metadata,
    } = body;
    if (!offer_title || !valid_from || !valid_till) {
      return NextResponse.json({ success: false, error: "Offer title and validity dates required" }, { status: 400 });
    }
    if (new Date(valid_from) >= new Date(valid_till)) {
      return NextResponse.json({ success: false, error: "Valid till must be after valid from" }, { status: 400 });
    }
    const type: CanonicalOfferType = (CANONICAL_OFFER_TYPES as readonly string[]).includes(offer_type) ? offer_type as CanonicalOfferType : "PERCENTAGE";
    const isPct = ["PERCENTAGE", "CART_PERCENTAGE"].includes(type);
    const discountValueNum = discount_value !== "" && discount_value != null ? Number(discount_value) : null;
    const discountPctNum = discount_percentage !== "" && discount_percentage != null ? Number(discount_percentage) : null;

    // Determine caller role from session
    const supabase2 = await createServerSupabaseClient();
    const { data: { user: caller } } = await supabase2.auth.getUser();
    const isAdmin = caller ? await isSuperAdmin(caller.id, caller.email ?? "") : false;
    let callerRole = "AGENT";
    let managedByAgent: number | null = null;
    let approvedByAdmin: number | null = null;
    let approvalStatus = "PENDING";
    let createdByUserId: number | null = null;
    const { getSystemUserByEmail: getSysUser } = await import("@/lib/auth/user-mapping");
    const sysUser = caller?.email ? await getSysUser(caller.email) : null;
    if (sysUser) createdByUserId = sysUser.id;
    const createdByName =
      sysUser?.full_name?.trim() || caller?.email?.trim() || null;
    if (isAdmin) {
      callerRole = "ADMIN";
      approvalStatus = "APPROVED";
      if (sysUser) approvedByAdmin = sysUser.id;
    } else {
      approvalStatus = "AUTO_APPROVED";
      if (sysUser) {
        const { getAreaManagerByUserId: getAM } = await import("@/lib/area-manager/auth");
        const am = await getAM(sysUser.id);
        if (am) managedByAgent = am.id;
      }
    }
    const sourcePlatformHeader = request.headers.get("x-source-platform") ?? "AGENT_DASHBOARD";
    const VALID_PLATFORMS = ["MERCHANT_APP","MERCHANT_PORTAL","ADMIN_DASHBOARD","AGENT_DASHBOARD","SYSTEM"];
    const createdSourcePlatform = VALID_PLATFORMS.includes(sourcePlatformHeader) ? sourcePlatformHeader : "AGENT_DASHBOARD";

    const sql = getSql();
    const offerIdCode = (coupon_code && type === "COUPON")
      ? String(coupon_code).trim().toUpperCase().replace(/\s+/g, "_")
      : `OFF-${storeId}-${Date.now()}`;

    // Build merged metadata
    const baseMeta: Record<string, unknown> = typeof offer_metadata === "object" && offer_metadata != null ? { ...(offer_metadata as Record<string, unknown>) } : {};
    if (menu_item_ids != null) baseMeta.menu_item_ids = Array.isArray(menu_item_ids) ? menu_item_ids : null;
    if (offer_image_aspect_ratio != null && Number.isFinite(Number(offer_image_aspect_ratio))) {
      baseMeta.offer_image_aspect_ratio = Number(offer_image_aspect_ratio);
    }

    const sqlAny = sql as any;
    const [inserted] = await sqlAny`
      INSERT INTO merchant_offers (
        offer_id, offer_title, store_id, offer_type, offer_sub_type,
        discount_value, discount_percentage, max_discount_amount,
        min_order_amount, max_order_amount,
        buy_quantity, get_quantity, coupon_code,
        offer_image_url, offer_metadata,
        auto_apply, is_stackable, priority, first_order_only, new_user_only,
        max_uses_total, max_uses_per_user,
        applicable_on_days, applicable_time_start, applicable_time_end,
        valid_from, valid_till, is_active,
        created_source_platform, created_by_role, approval_status,
        created_by_user_id, managed_by_agent, approved_by_admin, created_by_name
      )
      VALUES (
        ${offerIdCode}, ${String(offer_title).trim()}, ${storeId}, ${type}, ${String(offer_sub_type ?? "ALL_ORDERS")},
        ${isPct ? null : discountValueNum}, ${isPct ? discountPctNum : (discountPctNum ?? null)}, ${max_discount_amount != null ? Number(max_discount_amount) : null},
        ${min_order_amount !== "" && min_order_amount != null ? Number(min_order_amount) : null},
        ${max_order_amount !== "" && max_order_amount != null ? Number(max_order_amount) : null},
        ${buy_quantity != null ? Number(buy_quantity) : null}, ${get_quantity != null ? Number(get_quantity) : null},
        ${coupon_code ?? null},
        ${offer_image_url ?? null},
        ${Object.keys(baseMeta).length ? JSON.stringify(baseMeta) : null},
        true, ${Boolean(is_stackable)}, ${priority != null ? Number(priority) : 0},
        ${Boolean(first_order_only)}, ${Boolean(new_user_only)},
        ${max_uses_total != null ? Number(max_uses_total) : null}, ${max_uses_per_user != null ? Number(max_uses_per_user) : null},
        ${Array.isArray(applicable_on_days) && applicable_on_days.length > 0 ? applicable_on_days : null},
        ${applicable_time_start ?? null}, ${applicable_time_end ?? null},
        ${new Date(valid_from).toISOString()}, ${new Date(valid_till).toISOString()}, ${Boolean(is_active)},
        ${createdSourcePlatform}, ${callerRole}, ${approvalStatus},
        ${createdByUserId}, ${managedByAgent}, ${approvedByAdmin}, ${createdByName}
      )
      RETURNING *
    `;
    if (!inserted) {
      return NextResponse.json({ success: false, error: "Failed to create offer" }, { status: 500 });
    }
    const row = inserted as Record<string, unknown>;
    const offer = mapRowToOffer({
      ...row,
      offer_description: offer_description ?? null,
      menu_item_ids: menu_item_ids ?? null,
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
