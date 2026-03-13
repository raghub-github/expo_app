/**
 * POST /api/merchant-menu/change-requests/[id]/approve
 * Approve a change request and apply update or delete (agent/superadmin).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

const ALLOWED_ITEM_UPDATE_KEYS = new Set([
  "item_name", "item_description", "category_id", "food_type", "spice_level", "cuisine_type",
  "base_price", "selling_price", "preparation_time_minutes", "serves", "serves_label", "short_name",
  "display_order", "is_active", "allergens", "item_size_value", "item_size_unit", "available_for_delivery",
  "weight_per_serving", "weight_per_serving_unit", "calories_kcal", "protein", "protein_unit",
  "carbohydrates", "carbohydrates_unit", "fat", "fat_unit", "fibre", "fibre_unit", "item_tags",
]);

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    const superAdmin = await isSuperAdmin(user.id, user.email);
    const hasMerchant = await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT");
    if (!superAdmin && !hasMerchant) {
      return NextResponse.json({ success: false, error: "Agent or admin access required" }, { status: 403 });
    }

    const { id } = await params;
    const reqId = parseInt(id, 10);
    if (!Number.isFinite(reqId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const sql = getSql();
    const [req] = await sql`
      SELECT id, store_id, menu_item_id, request_type::text, status::text, requested_payload
      FROM merchant_menu_item_change_requests WHERE id = ${reqId}
    `;
    if (!req) {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }
    const r = req as { id: number; store_id: number; menu_item_id: number | null; request_type: string; status: string; requested_payload: Record<string, unknown> };
    if (r.status !== "PENDING") {
      return NextResponse.json({ success: false, error: "Request is not pending" }, { status: 400 });
    }

    const storeIdNum = Number(r.store_id);
    const menuItemId = r.menu_item_id != null ? Number(r.menu_item_id) : null;
    const payload = r.requested_payload ?? {};

    if (r.request_type === "UPDATE" && menuItemId != null) {
      const allowed: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(payload)) {
        if (ALLOWED_ITEM_UPDATE_KEYS.has(k)) allowed[k] = v;
      }
      const keys = Object.keys(allowed);
      const values = Object.values(allowed);
      if (keys.length > 0) {
        const setParts = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
        const query = `UPDATE merchant_menu_items SET ${setParts}, updated_at = NOW(), approval_status = 'APPROVED'::merchant_menu_item_approval_status, approved_at = NOW(), approved_by = $${keys.length + 3} WHERE id = $${keys.length + 1} AND store_id = $${keys.length + 2}`;
        await (sql as { unsafe: (q: string, v: unknown[]) => Promise<unknown> }).unsafe(query, [...values, menuItemId, storeIdNum, user.email]);
      } else {
        await sql`
          UPDATE merchant_menu_items
          SET approval_status = 'APPROVED'::merchant_menu_item_approval_status, approved_at = NOW(), approved_by = ${user.email}, updated_at = NOW()
          WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
        `;
      }
    } else if (r.request_type === "DELETE" && menuItemId != null) {
      await sql`
        UPDATE merchant_menu_items
        SET is_deleted = true, updated_at = NOW()
        WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
      `;
    }

    await sql`
      UPDATE merchant_menu_item_change_requests
      SET status = 'APPROVED'::merchant_menu_item_change_request_status,
          reviewed_by = ${user.email}, reviewed_by_role = 'agent', updated_at = NOW()
      WHERE id = ${reqId}
    `;

    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[POST /api/merchant-menu/change-requests/[id]/approve]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
