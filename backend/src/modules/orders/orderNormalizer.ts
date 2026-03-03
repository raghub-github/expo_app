/**
 * Order payload validation and normalization.
 * Ensures no NaN, invalid ids, or missing required fields reach the DB.
 * Fail fast: return error if any item is invalid.
 */

export type NormalizeOrderItemInput = {
  menuItemId?: string | number | null;
  itemName?: string | null;
  quantity?: number | null;
  basePrice?: number | null;
  variantId?: string | number | null;
  variantName?: string | null;
  addons?: Array< { addonId?: string | number; addonName?: string; addonPrice?: number; quantity?: number }>;
  itemSnapshot?: Record<string, unknown> | null;
};

export type NormalizedOrderItem = {
  menuItemId: number;
  itemName: string;
  quantity: number;
  basePrice: number;
  variantId: number | null;
  variantName: string | null;
  addons: Array<{ addonId: number; addonName: string; addonPrice: number; quantity: number }>;
  itemSnapshot: Record<string, unknown> | null;
};

export type NormalizeOrderItemsResult =
  | { ok: true; items: NormalizedOrderItem[] }
  | { ok: false; code: string; message: string };

/** Parse to positive integer; returns null if invalid. */
function toPositiveInt(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n) || Number.isNaN(n) || n < 1) return null;
  return n;
}

/** Parse to non-negative number; returns 0 if invalid. */
function toNonNegativeNumber(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n) || Number.isNaN(n) || n < 0) return 0;
  return n;
}

/**
 * Validate and normalize order items. Never allow NaN or invalid ids to reach DB.
 * Returns error if any item has invalid menu_item_id (missing, NaN, or <= 0).
 */
export function normalizeOrderItems(items: unknown): NormalizeOrderItemsResult {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, code: "INVALID_CART_DATA", message: "Cart is empty or invalid. Please refresh and try again." };
  }

  const normalized: NormalizedOrderItem[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const raw = items[idx] as NormalizeOrderItemInput | undefined;
    if (raw == null || typeof raw !== "object") {
      return { ok: false, code: "INVALID_CART_DATA", message: "Some items are invalid. Please refresh cart." };
    }

    const menuItemId = toPositiveInt(raw.menuItemId);
    if (menuItemId == null) {
      return {
        ok: false,
        code: "INVALID_CART_DATA",
        message: "Some items have invalid menu item id. Please go back to the restaurant and add items again.",
      };
    }

    const itemName = raw.itemName != null && String(raw.itemName).trim() !== "" ? String(raw.itemName).trim() : "Item";
    const quantity = Math.max(1, Math.floor(toNonNegativeNumber(raw.quantity)) || 1);
    const basePrice = toNonNegativeNumber(raw.basePrice);
    const variantId = toPositiveInt(raw.variantId);
    const variantName = raw.variantName != null ? String(raw.variantName).trim() || null : null;

    const addons = (Array.isArray(raw.addons) ? raw.addons : []).map((a) => ({
      addonId: toPositiveInt(a?.addonId) ?? 0,
      addonName: a?.addonName != null ? String(a.addonName) : "",
      addonPrice: toNonNegativeNumber(a?.addonPrice),
      quantity: Math.max(1, Math.floor(toNonNegativeNumber(a?.quantity)) || 1),
    }));

    normalized.push({
      menuItemId,
      itemName,
      quantity,
      basePrice,
      variantId: variantId ?? null,
      variantName,
      addons,
      itemSnapshot: raw.itemSnapshot != null && typeof raw.itemSnapshot === "object" ? raw.itemSnapshot as Record<string, unknown> : null,
    });
  }

  return { ok: true, items: normalized };
}
