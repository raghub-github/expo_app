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
  addons?: Array<{
    addonId?: string | number;
    customizationId?: string | number | null;
    addonName?: string;
    addonPrice?: number;
    quantity?: number;
  }>;
  itemSnapshot?: Record<string, unknown> | null;
  /** Client hint: false when Boost / BOGO already on the line. */
  isDiscountEligible?: boolean | null;
};

export type NormalizedOrderAddon = {
  /** merchant_menu_item_addons.id when resolved; legacy numeric addonId when parseable. */
  menuAddonPk: number | null;
  /** Stable menu addon_id text from customer app (required). */
  menuAddonId: string;
  customizationId: string | null;
  addonName: string;
  addonPrice: number;
  quantity: number;
};

export type NormalizedOrderItem = {
  menuItemId: number;
  itemName: string;
  quantity: number;
  basePrice: number;
  /** Numeric PK on merchant_menu_item_variants when client sends a number. */
  variantId: number | null;
  /** Text variant_id (SIZE keys like half/full) from the customization sheet. */
  variantKey: string | null;
  variantName: string | null;
  addons: NormalizedOrderAddon[];
  itemSnapshot: Record<string, unknown> | null;
  /**
   * Client hint for cart/coupon min-order base.
   * `false` = Boost/BOGO already applied; server may also mark false for MRP / item-surface.
   */
  isDiscountEligible?: boolean;
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

function normalizeAddon(raw: {
  addonId?: string | number;
  addon_id?: string | number;
  menuAddonId?: string | number;
  customizationId?: string | number | null;
  addonName?: string;
  addonPrice?: number;
  quantity?: number;
}): NormalizedOrderAddon | null {
  const rawId = raw.menuAddonId ?? raw.addonId ?? raw.addon_id;
  let menuAddonId = rawId != null ? String(rawId).trim() : "";
  if (menuAddonId === "0" || menuAddonId === "undefined" || menuAddonId === "null") {
    menuAddonId = "";
  }
  if (!menuAddonId && !(raw.addonName != null && String(raw.addonName).trim())) return null;
  const customizationId =
    raw.customizationId != null && String(raw.customizationId).trim() !== ""
      ? String(raw.customizationId).trim()
      : null;
  return {
    menuAddonPk: null,
    menuAddonId,
    customizationId,
    addonName: raw.addonName != null ? String(raw.addonName) : "",
    addonPrice: toNonNegativeNumber(raw.addonPrice),
    quantity: Math.max(1, Math.floor(toNonNegativeNumber(raw.quantity)) || 1),
  };
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
    const variantPk = toPositiveInt(raw.variantId);
    const variantKey =
      variantPk == null && raw.variantId != null && String(raw.variantId).trim() !== ""
        ? String(raw.variantId).trim()
        : null;
    const variantName = raw.variantName != null ? String(raw.variantName).trim() || null : null;

    const addons: NormalizedOrderAddon[] = [];
    const rawAddonList = Array.isArray(raw.addons)
      ? raw.addons
      : raw.itemSnapshot != null &&
          typeof raw.itemSnapshot === "object" &&
          Array.isArray((raw.itemSnapshot as Record<string, unknown>).addons)
        ? ((raw.itemSnapshot as Record<string, unknown>).addons as unknown[])
        : [];
    for (const a of rawAddonList) {
      const norm = normalizeAddon(a ?? {});
      if (norm) addons.push(norm);
    }

    const item: NormalizedOrderItem = {
      menuItemId,
      itemName,
      quantity,
      basePrice,
      variantId: variantPk ?? null,
      variantKey,
      variantName,
      addons,
      itemSnapshot: raw.itemSnapshot != null && typeof raw.itemSnapshot === "object" ? raw.itemSnapshot as Record<string, unknown> : null,
    };
    if (raw.isDiscountEligible === false) {
      item.isDiscountEligible = false;
    } else if (raw.isDiscountEligible === true) {
      item.isDiscountEligible = true;
    }
    normalized.push(item);
  }

  return { ok: true, items: normalized };
}
