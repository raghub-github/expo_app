/**
 * GET /api/merchant/stores/[id]/store-settings
 * Returns store settings for merchant portal (delivery, address, operations).
 *
 * PATCH /api/merchant/stores/[id]/store-settings
 * Body: { delivery_radius_km?, address?: { full_address?, landmark?, city?, state?, postal_code?, latitude?, longitude? }, auto_accept_orders?, preparation_buffer_minutes? }
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById, updateMerchantStore } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { insertActivityLog } from "@/lib/db/operations/merchant-portal-activity-logs";

export const runtime = "nodejs";

async function getAreaManagerId(userId: string, email: string) {
  if (await isSuperAdmin(userId, email)) return null;
  const systemUser = await getSystemUserByEmail(email);
  if (!systemUser) return null;
  const am = await getAreaManagerByUserId(systemUser.id);
  return am?.id ?? null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Merchant dashboard access required" }, { status: 403 });
    }
    const areaManagerId = await getAreaManagerId(user.id, user.email);
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }
    const sql = getSql();
    // Fetch delivery_radius_km directly from merchant_stores for this store (same access as getMerchantStoreById)
    let delivery_radius_km: number = 5;
    const radiusRows =
      areaManagerId != null
        ? await sql`
            SELECT delivery_radius_km FROM merchant_stores
            WHERE id = ${storeId} AND deleted_at IS NULL AND area_manager_id = ${areaManagerId}
            LIMIT 1
          `
        : await sql`
            SELECT delivery_radius_km FROM merchant_stores
            WHERE id = ${storeId} AND deleted_at IS NULL
            LIMIT 1
          `;
    const radiusRow = Array.isArray(radiusRows) ? radiusRows[0] : radiusRows;
    if (radiusRow && radiusRow.delivery_radius_km != null) {
      const r = Number(radiusRow.delivery_radius_km);
      delivery_radius_km = Number.isFinite(r) && r >= 1 && r <= 50 ? r : 5;
    }
    let platform_delivery = true;
    let self_delivery = false;
    const settingsRows = await sql`
      SELECT platform_delivery, self_delivery FROM merchant_store_settings WHERE store_id = ${storeId} LIMIT 1
    `;
    const settingsRow = Array.isArray(settingsRows) ? settingsRows[0] : settingsRows;
    if (settingsRow) {
      const s = settingsRow as Record<string, unknown>;
      platform_delivery = s.platform_delivery !== false;
      self_delivery = s.self_delivery === true;
    }
    const lat = store.latitude != null ? Number(store.latitude) : null;
    const lng = store.longitude != null ? Number(store.longitude) : null;
    return NextResponse.json({
      success: true,
      platform_delivery,
      self_delivery,
      delivery_radius_km,
      auto_accept_orders: store.is_accepting_orders ?? false,
      preparation_buffer_minutes: store.avg_preparation_time_minutes ?? 15,
      address: {
        full_address: store.full_address ?? null,
        landmark: store.landmark ?? null,
        city: store.city ?? null,
        state: store.state ?? null,
        postal_code: store.postal_code ?? null,
        latitude: lat,
        longitude: lng,
      },
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/store-settings]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Merchant dashboard access required" }, { status: 403 });
    }
    const areaManagerId = await getAreaManagerId(user.id, user.email);
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }
    const systemUser = await getSystemUserByEmail(user.email);
    const agentId = systemUser?.id ?? null;

    const body = await request.json().catch(() => ({}));
    const sql = getSql();
    const updates: Parameters<typeof updateMerchantStore>[2] = {};
    // Persist to merchant_stores.delivery_radius_km (replaces old value for this store). Accept number or string.
    if (body.delivery_radius_km !== undefined && body.delivery_radius_km !== null) {
      const raw = body.delivery_radius_km;
      const num = typeof raw === "number" ? raw : parseFloat(String(raw));
      if (Number.isNaN(num)) {
        return NextResponse.json({ success: false, error: "Delivery radius must be a number" }, { status: 400 });
      }
      if (num < 1 || num > 50) {
        return NextResponse.json({ success: false, error: "Delivery radius must be between 1 and 50 km" }, { status: 400 });
      }
      updates.delivery_radius_km = num;
    }
    if (typeof body.preparation_buffer_minutes === "number" && !Number.isNaN(body.preparation_buffer_minutes)) {
      updates.avg_preparation_time_minutes = body.preparation_buffer_minutes;
    }
    if (typeof body.auto_accept_orders === "boolean") {
      updates.is_accepting_orders = body.auto_accept_orders;
    }
    const addr = body.address;
    if (addr && typeof addr === "object") {
      if (addr.full_address !== undefined) updates.full_address = addr.full_address ?? null;
      if (addr.landmark !== undefined) updates.landmark = addr.landmark ?? null;
      if (addr.city !== undefined) updates.city = addr.city ?? null;
      if (addr.state !== undefined) updates.state = addr.state ?? null;
      if (addr.postal_code !== undefined) updates.postal_code = addr.postal_code ?? null;
      if (addr.latitude !== undefined) updates.latitude = addr.latitude != null ? Number(addr.latitude) : null;
      if (addr.longitude !== undefined) updates.longitude = addr.longitude != null ? Number(addr.longitude) : null;
    }
    if (typeof body.platform_delivery === "boolean" || typeof body.self_delivery === "boolean") {
      const cur = await sql`
        SELECT platform_delivery, self_delivery FROM merchant_store_settings WHERE store_id = ${storeId} LIMIT 1
      `;
      const curRow = Array.isArray(cur) ? cur[0] : cur;
      const nextPlatform = typeof body.platform_delivery === "boolean" ? body.platform_delivery : (curRow ? (curRow as Record<string, unknown>).platform_delivery !== false : true);
      const nextSelf = typeof body.self_delivery === "boolean" ? body.self_delivery : (curRow ? (curRow as Record<string, unknown>).self_delivery === true : false);
      await sql`
        INSERT INTO merchant_store_settings (store_id, platform_delivery, self_delivery)
        VALUES (${storeId}, ${nextPlatform}, ${nextSelf})
        ON CONFLICT (store_id) DO UPDATE SET
          platform_delivery = EXCLUDED.platform_delivery,
          self_delivery = EXCLUDED.self_delivery,
          updated_at = NOW()
      `;
      try {
        await insertActivityLog({
          storeId,
          agentId,
          changedSection: "delivery_settings",
          fieldName: "delivery_toggles",
          oldValue: curRow ? `platform_delivery: ${(curRow as Record<string, unknown>).platform_delivery !== false}; self_delivery: ${(curRow as Record<string, unknown>).self_delivery === true}` : null,
          newValue: `platform_delivery: ${nextPlatform}; self_delivery: ${nextSelf}`,
          actionType: "update",
        });
      } catch (logErr) {
        console.warn("[PATCH store-settings] delivery activity log failed:", logErr);
      }
    }
    if (Object.keys(updates).length === 0 && typeof body.platform_delivery !== "boolean" && typeof body.self_delivery !== "boolean") {
      return NextResponse.json({ success: true });
    }
    // Persist delivery_radius_km to merchant_stores (same access control as getMerchantStoreById). Only return success if a row was updated.
    let radiusUpdatedForLog: number | undefined;
    if ("delivery_radius_km" in updates && typeof updates.delivery_radius_km === "number") {
      const radiusUpdateResult =
        areaManagerId != null
          ? await sql`
              UPDATE merchant_stores SET delivery_radius_km = ${updates.delivery_radius_km}, updated_at = NOW()
              WHERE id = ${storeId} AND deleted_at IS NULL AND area_manager_id = ${areaManagerId}
              RETURNING id
            `
          : await sql`
              UPDATE merchant_stores SET delivery_radius_km = ${updates.delivery_radius_km}, updated_at = NOW()
              WHERE id = ${storeId} AND deleted_at IS NULL
              RETURNING id
            `;
      const radiusUpdated = Array.isArray(radiusUpdateResult) ? radiusUpdateResult.length > 0 : !!radiusUpdateResult;
      if (!radiusUpdated) {
        return NextResponse.json(
          { success: false, error: "Store not found or you do not have access to update this store." },
          { status: 404 }
        );
      }
      radiusUpdatedForLog = updates.delivery_radius_km;
      delete updates.delivery_radius_km;
    }
    const oldVal: Record<string, unknown> = {};
    if (radiusUpdatedForLog !== undefined) oldVal.delivery_radius_km = store.delivery_radius_km ?? null;
    if ("avg_preparation_time_minutes" in updates) oldVal.avg_preparation_time_minutes = store.avg_preparation_time_minutes ?? null;
    if ("is_accepting_orders" in updates) oldVal.auto_accept_orders = store.is_accepting_orders ?? false;
    if (addr && typeof addr === "object") {
      if (addr.full_address !== undefined) oldVal.full_address = store.full_address ?? null;
      if (addr.landmark !== undefined) oldVal.landmark = store.landmark ?? null;
      if (addr.city !== undefined) oldVal.city = store.city ?? null;
      if (addr.state !== undefined) oldVal.state = store.state ?? null;
      if (addr.postal_code !== undefined) oldVal.postal_code = store.postal_code ?? null;
      if (addr.latitude !== undefined) oldVal.latitude = store.latitude != null ? Number(store.latitude) : null;
      if (addr.longitude !== undefined) oldVal.longitude = store.longitude != null ? Number(store.longitude) : null;
    }
    const newVal: Record<string, unknown> = {};
    if (radiusUpdatedForLog !== undefined) newVal.delivery_radius_km = radiusUpdatedForLog;
    if ("avg_preparation_time_minutes" in updates) newVal.avg_preparation_time_minutes = updates.avg_preparation_time_minutes;
    if ("is_accepting_orders" in updates) newVal.auto_accept_orders = updates.is_accepting_orders;
    if ("full_address" in updates) newVal.full_address = updates.full_address;
    if ("landmark" in updates) newVal.landmark = updates.landmark;
    if ("city" in updates) newVal.city = updates.city;
    if ("state" in updates) newVal.state = updates.state;
    if ("postal_code" in updates) newVal.postal_code = updates.postal_code;
    if ("latitude" in updates) newVal.latitude = updates.latitude;
    if ("longitude" in updates) newVal.longitude = updates.longitude;

    const updated = await updateMerchantStore(storeId, areaManagerId, updates);
    if (!updated) {
      return NextResponse.json({ success: false, error: "Update failed" }, { status: 500 });
    }
    try {
      const fieldNames = [...Object.keys(updates), ...(radiusUpdatedForLog !== undefined ? ["delivery_radius_km"] : [])];
      await insertActivityLog({
        storeId,
        agentId,
        changedSection: "store_settings",
        fieldName: fieldNames.join(",") || "delivery_radius_km",
        oldValue: JSON.stringify(oldVal),
        newValue: JSON.stringify(newVal),
        actionType: "update",
      });
    } catch (logErr) {
      console.warn("[PATCH store-settings] activity log insert failed:", logErr);
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[PATCH /api/merchant/stores/[id]/store-settings]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
