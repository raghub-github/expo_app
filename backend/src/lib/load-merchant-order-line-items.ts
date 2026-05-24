import type { Sql } from "postgres";
import {
  buildCustomisationDetail,
  customizationLabelsForMerchant,
  findCartLineForOrderItem,
  merchantItemBreakdownFromDetail,
  type MerchantItemCustomizationLine,
} from "./order-item-customisation.js";

export type MerchantOrderLineItem = {
  qty: number;
  name: string;
  price: number;
  veg_nonveg?: string | null;
  customizations?: string[];
  variant_tag?: string | null;
  category_name?: string | null;
  customization_lines?: MerchantItemCustomizationLine[];
  base_amount?: number;
  customizations_total?: number;
  has_customizations?: boolean;
};

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function extractCartLines(raw: unknown): Record<string, unknown>[] {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (Array.isArray(parsed)) {
    return parsed.map((r) =>
      r && typeof r === "object" ? (r as Record<string, unknown>) : {},
    );
  }
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    for (const key of ["items", "order_items", "cart_items"]) {
      if (Array.isArray(o[key])) {
        return (o[key] as unknown[]).map((r) =>
          r && typeof r === "object" ? (r as Record<string, unknown>) : {},
        );
      }
    }
  }
  return [];
}

function mergeCartLines(sources: unknown[]): Record<string, unknown>[] {
  let best: Record<string, unknown>[] = [];
  for (const src of sources) {
    const arr = extractCartLines(src);
    if (arr.length > best.length) best = arr;
  }
  return best;
}

function displayName(baseName: string, variant: string | null): string {
  const base = baseName.trim() || "Item";
  const v = (variant ?? "").trim();
  return v ? `${base} (${v})` : base;
}

/**
 * Load orders_core_items (+ addons, cart snapshot) with merchant-facing customization labels.
 */
