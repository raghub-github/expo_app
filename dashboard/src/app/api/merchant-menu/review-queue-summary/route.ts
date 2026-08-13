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
      FROM merchant_menu_item_review_requests r
      WHERE r.status = 'PENDING'::merchant_menu_item_review_request_status
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

    let photo_items: Array<{
      id: number;
      store_id: number | null;
      store_name: string | null;
      store_public_id: string | null;
      item_name: string;
      selling_price: number | null;
      item_image_url: string | null;
      approval_status: string | null;
      primary_image_moderation_status: string | null;
    }> = [];
    if (pending_photo_reviews > 0) {
      try {
      const photoRows = await sql`
        SELECT
          m.id,
          m.store_id,
          COALESCE(NULLIF(TRIM(s.store_display_name), ''), s.store_name) AS store_name,
          s.store_id AS store_public_id,
          m.item_name,
          m.selling_price,
          COALESCE(
            NULLIF(TRIM(m.item_image_url), ''),
            (
              SELECT img.image_url
              FROM merchant_menu_item_images img
              WHERE img.menu_item_id = m.id
              ORDER BY img.is_primary DESC, img.id ASC
              LIMIT 1
            )
          ) AS item_image_url,
          m.approval_status::text,
          (
            SELECT UPPER(TRIM(COALESCE(img.moderation_status, 'PENDING')))
            FROM merchant_menu_item_images img
            WHERE img.menu_item_id = m.id AND img.is_primary = true
            LIMIT 1
          ) AS primary_image_moderation_status
        FROM merchant_menu_items m
        LEFT JOIN merchant_stores s ON s.id = m.store_id
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
        ORDER BY m.updated_at DESC NULLS LAST, m.id DESC
        LIMIT 100
      `;
      photo_items = (Array.isArray(photoRows) ? photoRows : []).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: Number(r.id),
          store_id: r.store_id != null ? Number(r.store_id) : null,
          store_name: r.store_name != null ? String(r.store_name) : null,
          store_public_id: r.store_public_id != null ? String(r.store_public_id) : null,
          item_name: String(r.item_name ?? "Item"),
          selling_price: r.selling_price != null ? Number(r.selling_price) : null,
          item_image_url: r.item_image_url != null ? String(r.item_image_url) : null,
          approval_status: r.approval_status != null ? String(r.approval_status) : null,
          primary_image_moderation_status:
            r.primary_image_moderation_status != null
              ? String(r.primary_image_moderation_status)
              : null,
        };
      });
      } catch (photoErr) {
        console.error("[GET /api/merchant-menu/review-queue-summary] photo_items", photoErr);
      }
    }

    return NextResponse.json({
      success: true,
      pending_change_requests,
      pending_photo_reviews,
      total_pending: pending_change_requests + pending_photo_reviews,
      photo_items,
    });
  } catch (e) {
    console.error("[GET /api/merchant-menu/review-queue-summary]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
