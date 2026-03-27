/**
 * Categories CRUD for dashboard store menu.
 * PUT/DELETE /api/merchant/stores/[id]/menu/categories/[categoryId]
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import {
  mergeBool,
  mergeNum,
  mergeNumNullable,
  mergeOptionalStr,
} from "@/lib/db/sql-json-body";
import { assertStoreAccess } from "../../assert-store-access";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";
import {
  validateCategoryUpdate,
  resolveStoreTypeForMenu,
  CategoryRuleError,
} from "@/lib/db/operations/menu-category-rules";

export const runtime = "nodejs";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; categoryId: string }> }
) {
  try {
    const { id, categoryId } = await params;
    const storeId = parseInt(id, 10);
    const catId = parseInt(categoryId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(catId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const body = (await request.json().catch(() => ({}))) as {
      category_name?: string;
      category_description?: string | null;
      category_image_url?: string | null;
      parent_category_id?: number | null;
      cuisine_id?: number | null;
      display_order?: number;
      is_active?: boolean;
    };
    const sql = getSql();
    const [existing] = await sql`
      SELECT category_name, category_description, category_image_url, parent_category_id, cuisine_id, display_order, is_active,
             COALESCE(is_deleted, FALSE) AS is_deleted
      FROM merchant_menu_categories
      WHERE id = ${catId} AND store_id = ${storeId}
      LIMIT 1
    `;
    if (!existing) return NextResponse.json({ success: false, error: "Category not found" }, { status: 404 });
    const e = existing as Record<string, unknown>;
    if (e.is_deleted === true) {
      return NextResponse.json({ success: false, error: "Category not found" }, { status: 404 });
    }
    const name = body.category_name !== undefined ? String(body.category_name).trim() : String(e.category_name);
    if (!name) return NextResponse.json({ success: false, error: "category_name required" }, { status: 400 });

    const storeType = await resolveStoreTypeForMenu(storeId);
    await validateCategoryUpdate({
      storeIdNum: storeId,
      storeType,
      categoryId: catId,
      cuisine_id: body.cuisine_id,
    });

    const category_description = mergeOptionalStr(body.category_description, e.category_description);
    const category_image_url = mergeOptionalStr(body.category_image_url, e.category_image_url);
    const parent_category_id = mergeNumNullable(body.parent_category_id, e.parent_category_id);
    const cuisine_id = mergeNumNullable(body.cuisine_id, e.cuisine_id);
    const display_order = mergeNum(body.display_order, e.display_order);
    const is_active = mergeBool(body.is_active, e.is_active);

    try {
      const result = await sql`
        UPDATE merchant_menu_categories
        SET category_name = ${name},
            category_description = ${category_description},
            category_image_url = ${category_image_url},
            parent_category_id = ${parent_category_id},
            cuisine_id = ${cuisine_id},
            display_order = ${display_order},
            is_active = ${is_active},
            updated_at = NOW()
        WHERE id = ${catId} AND store_id = ${storeId}
          AND COALESCE(is_deleted, FALSE) = FALSE
      `;
      if ((result as { count?: number })?.count === 0) {
        return NextResponse.json({ success: false, error: "Category not found" }, { status: 404 });
      }
    } catch (upd: unknown) {
      const msg = String((upd as Error)?.message || upd);
      if (msg.includes("duplicate") || (upd as { code?: string })?.code === "23505") {
        return NextResponse.json(
          {
            success: false,
            error: "duplicate_category_name",
            message: "A category with this name already exists",
          },
          { status: 409 }
        );
      }
      throw upd;
    }
    try {
      await logStoreActivity({ storeId, section: "category", action: "update", entityId: catId, summary: `Agent updated category #${catId}`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    if (e instanceof CategoryRuleError) {
      return NextResponse.json(
        { success: false, error: e.code, message: e.message },
        { status: e.httpStatus }
      );
    }
    console.error("[PUT /api/merchant/stores/[id]/menu/categories/[categoryId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; categoryId: string }> }
) {
  try {
    const { id, categoryId } = await params;
    const storeId = parseInt(id, 10);
    const catId = parseInt(categoryId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(catId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const sql = getSql();
    const [exists] = await sql`
      SELECT 1 FROM merchant_menu_categories
      WHERE id = ${catId} AND store_id = ${storeId}
        AND COALESCE(is_deleted, FALSE) = FALSE
      LIMIT 1
    `;
    if (!exists) {
      return NextResponse.json({ success: false, error: "Category not found" }, { status: 404 });
    }

    const [subRow] = await sql<{ c: string }[]>`
      SELECT COUNT(*)::text AS c FROM merchant_menu_categories
      WHERE store_id = ${storeId} AND parent_category_id = ${catId}
        AND COALESCE(is_deleted, FALSE) = FALSE
    `;
    const subCount = Number(subRow?.c ?? 0);
    if (subCount > 0) {
      return NextResponse.json(
        { success: false, error: "category_has_subcategories", subcategoryCount: subCount },
        { status: 400 }
      );
    }

    const [countRow] = await sql`
      SELECT COUNT(*)::int AS c FROM merchant_menu_items WHERE category_id = ${catId} AND store_id = ${storeId} AND (is_deleted IS NULL OR is_deleted = false)
    `;
    const itemCount = Number((countRow as { c?: number })?.c ?? 0);
    if (itemCount > 0) {
      return NextResponse.json({ success: false, error: "category_has_items", itemCount }, { status: 400 });
    }

    const result = await sql`
      UPDATE merchant_menu_categories
      SET is_deleted = TRUE, updated_at = NOW()
      WHERE id = ${catId} AND store_id = ${storeId}
        AND COALESCE(is_deleted, FALSE) = FALSE
    `;
    if ((result as { count?: number })?.count === 0) {
      return NextResponse.json({ success: false, error: "Category not found" }, { status: 404 });
    }
    try {
      await logStoreActivity({ storeId, section: "category", action: "delete", entityId: catId, summary: `Agent deleted category #${catId}`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[DELETE /api/merchant/stores/[id]/menu/categories/[categoryId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

