/**
 * POST — upload addon image (R2 + proxy URL in DB)
 * DELETE — remove addon image (R2 + clear addon_image_url)
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { assertStoreAccess } from "../../../assert-store-access";
import { uploadWithKey } from "@/lib/services/r2";
import { validateMenuItemSquareImage } from "@/lib/menuItemImageValidation";
import { deleteR2ObjectForStoredUrl } from "@/lib/r2-proxy-url";
import { randomUUID } from "crypto";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";

export const runtime = "nodejs";

function buildStoredImageUrl(r2Key: string): string {
  return `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;
}

function extFromName(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  const ext = (m?.[1] || "jpg").toLowerCase();
  return ["jpg", "jpeg", "png", "webp"].includes(ext) ? (ext === "jpeg" ? "jpg" : ext) : "jpg";
}

async function loadAddonRow(sql: ReturnType<typeof getSql>, storeId: number, oId: number) {
  const [row] = await sql`
    SELECT a.id, a.addon_id, a.addon_image_url, m.item_id, s.store_id
    FROM merchant_menu_item_addons a
    INNER JOIN merchant_menu_item_customizations c ON c.id = a.customization_id
    INNER JOIN merchant_menu_items m ON m.id = c.menu_item_id AND m.store_id = ${storeId}
    INNER JOIN merchant_stores s ON s.id = m.store_id
    WHERE a.id = ${oId}
    LIMIT 1
  `;
  return row as
    | {
        addon_id: string;
        addon_image_url: string | null;
        item_id: string;
        store_id: string | number;
      }
    | undefined;
}

export async function POST(
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

    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    const sql = getSql();
    const row = await loadAddonRow(sql, storeId, oId);
    if (!row) {
      return NextResponse.json({ success: false, error: "Customization option not found" }, { status: 404 });
    }

    const storePublicId = String(row.store_id ?? storeId);
    const itemPublicId = String(row.item_id);
    const addonPublicId = String(row.addon_id);

    const ext = extFromName(file.name);
    const fileId = randomUUID();
    const r2Key = `merchant-menu/stores/${storePublicId}/items/${itemPublicId}/addons/${addonPublicId}/${fileId}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const dim = validateMenuItemSquareImage(buffer);
    if (!dim.ok) {
      return NextResponse.json({ success: false, error: dim.error }, { status: 400 });
    }

    await deleteR2ObjectForStoredUrl(row.addon_image_url);

    await uploadWithKey(file, r2Key);
    const imageUrl = buildStoredImageUrl(r2Key);

    await sql`
      UPDATE merchant_menu_item_addons
      SET addon_image_url = ${imageUrl}, updated_at = NOW()
      WHERE id = ${oId}
    `;

    // Bump parent menu item so version fingerprint changes and delta sync / realtime picks it up.
    await sql`
      UPDATE merchant_menu_items mi
      SET updated_at = NOW()
      FROM merchant_menu_item_customizations c
      WHERE c.menu_item_id = mi.id
        AND c.id = (SELECT customization_id FROM merchant_menu_item_addons WHERE id = ${oId})
        AND mi.store_id = ${storeId}
    `.catch(() => { /* non-fatal */ });

    try {
      await logStoreActivity({
        storeId,
        section: "addon",
        action: "update",
        entityId: oId,
        summary: `Agent uploaded image for addon option #${oId}`,
        actorType: "agent",
        source: "dashboard",
      });
    } catch (_) {}

    return NextResponse.json({ success: true, image_url: imageUrl, r2_key: r2Key }, { status: 201 });
  } catch (e) {
    console.error("[POST customization-options/[optionId]/images]", e);
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
    const row = await loadAddonRow(sql, storeId, oId);
    if (!row) {
      return NextResponse.json({ success: false, error: "Customization option not found" }, { status: 404 });
    }

    await deleteR2ObjectForStoredUrl(row.addon_image_url);

    await sql`
      UPDATE merchant_menu_item_addons
      SET addon_image_url = NULL, updated_at = NOW()
      WHERE id = ${oId}
    `;

    // Bump parent menu item so version fingerprint changes and delta sync / realtime picks it up.
    await sql`
      UPDATE merchant_menu_items mi
      SET updated_at = NOW()
      FROM merchant_menu_item_customizations c
      WHERE c.menu_item_id = mi.id
        AND c.id = (SELECT customization_id FROM merchant_menu_item_addons WHERE id = ${oId})
        AND mi.store_id = ${storeId}
    `.catch(() => { /* non-fatal */ });

    try {
      await logStoreActivity({
        storeId,
        section: "addon",
        action: "update",
        entityId: oId,
        summary: `Agent removed image for addon option #${oId}`,
        actorType: "agent",
        source: "dashboard",
      });
    } catch (_) {}

    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[DELETE customization-options/[optionId]/images]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