export async function loadMerchantOrderLineItemsByTextIds(
  sql: Sql,
  orderTextIds: string[],
): Promise<Map<string, MerchantOrderLineItem[]>> {
  const unique = [...new Set(orderTextIds.map((t) => String(t ?? "").trim()).filter(Boolean))];
  const out = new Map<string, MerchantOrderLineItem[]>();
  if (unique.length === 0) return out;

  type CoreItemRow = {
    id: number;
    order_id: string;
    menu_item_id: number | null;
    item_name: string;
    variant_name: string | null;
    category_name: string | null;
    quantity: number;
    base_price: unknown;
    addon_price: unknown;
    total_price: unknown;
    veg_nonveg: string | null;
    item_snapshot: Record<string, unknown> | null;
  };

  const itemRows = (await sql`
    SELECT id, order_id, menu_item_id, item_name, variant_name, category_name, quantity,
      base_price, addon_price, total_price, veg_nonveg, item_snapshot
    FROM orders_core_items
    WHERE order_id = ANY(${unique})
    ORDER BY id ASC
  `) as CoreItemRow[];

  if (!itemRows.length) return out;

  const itemIds = itemRows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
  const addonsByItemId = new Map<
    number,
    Array<{
      addon_name: string | null;
      quantity: number;
      addon_price: unknown;
    }>
  >();
  if (itemIds.length > 0) {
    const addonRows = await sql<
      Array<{
        id: number;
        order_item_id: number;
        addon_name: string | null;
        quantity: number;
        addon_price: unknown;
        menu_addon_id: string | null;
      }>
    >`
      SELECT id, order_item_id, addon_name, quantity, addon_price, menu_addon_id
      FROM orders_core_item_addons
      WHERE order_item_id = ANY(${itemIds})
    `;
    const addonPkIds = addonRows.map((a) => Number(a.id)).filter((id) => Number.isFinite(id) && id > 0);
    const snapshotByAddonPk = new Map<
      number,
      { merchant_base_price: unknown; customer_visible_price: unknown }
    >();
    if (addonPkIds.length > 0) {
      try {
        const snapRows = await sql<
          Array<{
            order_item_addon_id: number;
            merchant_base_price: unknown;
            customer_visible_price: unknown;
          }>
        >`
          SELECT order_item_addon_id, merchant_base_price, customer_visible_price
          FROM order_item_addon_commission_snapshots
          WHERE order_item_addon_id = ANY(${addonPkIds})
        `;
        for (const s of snapRows) {
          snapshotByAddonPk.set(Number(s.order_item_addon_id), s);
        }
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code !== "42P01") throw err;
      }
    }
    for (const a of addonRows) {
      const id = Number(a.order_item_id);
      if (!Number.isFinite(id)) continue;
      const snap = snapshotByAddonPk.get(Number(a.id));
      const qty = Math.max(1, Number(a.quantity) || 1);
      const unitMerchant = snap != null ? num(snap.merchant_base_price) : num(a.addon_price);
      const list = addonsByItemId.get(id) ?? [];
      list.push({
        ...a,
        addon_price: unitMerchant * qty,
      });
      addonsByItemId.set(id, list);
    }
  }

  const pendingRows = await sql<
    Array<{ finalized_order_id: string; items_snapshot: unknown }>
  >`
    SELECT DISTINCT ON (finalized_order_id) finalized_order_id, items_snapshot
    FROM pending_orders
    WHERE finalized_order_id = ANY(${unique})
    ORDER BY finalized_order_id, id DESC
  `;
  const cartByOrderText = new Map<string, Record<string, unknown>[]>();
  for (const p of pendingRows) {
    const key = String(p.finalized_order_id ?? "").trim();
    if (!key) continue;
    cartByOrderText.set(key, extractCartLines(p.items_snapshot));
  }

  const grouped = new Map<string, CoreItemRow[]>();
  for (const row of itemRows) {
    const oid = String(row.order_id);
    const list = grouped.get(oid) ?? [];
    list.push(row);
    grouped.set(oid, list);
  }

  for (const [oid, rows] of grouped) {
    const cartLines = cartByOrderText.get(oid) ?? [];
    const lines: MerchantOrderLineItem[] = rows.map((row, lineIndex) => {
      const dbAddons = addonsByItemId.get(Number(row.id)) ?? [];
      const cartLine = findCartLineForOrderItem(cartLines, {
        lineIndex,
        menuItemId: row.menu_item_id != null ? Number(row.menu_item_id) : null,
        name: String(row.item_name ?? ""),
        variant: row.variant_name,
      });
      const detail = buildCustomisationDetail({
        variantName: row.variant_name,
        basePrice: num(row.base_price),
        itemSnapshot: row.item_snapshot,
        cartLine,
        storedAddonPrice: num(row.addon_price),
        addons: dbAddons.map((a) => ({
          name: String(a.addon_name ?? "Add-on").trim(),
          quantity: Math.max(1, Number(a.quantity) || 1),
          price: num(a.addon_price),
          type: null,
        })),
      });
      const customizations = customizationLabelsForMerchant(detail);
      const qty = Number(row.quantity) || 1;
      const breakdown = merchantItemBreakdownFromDetail(
        detail,
        qty,
        num(row.base_price),
      );
      const lineTotal = num(row.total_price ?? row.base_price) || breakdown.lineTotal;
      const categoryFromRow = String(row.category_name ?? "").trim() || null;
      const veg =
        row.veg_nonveg != null && String(row.veg_nonveg).trim() !== ""
          ? String(row.veg_nonveg).trim()
          : null;
      const hasCust =
        breakdown.lines.length > 0 || (customizations?.length ?? 0) > 0;
      return {
        qty,
        name: String(row.item_name ?? "Item").trim() || "Item",
        price: lineTotal,
        veg_nonveg: veg,
        customizations: customizations.length ? customizations : undefined,
        variant_tag: breakdown.variantTag,
        category_name: categoryFromRow ?? breakdown.categoryName,
        customization_lines: breakdown.lines.length ? breakdown.lines : undefined,
        base_amount: breakdown.baseAmount,
        customizations_total: breakdown.customizationsTotal,
        captured_base_amount: Math.round((num(row.base_price) * qty) * 100) / 100,
        captured_addon_amount:
          Math.round((num(row.addon_price) || breakdown.customizationsTotal) * 100) /
          100,
        has_customizations: hasCust,
      };
    });
    out.set(oid, lines);
  }

  return out;
}
