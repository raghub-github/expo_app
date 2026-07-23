import { getSql, withSqlRetry } from "../db/client.js";
import {
  buildCustomisationDetail,
  customizationLabelsForCustomer,
  findCartLineForOrderItem,
} from "./order-item-customisation.js";
import { readOrderItemSpecialInstructions } from "./order-item-special-instructions.js";

export type CustomerOrderDetailItem = {
  name: string;
  quantity: number;
  price: number;
  lineTotal?: number;
  menuItemId?: string | null;
  vegNonVeg?: string | null;
  variantName?: string | null;
  customization?: string | null;
  specialInstructions?: string | null;
};

type CoreItemRow = {
  id: number;
  menuItemId: number | string | null;
  itemName: string | null;
  quantity: number | null;
  totalPrice: unknown;
  basePrice?: unknown;
  addonPrice?: unknown;
  vegNonveg?: string | null;
  variantName?: string | null;
  itemSnapshot?: unknown;
  specialInstructions?: string | null;
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

async function loadAddonsByCoreItemIds(
  coreItemIds: number[],
): Promise<
  Map<number, Array<{ name: string; quantity: number; price: number }>>
> {
  const out = new Map<number, Array<{ name: string; quantity: number; price: number }>>();
  const ids = [...new Set(coreItemIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return out;

  try {
    const sql = getSql();
    const rows = await withSqlRetry(() =>
      sql<
        Array<{
          order_item_id: number;
          addon_name: string | null;
          quantity: number | null;
          addon_price: unknown;
        }>
      >`
      SELECT order_item_id, addon_name, quantity, addon_price
      FROM orders_core_item_addons
      WHERE order_item_id = ANY(${ids}::int[])
    `,
    );
    for (const row of rows) {
      const id = Number(row.order_item_id);
      if (!Number.isFinite(id)) continue;
      const name = (row.addon_name ?? "").trim() || "Add-on";
      const qty = Math.max(1, Number(row.quantity) || 1);
      const linePrice = num(row.addon_price);
      const unitPrice = qty > 0 ? linePrice / qty : linePrice;
      const list = out.get(id) ?? [];
      list.push({ name, quantity: qty, price: unitPrice });
      out.set(id, list);
    }
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "42P01") return out;
    throw err;
  }
  return out;
}

async function loadPendingCartLines(orderIdText: string): Promise<Record<string, unknown>[]> {
  const key = orderIdText.trim();
  if (!key) return [];
  try {
    const sql = getSql();
    const rows = await withSqlRetry(() =>
      sql<Array<{ items_snapshot: unknown }>>`
      SELECT items_snapshot
      FROM pending_orders
      WHERE finalized_order_id = ${key}
      ORDER BY id DESC
      LIMIT 1
    `,
    );
    return extractCartLines(rows[0]?.items_snapshot);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "42P01") return [];
    throw err;
  }
}

/** Batch-load latest pending cart snapshots for many orders (orders list). */
export async function loadPendingCartLinesByOrderIds(
  orderIdTexts: string[],
): Promise<Map<string, Record<string, unknown>[]>> {
  const out = new Map<string, Record<string, unknown>[]>();
  const keys = [...new Set(orderIdTexts.map((k) => k.trim()).filter(Boolean))];
  if (keys.length === 0) return out;

  try {
    const sql = getSql();
    const rows = await withSqlRetry(() =>
      sql<Array<{ finalized_order_id: string; items_snapshot: unknown }>>`
      SELECT DISTINCT ON (finalized_order_id)
        finalized_order_id,
        items_snapshot
      FROM pending_orders
      WHERE finalized_order_id = ANY(${keys}::text[])
      ORDER BY finalized_order_id, id DESC
    `,
    );
    for (const row of rows) {
      const key = String(row.finalized_order_id ?? "").trim();
      if (!key) continue;
      out.set(key, extractCartLines(row.items_snapshot));
    }
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "42P01") return out;
    throw err;
  }
  return out;
}

export async function loadAddonsByCoreItemIdsForOrders(
  coreItemIds: number[],
): Promise<Map<number, Array<{ name: string; quantity: number; price: number }>>> {
  return loadAddonsByCoreItemIds(coreItemIds);
}

