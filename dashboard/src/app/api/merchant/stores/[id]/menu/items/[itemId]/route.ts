/**
 * Items CRUD for dashboard store menu.
 * GET/PUT/DELETE /api/merchant/stores/[id]/menu/items/[itemId]
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { assertStoreAccess } from "../../assert-store-access";

export const runtime = "nodejs";

/** GET single item with variants, customizations (with addons), images, linked_modifier_groups */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const storeId = parseInt(id, 10);
    const menuItemId = parseInt(itemId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(menuItemId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const sql = getSql();
    const [item] = await sql`
      SELECT id, item_id, item_name, item_description, item_image_url, short_name, category_id,
             food_type, spice_level, cuisine_type, base_price, selling_price, in_stock, is_active,
             is_deleted, display_order, has_customizations, has_addons, has_variants,
             preparation_time_minutes, serves, serves_label, item_size_value, item_size_unit,
             approval_status::text,
             (SELECT EXISTS(SELECT 1 FROM merchant_menu_item_change_requests r WHERE r.menu_item_id = merchant_menu_items.id AND r.status = 'PENDING')) AS has_pending_change_request,
             (SELECT request_type::text FROM merchant_menu_item_change_requests r WHERE r.menu_item_id = merchant_menu_items.id AND r.status = 'PENDING' ORDER BY r.created_at DESC LIMIT 1) AS pending_change_request_type
      FROM merchant_menu_items
      WHERE id = ${menuItemId} AND store_id = ${storeId}
      LIMIT 1
    `;
    if (!item) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });

    const [variants, customizationsRows, imagesRows] = await Promise.all([
      sql`
        SELECT id, variant_id, variant_name, variant_type, variant_price::text, is_default, display_order, in_stock
        FROM merchant_menu_item_variants WHERE menu_item_id = ${menuItemId} ORDER BY display_order ASC, id ASC
      `,
      sql`
        SELECT id, customization_id, customization_title, customization_type, is_required, min_selection, max_selection, display_order
        FROM merchant_menu_item_customizations WHERE menu_item_id = ${menuItemId} ORDER BY display_order ASC, id ASC
      `,
      sql`
        SELECT id, image_url, is_primary, display_order FROM merchant_menu_item_images
        WHERE menu_item_id = ${menuItemId} ORDER BY display_order ASC, id ASC
      `,
    ]);

    const customizations = customizationsRows as any[];
    const optionRows = await Promise.all(
      customizations.map((c: any) =>
        sql`
          SELECT id, addon_id, addon_name, addon_price::text, display_order, in_stock
          FROM merchant_menu_item_addons WHERE customization_id = ${c.id} ORDER BY display_order ASC, id ASC
        `
      )
    );
    const customizationsWithOptions = customizations.map((c: any, i: number) => ({
      id: c.id,
      customization_id: c.customization_id,
      customization_title: c.customization_title,
      customization_type: c.customization_type ?? null,
      is_required: c.is_required ?? false,
      min_selection: c.min_selection ?? 0,
      max_selection: c.max_selection ?? 1,
      display_order: c.display_order ?? 0,
      addons: (optionRows[i] as any[]).map((o: any) => ({
        id: o.id,
        addon_id: o.addon_id,
        addon_name: o.addon_name,
        addon_price: o.addon_price,
        display_order: o.display_order ?? 0,
        in_stock: o.in_stock ?? true,
      })),
    }));

    let linked_modifier_groups: any[] = [];
    try {
      const linkRows = await sql`
        SELECT img.id, img.modifier_group_id, img.display_order
        FROM merchant_item_modifier_groups img
        WHERE img.menu_item_id = ${menuItemId}
        ORDER BY img.display_order ASC, img.id ASC
      `;
      for (const link of linkRows as any[]) {
        const [g] = await sql`
          SELECT id, group_code, title, description, is_required, min_selection, max_selection
          FROM merchant_modifier_groups WHERE id = ${link.modifier_group_id}
        `;
        if (!g) continue;
        const opts = await sql`
          SELECT id, option_code, name, price_delta::text, in_stock, display_order
          FROM merchant_modifier_options WHERE modifier_group_id = ${link.modifier_group_id}
          ORDER BY display_order ASC, id ASC
        `;
        linked_modifier_groups.push({
          id: link.id,
          modifier_group_id: link.modifier_group_id,
          display_order: link.display_order,
          title: (g as any).title,
          description: (g as any).description,
          is_required: (g as any).is_required ?? false,
          min_selection: (g as any).min_selection ?? 0,
          max_selection: (g as any).max_selection ?? 1,
          options: (opts as any[]).map((o: any) => ({
            id: o.id,
            option_id: o.option_code ?? o.option_id,
            name: o.name,
            price_delta: o.price_delta,
            in_stock: o.in_stock ?? true,
            display_order: o.display_order ?? 0,
          })),
        });
      }
    } catch {
      linked_modifier_groups = [];
    }

    return NextResponse.json({
      success: true,
      item: {
        ...(item as any),
        variants: (variants as any[]).map((v: any) => ({
          ...v,
          variant_price: v.variant_price,
        })),
        customizations: customizationsWithOptions,
        images: imagesRows,
        linked_modifier_groups,
      },
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/menu/items/[itemId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const storeId = parseInt(id, 10);
    const menuItemId = parseInt(itemId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(menuItemId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const sql = getSql();
    const [existing] = await sql`
      SELECT item_name, item_description, category_id, food_type, spice_level, cuisine_type,
             base_price, selling_price, preparation_time_minutes, serves, serves_label,
             short_name, display_order, item_size_value, item_size_unit, available_for_delivery,
             in_stock, is_active
      FROM merchant_menu_items
      WHERE id = ${menuItemId} AND store_id = ${storeId} AND (is_deleted IS NULL OR is_deleted = false)
      LIMIT 1
    `;
    if (!existing) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
    const e = existing as any;
    const item_name = body.item_name !== undefined ? String(body.item_name).trim() : e.item_name;
    if (!item_name) return NextResponse.json({ success: false, error: "item_name required" }, { status: 400 });

    await sql`
      UPDATE merchant_menu_items
      SET item_name = ${item_name},
          item_description = ${body.item_description !== undefined ? body.item_description : e.item_description},
          category_id = ${body.category_id !== undefined ? body.category_id : e.category_id},
          food_type = ${body.food_type !== undefined ? body.food_type : e.food_type},
          spice_level = ${body.spice_level !== undefined ? body.spice_level : e.spice_level},
          cuisine_type = ${body.cuisine_type !== undefined ? body.cuisine_type : e.cuisine_type},
          base_price = ${body.base_price !== undefined ? body.base_price : e.base_price},
          selling_price = ${body.selling_price !== undefined ? body.selling_price : e.selling_price},
          preparation_time_minutes = ${body.preparation_time_minutes !== undefined ? body.preparation_time_minutes : e.preparation_time_minutes},
          serves = ${body.serves !== undefined ? body.serves : e.serves},
          serves_label = ${body.serves_label !== undefined ? body.serves_label : e.serves_label},
          short_name = ${body.short_name !== undefined ? body.short_name : e.short_name},
          display_order = ${body.display_order !== undefined ? body.display_order : e.display_order},
          item_size_value = ${body.item_size_value !== undefined ? body.item_size_value : e.item_size_value},
          item_size_unit = ${body.item_size_unit !== undefined ? body.item_size_unit : e.item_size_unit},
          available_for_delivery = ${body.available_for_delivery !== undefined ? body.available_for_delivery : e.available_for_delivery},
          in_stock = ${body.in_stock !== undefined ? body.in_stock : e.in_stock},
          is_active = ${body.is_active !== undefined ? body.is_active : e.is_active},
          updated_at = NOW()
      WHERE id = ${menuItemId} AND store_id = ${storeId}
    `;
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[PUT /api/merchant/stores/[id]/menu/items/[itemId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const storeId = parseInt(id, 10);
    const menuItemId = parseInt(itemId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(menuItemId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    const sql = getSql();
    const [item] = await sql`
      SELECT id, approval_status::text AS approval_status
      FROM merchant_menu_items
      WHERE id = ${menuItemId} AND store_id = ${storeId}
    `;
    if (!item) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });

    const approvalStatus = (item as any).approval_status as string | null;

    // Approved items: soft delete only (deprecate).
    if (approvalStatus === "APPROVED") {
      const result = await sql`
        UPDATE merchant_menu_items
        SET is_deleted = true, updated_at = NOW()
        WHERE id = ${menuItemId} AND store_id = ${storeId}
      `;
      if ((result as any)?.count === 0) {
        return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, ok: true, mode: "SOFT_DELETE" });
    }

    // Pending / rejected items: hard delete including images and their R2 objects.
    const images = (await sql`
      SELECT id, r2_key
      FROM merchant_menu_item_images
      WHERE menu_item_id = ${menuItemId}
    `) as { id: number; r2_key: string | null }[];

    await sql.begin(async (trx) => {
      await trx`
        DELETE FROM merchant_menu_item_images
        WHERE menu_item_id = ${menuItemId}
      `;
      await trx`
        DELETE FROM merchant_menu_items
        WHERE id = ${menuItemId} AND store_id = ${storeId}
      `;
    });

    if (images.length > 0) {
      try {
        const { deleteFileFromR2 } = await import("../../../../../../../../backend/src/services/r2.service");
        await Promise.all(
          images
            .map((img) => img.r2_key)
            .filter((key): key is string => !!key)
            .map((key) => deleteFileFromR2(key).catch(() => undefined))
        );
      } catch (e) {
        console.error("[DELETE items/[itemId]] R2 cleanup failed", e);
      }
    }

    return NextResponse.json({ success: true, ok: true, mode: "HARD_DELETE" });
  } catch (e) {
    console.error("[DELETE /api/merchant/stores/[id]/menu/items/[itemId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

