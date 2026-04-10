import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const storeId = parseInt(url.searchParams.get("storeId") ?? "", 10);
  const itemId = parseInt(url.searchParams.get("itemId") ?? "", 10);
  if (!Number.isInteger(storeId) || storeId < 1 || !Number.isInteger(itemId) || itemId < 1) {
    return NextResponse.json({ error: "storeId and itemId must be positive integers" }, { status: 400 });
  }

  try {
    const sql = getSql();
    const [item] = await sql<{
      id: number;
      store_id: number;
      item_name: string;
      base_price: string | number | null;
      selling_price: string | number | null;
      packaging_charges: string | number | null;
      in_stock: boolean | null;
      is_deleted: boolean | null;
    }[]>`
      SELECT id, store_id, item_name, base_price, selling_price, packaging_charges, in_stock, is_deleted
      FROM merchant_menu_items
      WHERE id = ${itemId} AND store_id = ${storeId}
      LIMIT 1
    `;
    if (!item) return NextResponse.json({ error: "Item not found for this store" }, { status: 404 });

    const addOnRows = await sql<{
      addon_id: string | null;
      addon_name: string | null;
      addon_price: string | number | null;
      in_stock: boolean | null;
    }[]>`
      SELECT a.addon_id, a.addon_name, a.addon_price, a.in_stock
      FROM merchant_menu_item_addons a
      INNER JOIN merchant_menu_item_customizations c ON c.id = a.customization_id
      WHERE c.menu_item_id = ${itemId}
      ORDER BY a.display_order ASC, a.id ASC
      LIMIT 5
    `;

    const price =
      item.selling_price != null && item.selling_price !== ""
        ? Number(item.selling_price)
        : Number(item.base_price ?? 0);

    const packAmt = Number(item.packaging_charges ?? 0) || 0;
    const simItem = {
      menuItemId: String(item.id),
      itemName: item.item_name,
      quantity: 1,
      basePrice: Number.isFinite(price) ? price : 0,
      addons: addOnRows
        .filter((a) => (a.in_stock ?? true) && a.addon_name != null)
        .map((a, idx) => ({
          addonId: a.addon_id ?? `addon-${idx + 1}`,
          addonName: a.addon_name ?? `Addon ${idx + 1}`,
          quantity: 1,
          addonPrice: Number(a.addon_price ?? 0) || 0,
        })),
      itemSnapshot: {
        packaging_enabled: packAmt > 0,
        packaging_charges: packAmt,
      },
      metadata: {
        storeId: item.store_id,
        packagingCharges: packAmt,
      },
    };

    return NextResponse.json({ item: simItem });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load item";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

