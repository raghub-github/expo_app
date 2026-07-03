/**
 * GET /api/merchant-menu/review-queue-summary
 * Combined pending counts for menu change requests + photo reviews (PENDING item photos).
 * Query: storeId — optional public store_id (GMMC1025) or internal numeric store id.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

async function resolveStoreIdNum(storeParam: string | null): Promise<number | null> {
  if (!storeParam?.trim()) return null;
  const sql = getSql();
  const trimmed = storeParam.trim();
  if (/^\d+$/.test(trimmed)) {
    const id = parseInt(trimmed, 10);
    const [row] = await sql`SELECT id FROM merchant_stores WHERE id = ${id} LIMIT 1`;
    return row ? Number((row as { id: number }).id) : null;
  }
  const [row] = await sql`SELECT id FROM merchant_stores WHERE store_id = ${trimmed} LIMIT 1`;
  return row ? Number((row as { id: number }).id) : null;
}

export async function GET(request: NextRequest) {
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

    const storeParam = new URL(request.url).searchParams.get("storeId");
    const storeIdNum = await resolveStoreIdNum(storeParam);
    if (storeParam?.trim() && storeIdNum == null) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const sql = getSql();
    const storeCond = storeIdNum != null ? sql`AND r.store_id = ${storeIdNum}` : sql``;
    const itemStoreCond = storeIdNum != null ? sql`AND m.store_id = ${storeIdNum}` : sql``;

    const [crRow] = await sql`
      SELECT COUNT(*)::int AS c
      FROM merchant_menu_item_change_requests r
      WHERE r.status = 'PENDING'::merchant_menu_item_change_request_status
      ${storeCond}
    `;

    const [photoRow] = await sql`
      SELECT COUNT(*)::int AS c
      FROM merchant_menu_items m
      WHERE COALESCE(m.is_deleted, FALSE) = FALSE
        AND (
          m.approval_status = 'PENDING'::merchant_menu_item_approval_status
          OR EXISTS (
            SELECT 1
            FROM merchant_menu_item_images img
            WHERE img.menu_item_id = m.id
              AND img.is_primary = true
              AND UPPER(TRIM(COALESCE(img.moderation_status, 'PENDING'))) = 'PENDING'
          )
        )
        AND (
          NULLIF(TRIM(m.item_image_url), '') IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM merchant_menu_item_images img
            WHERE img.menu_item_id = m.id
          )
        )
        ${itemStoreCond}
    `;

    const pending_change_requests = Number((crRow as { c?: number })?.c ?? 0);
    const pending_photo_reviews = Number((photoRow as { c?: number })?.c ?? 0);

    return NextResponse.json({
      success: true,
      pending_change_requests,
      pending_photo_reviews,
      total_pending: pending_change_requests + pending_photo_reviews,
    });
  } catch (e) {
    console.error("[GET /api/merchant-menu/review-queue-summary]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
