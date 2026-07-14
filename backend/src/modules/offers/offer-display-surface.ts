/** Shared offer → customer surface routing (item row vs offer sheet). */

export type OfferDisplaySurface = "item" | "sheet" | "both";

export function resolveOfferDisplaySurface(input: {
  offerType: string;
  offerSubType?: string | null;
  menuItemIds?: string[] | null;
  conditionsMode?: "boost" | "precision" | null;
}): OfferDisplaySurface {
  const type = String(input.offerType ?? "").toUpperCase();
  const isBogo = type === "BOGO" || type === "BUY_X_GET_Y" || type === "BUY_N_GET_M";
  if (isBogo) return "item";

  const isCartish =
    type === "CART_PERCENTAGE" ||
    type === "CART_FLAT" ||
    type === "FREE_DELIVERY" ||
    type === "COUPON" ||
    type === "TIERED" ||
    type === "BUNDLE";
  if (isCartish) return "sheet";

  const hasItems = Array.isArray(input.menuItemIds) && input.menuItemIds.length > 0;
  const sub = String(input.offerSubType ?? "").toUpperCase();
  const mode = input.conditionsMode;

  if (mode === "precision") return "sheet";
  if (mode === "boost") return hasItems || sub === "SPECIFIC_ITEM" ? "item" : "both";

  if (hasItems || sub === "SPECIFIC_ITEM") {
    if (type === "PERCENTAGE" || type === "FLAT") return "item";
  }
  // Store-wide % / flat (legacy or unspecified mode) → items + sheet so customers see Get for ₹
  if (type === "PERCENTAGE" || type === "FLAT") return "both";
  return "sheet";
}

export function parseMenuItemIdsFromMeta(meta: Record<string, unknown> | null | undefined): string[] | null {
  if (!meta) return null;
  const raw = meta.menu_item_ids ?? meta.menuItemIds ?? meta.selected_item_ids;
  let arr: unknown[] | null = null;
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === "string" && raw.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      arr = null;
    }
  }
  if (!arr) return null;
  const ids = arr.map((v) => String(v).trim()).filter(Boolean);
  return ids.length > 0 ? ids : null;
}

export function parseConditionsModeFromMeta(
  meta: Record<string, unknown> | null | undefined
): "boost" | "precision" | null {
  const path = meta?.create_path;
  if (path === "boost" || path === "precision") return path;
  const mode = meta?.conditions_mode;
  if (mode === "boost" || mode === "precision") return mode;
  return null;
}
