/**
 * Categories CRUD for dashboard store menu.
 * PUT/DELETE /api/merchant/stores/[id]/menu/categories/[categoryId]
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { assertStoreAccess } from "../../assert-store-access";

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
      display_order?: number;
      is_active?: boolean;
    };
    const sql = getSql();
    const [existing] = await sql`
      SELECT category_name, category_description, category_image_url, parent_category_id, display_order, is_active
      FROM merchant_menu_categories
      WHERE id = ${catId} AND store_id = ${storeId}
      LIMIT 1
    `;
    if (!existing) return NextResponse.json({ success: false, error: "Category not found" }, { status: 404 });
    const e = existing as any;
    const name = body.category_name !== undefined ? body.category_name.trim() : e.category_name;
    if (!name) return NextResponse.json({ success: false, error: "category_name required" }, { status: 400 });

    await sql`
      UPDATE merchant_menu_categories
      SET category_name = ${name},
          category_description = ${body.category_description !== undefined ? body.category_description : e.category_description},
          category_image_url = ${body.category_image_url !== undefined ? body.category_image_url : e.category_image_url},
          parent_category_id = ${body.parent_category_id !== undefined ? body.parent_category_id : e.parent_category_id},
          display_order = ${body.display_order !== undefined ? body.display_order : e.display_order},
          is_active = ${body.is_active !== undefined ? body.is_active : e.is_active},
          updated_at = NOW()
      WHERE id = ${catId} AND store_id = ${storeId}
    `;
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
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
    const [countRow] = await sql`
      SELECT COUNT(*)::int AS c FROM merchant_menu_items WHERE category_id = ${catId} AND store_id = ${storeId} AND (is_deleted IS NULL OR is_deleted = false)
    `;
    const itemCount = Number((countRow as any)?.c ?? 0);
    if (itemCount > 0) {
      return NextResponse.json({ success: false, error: "category_has_items", itemCount }, { status: 400 });
    }

    const result = await sql`
      DELETE FROM merchant_menu_categories WHERE id = ${catId} AND store_id = ${storeId}
    `;
    if ((result as any)?.count === 0) {
      return NextResponse.json({ success: false, error: "Category not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[DELETE /api/merchant/stores/[id]/menu/categories/[categoryId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

