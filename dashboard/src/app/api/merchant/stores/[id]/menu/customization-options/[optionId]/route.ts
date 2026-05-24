/**
 * Update/delete a customization option (addon). PUT/DELETE /api/merchant/stores/[id]/menu/customization-options/[optionId]
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { mergeBool, mergeNum, mergeOptionalStr } from "@/lib/db/sql-json-body";
import { assertStoreAccess } from "../../assert-store-access";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";
import { deleteR2ObjectForStoredUrl } from "@/lib/r2-proxy-url";

export const runtime = "nodejs";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; optionId: string }> }
) {
  try {
    const { id, optionId } = await params;
    const storeId = parseInt(id, 10);
    const oId = parseInt(optionId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(oId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const sql = getSql();
    const [o] = await sql`
      SELECT a.id, a.addon_name, a.addon_price, a.addon_image_url,
             a.addon_size_value::text, a.addon_size_unit, a.in_stock, a.display_order
      FROM merchant_menu_item_addons a
      INNER JOIN merchant_menu_item_customizations c ON c.id = a.customization_id
      INNER JOIN merchant_menu_items m ON m.id = c.menu_item_id AND m.store_id = ${storeId}
      WHERE a.id = ${oId}
      LIMIT 1
    `;
    if (!o) return NextResponse.json({ success: false, error: "Customization option not found" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const e = o as any;
    const addon_name = body.addon_name !== undefined ? String(body.addon_name).trim() : e.addon_name;
    if (!addon_name) return NextResponse.json({ success: false, error: "addon_name required" }, { status: 400 });
    const addon_price = body.addon_price !== undefined ? Number(body.addon_price) : Number(e.addon_price);
    if (!Number.isFinite(addon_price) || addon_price < 0) {
      return NextResponse.json({ success: false, error: "Invalid addon_price" }, { status: 400 });
    }

    const clearingImage =
      body.addon_image_url === null ||
      (body.addon_image_url !== undefined && String(body.addon_image_url).trim() === "");
    const addon_image_url = clearingImage
      ? null
      : mergeOptionalStr(body.addon_image_url, e.addon_image_url);
    if (clearingImage && e.addon_image_url) {
      await deleteR2ObjectForStoredUrl(e.addon_image_url);
    }
    const addon_size_value =
      body.addon_size_value !== undefined
        ? body.addon_size_value == null || body.addon_size_value === ""
          ? null
          : Number(body.addon_size_value)
        : e.addon_size_value != null
          ? Number(e.addon_size_value)
          : null;
    const addon_size_unit =
      body.addon_size_unit !== undefined
        ? body.addon_size_unit == null || String(body.addon_size_unit).trim() === ""
          ? null
          : String(body.addon_size_unit).trim()
        : e.addon_size_unit;
    const in_stock = mergeBool(body.in_stock, e.in_stock);
    const display_order = mergeNum(body.display_order, e.display_order);

    await sql`
      UPDATE merchant_menu_item_addons
      SET addon_name = ${addon_name},
          addon_price = ${addon_price},
          addon_image_url = ${addon_image_url},
          addon_size_value = ${Number.isFinite(addon_size_value as number) ? addon_size_value : null},
          addon_size_unit = ${addon_size_unit},
          in_stock = ${in_stock},
          display_order = ${display_order},
          updated_at = NOW()
      WHERE id = ${oId}
    `;
    try {
      await logStoreActivity({ storeId, section: "addon", action: "update", entityId: oId, summary: `Agent updated addon option #${oId}`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[PUT /api/merchant/stores/[id]/menu/customization-options/[optionId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; optionId: string }> }
) {
  try {
    const { id, optionId } = await params;
    const storeId = parseInt(id, 10);
    const oId = parseInt(optionId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(oId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const sql = getSql();
    const [o] = await sql`
      SELECT a.id, a.addon_image_url FROM merchant_menu_item_addons a
      INNER JOIN merchant_menu_item_customizations c ON c.id = a.customization_id
      INNER JOIN merchant_menu_items m ON m.id = c.menu_item_id AND m.store_id = ${storeId}
      WHERE a.id = ${oId}
      LIMIT 1
    `;
    if (!o) return NextResponse.json({ success: false, error: "Customization option not found" }, { status: 404 });

    await deleteR2ObjectForStoredUrl((o as { addon_image_url?: string | null }).addon_image_url);
    await sql`DELETE FROM merchant_menu_item_addons WHERE id = ${oId}`;
    try {
      await logStoreActivity({ storeId, section: "addon", action: "delete", entityId: oId, summary: `Agent deleted addon option #${oId}`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[DELETE /api/merchant/stores/[id]/menu/customization-options/[optionId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