/** Build customer-facing line items with variant size + add-ons from DB, cart snapshot, and item_snapshot. */
export async function buildCustomerOrderDetailItems(args: {
  orderIdText: string;
  coreItems: CoreItemRow[];
  itemsJsonFallback?: unknown;
  /** Skip pending_orders lookup when prefetched for orders list. */
  pendingCartLines?: Record<string, unknown>[];
  /** Skip addon query when prefetched for orders list. */
  addonsByItemId?: Map<number, Array<{ name: string; quantity: number; price: number }>>;
}): Promise<CustomerOrderDetailItem[]> {
  const { orderIdText, coreItems, itemsJsonFallback, pendingCartLines, addonsByItemId } = args;
  const coreItemIds = coreItems.map((i) => Number(i.id)).filter((id) => Number.isFinite(id) && id > 0);
  const addonsByItemIdResolved =
    addonsByItemId ?? (await loadAddonsByCoreItemIds(coreItemIds));
  const cartLines = mergeCartLines([
    pendingCartLines ?? (await loadPendingCartLines(orderIdText)),
    itemsJsonFallback,
  ]);

  return coreItems.map((row, lineIndex) => {
    const dbAddons = addonsByItemIdResolved.get(Number(row.id)) ?? [];
    const cartLine = findCartLineForOrderItem(cartLines, {
      lineIndex,
      menuItemId: row.menuItemId != null ? Number(row.menuItemId) : null,
      name: String(row.itemName ?? ""),
      variant: row.variantName ?? null,
    });
    const specialInstructions = readOrderItemSpecialInstructions({
      relational: row.specialInstructions,
      itemSnapshot: (row.itemSnapshot as Record<string, unknown> | null) ?? null,
      cartLine,
    });
    const detail = buildCustomisationDetail({
      variantName: row.variantName ?? null,
      basePrice: num(row.basePrice),
      itemSnapshot: (row.itemSnapshot as Record<string, unknown> | null) ?? null,
      cartLine,
      storedAddonPrice: num(row.addonPrice),
      addons: dbAddons,
      specialInstructions,
    });
    const { variantDisplay, addonLines } = customizationLabelsForCustomer(detail);
    const qty = row.quantity ?? 1;
    const lineTotal = Number(row.totalPrice ?? 0);
    return {
      name: row.itemName ?? "Item",
      quantity: qty,
      price: lineTotal / Math.max(qty, 1),
      lineTotal,
      menuItemId: row.menuItemId != null ? String(row.menuItemId) : null,
      vegNonVeg: null as string | null,
      variantName: variantDisplay,
      customization: addonLines.length > 0 ? addonLines.join(" · ") : null,
      specialInstructions,
    };
  });
}

/** Legacy orders_core.items JSON (no orders_core_items rows). */
export function buildCustomerOrderDetailItemsFromJson(
  itemsPayload: Array<{
    name?: string;
    item_name?: string;
    menuItemId?: string;
    item_id?: number;
    quantity?: number;
    price?: number;
    variantName?: string;
    variant?: string | null;
    addons?: Array<{ addonName?: string; name?: string; quantity?: number } | string>;
  }> | null,
): CustomerOrderDetailItem[] {
  return (
    itemsPayload?.map((i) => {
      const qty = i.quantity ?? 1;
      const unitPrice = i.price ?? 0;
      const variantRaw = (i.variantName ?? i.variant ?? "").trim() || null;
      const addonParts: string[] = [];
      for (const a of i.addons ?? []) {
        if (typeof a === "string") {
          const t = a.trim();
          if (t) addonParts.push(t);
          continue;
        }
        const label = (a.addonName ?? a.name ?? "").trim();
        if (!label) continue;
        const q = a.quantity ?? 1;
        addonParts.push(q > 1 ? `${label} ×${q}` : label);
      }
      return {
        name: i.name ?? i.item_name ?? i.menuItemId ?? "Item",
        quantity: qty,
        price: unitPrice,
        lineTotal: unitPrice * qty,
        menuItemId:
          i.menuItemId?.trim() ||
          (i.item_id != null ? String(i.item_id) : null),
        vegNonVeg: null as string | null,
        variantName: variantRaw,
        customization: addonParts.length > 0 ? addonParts.join(" · ") : null,
      };
    }) ?? []
  );
}
