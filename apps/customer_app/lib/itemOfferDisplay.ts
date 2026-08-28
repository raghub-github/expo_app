/**
 * Map store merchant offers → per-menu-item display (Boost price / BOGO badge).
 * Does not mutate catalog selling prices — display-only estimates.
 */

import type { MerchantOfferItem } from "@/services/offers.service";

export type ItemOfferKind = "percentage" | "flat" | "bogo";

export type ItemOfferDisplay = {
  offerId: number;
  kind: ItemOfferKind;
  label: string;
  /** Estimated payable unit price after %/flat (null for BOGO). */
  offerPrice: number | null;
  /** Catalog/base price to strike when offerPrice is set. */
  strikePrice: number | null;
  /** Raw offer math — re-estimate Boost for variant / size prices. */
  discountPercentage?: number | null;
  discountValue?: number | null;
  maxDiscountAmount?: number | null;
  buyQty?: number;
  getQty?: number;
  autoApply: boolean;
};

/** Menu row identity + selling price for offer matching. */
export type ItemOfferCatalogItem = {
  id: string;
  menuItemId?: number | null;
  price: number;
  /** Backend strike (markup of base CTM) when Boost is already baked into `price`. */
  customerStrikePrice?: number | null;
};

function isBogoType(type: string): boolean {
  const t = type.toUpperCase();
  return t === "BOGO" || t === "BUY_X_GET_Y" || t === "BUY_N_GET_M";
}

function isPctOrFlat(type: string): boolean {
  const t = type.toUpperCase();
  return t === "PERCENTAGE" || t === "FLAT";
}

/**
 * Boost / BOGO belong on menu rows. Precision is checkout/sheet only.
 */
export function isItemSurface(o: MerchantOfferItem): boolean {
  const type = String(o.offer_type ?? "").toUpperCase();
  if (isBogoType(type)) return true;

  if (
    type === "CART_PERCENTAGE" ||
    type === "CART_FLAT" ||
    type === "FREE_DELIVERY" ||
    type === "COUPON" ||
    type === "TIERED" ||
    type === "BUNDLE"
  ) {
    return false;
  }

  if (!isPctOrFlat(type)) return false;

  const sub = String(o.offer_sub_type ?? "")
    .toUpperCase()
    .trim()
    .replace(/[-\s]+/g, "_");
  const hasItems = Array.isArray(o.menu_item_ids) && o.menu_item_ids.length > 0;
  const itemScoped =
    hasItems ||
    sub === "SPECIFIC_ITEM" ||
    sub === "SPECIFIC_ITEMS" ||
    sub === "SELECTED_ITEM" ||
    sub === "SELECTED_ITEMS" ||
    o.display_surface === "item";

  // Explicit Precision is always sheet/checkout only (never menu strike).
  if (o.conditions_mode === "precision") return false;
  if (o.conditions_mode === "boost") return true;

  // Item-scoped %/flat without mode → Boost on the menu.
  if (itemScoped) return true;

  const surface = o.display_surface ?? null;
  if (surface === "item" || surface === "both") return true;
  if (surface === "sheet") return false;

  // Legacy unspecified store-wide %/flat → show Get for ₹
  return true;
}

export function offerTargetsItem(o: MerchantOfferItem, item: ItemOfferCatalogItem): boolean {
  const ids = o.menu_item_ids?.length ? o.menu_item_ids.map(String) : null;
  const sub = String(o.offer_sub_type ?? "")
    .toUpperCase()
    .trim()
    .replace(/[-\s]+/g, "_");
  if (!ids) {
    // Selected-item offer missing ids — don't paint the whole menu.
    if (
      sub === "SPECIFIC_ITEM" ||
      sub === "SPECIFIC_ITEMS" ||
      sub === "SELECTED_ITEM" ||
      sub === "SELECTED_ITEMS"
    ) {
      return false;
    }
    // ALL_ORDERS / store-wide Boost
    return isPctOrFlat(o.offer_type);
  }
  const itemId = String(item.id ?? "").trim();
  const pk = item.menuItemId != null ? String(item.menuItemId) : null;
  return ids.some((raw) => {
    const id = String(raw).trim();
    if (!id) return false;
    return id === itemId || (pk != null && id === pk);
  });
}

export function estimateOfferUnitPrice(
  catalogPrice: number,
  offer: MerchantOfferItem
): number | null {
  if (!Number.isFinite(catalogPrice) || catalogPrice <= 0) return null;
  const type = offer.offer_type.toUpperCase();
  if (type === "PERCENTAGE" && offer.discount_percentage != null && offer.discount_percentage > 0) {
    let off = (catalogPrice * offer.discount_percentage) / 100;
    if (offer.max_discount_amount != null && offer.max_discount_amount > 0) {
      off = Math.min(off, offer.max_discount_amount);
    }
    // Whole rupees — same on menu "Get for" and checkout line / item subtotal.
    return Math.max(0, Math.round(catalogPrice - off));
  }
  if (type === "FLAT" && offer.discount_value != null && offer.discount_value > 0) {
    return Math.max(0, Math.round(catalogPrice - offer.discount_value));
  }
  return null;
}

/** Whole-rupee display — menu + checkout share this so amounts always match. */
export function formatOfferRupee(amount: number): string {
  if (!Number.isFinite(amount)) return "₹0";
  return `₹${Math.round(amount)}`;
}

export function offerPriority(o: MerchantOfferItem): number {
  if (o.auto_apply && isPctOrFlat(o.offer_type)) return 3;
  if (isPctOrFlat(o.offer_type)) return 2;
  if (isBogoType(o.offer_type)) return 1;
  return 0;
}

function toDisplay(best: MerchantOfferItem, item: ItemOfferCatalogItem): ItemOfferDisplay {
  const type = best.offer_type.toUpperCase();
  if (isBogoType(type)) {
    const buy = best.buy_quantity != null && best.buy_quantity > 0 ? best.buy_quantity : 1;
    const get = best.get_quantity != null && best.get_quantity > 0 ? best.get_quantity : 1;
    return {
      offerId: best.id,
      kind: "bogo",
      label: best.label || `Buy ${buy} Get ${get}`,
      offerPrice: null,
      strikePrice: null,
      buyQty: buy,
      getQty: get,
      autoApply: best.auto_apply,
    };
  }

  const catalogPrice = item.price;
  const strikeFromBackend = item.customerStrikePrice;
  const baked =
    strikeFromBackend != null && strikeFromBackend > catalogPrice + 0.001;

  if (baked) {
    return {
      offerId: best.id,
      kind: type === "FLAT" ? "flat" : "percentage",
      label: best.label,
      offerPrice: Math.round(catalogPrice),
      strikePrice: Math.round(strikeFromBackend),
      discountPercentage: best.discount_percentage ?? null,
      discountValue: best.discount_value ?? null,
      maxDiscountAmount: best.max_discount_amount ?? null,
      autoApply: best.auto_apply,
    };
  }

  const estimated = estimateOfferUnitPrice(catalogPrice, best);
  const hasEstimate = estimated != null && estimated < catalogPrice - 0.001;
  return {
    offerId: best.id,
    kind: type === "FLAT" ? "flat" : "percentage",
    label: best.label,
    offerPrice: hasEstimate ? estimated : Math.round(catalogPrice),
    strikePrice: hasEstimate ? Math.round(catalogPrice) : null,
    discountPercentage: best.discount_percentage ?? null,
    discountValue: best.discount_value ?? null,
    maxDiscountAmount: best.max_discount_amount ?? null,
    autoApply: best.auto_apply,
  };
}

/** Catalog MRP discount percent when base price exceeds selling price. */
export function computeCatalogDiscountPercent(
  basePrice: number | null,
  sellingPrice: number
): number | null {
  if (basePrice == null || !Number.isFinite(basePrice) || !Number.isFinite(sellingPrice)) {
    return null;
  }
  if (basePrice <= sellingPrice + 0.001) return null;
  const pct = Math.round(((basePrice - sellingPrice) / basePrice) * 100);
  return pct > 0 ? pct : null;
}

/** Menu card payable + strike. Works for baked Boost and client-estimated Boost. */
export function resolveMenuOfferPriceDisplay(args: {
  sellingPrice: number;
  basePrice: number | null;
  itemOffer: ItemOfferDisplay | null | undefined;
}): { payable: number; strike: number | null; showStrike: boolean } {
  const selling = Math.round(args.sellingPrice);
  const offer = args.itemOffer;
  if (offer && offer.kind !== "bogo") {
    const strike = offer.strikePrice != null ? Math.round(offer.strikePrice) : null;
    const pay = offer.offerPrice != null ? Math.round(offer.offerPrice) : null;
    if (strike != null && pay != null && strike > pay) {
      const payable = Math.min(pay, selling);
      return { payable, strike, showStrike: strike > payable };
    }
    if (pay != null && pay < selling) {
      return { payable: pay, strike: strike ?? selling, showStrike: true };
    }
  }
  const base = args.basePrice != null ? Math.round(args.basePrice) : null;
  if (base != null && base > selling) {
    return { payable: selling, strike: base, showStrike: true };
  }
  return { payable: selling, strike: null, showStrike: false };
}

/**
 * Menu/cart unit prices from the backend are already Boost-then-gross-up.
 * Do not apply %/flat again. If the unit matches the strike, return the baked offer price.
 */
export function estimateBoostUnitPrice(
  catalogPrice: number,
  offer: ItemOfferDisplay | null | undefined
): number | null {
  if (!offer || offer.kind === "bogo") return null;
  if (!Number.isFinite(catalogPrice) || catalogPrice <= 0) return null;
  if (
    offer.offerPrice != null &&
    offer.strikePrice != null &&
    Math.abs(catalogPrice - offer.strikePrice) < 0.51
  ) {
    return offer.offerPrice;
  }
  return Math.round(catalogPrice);
}

function writeAliases(
  result: Map<string, ItemOfferDisplay>,
  item: ItemOfferCatalogItem,
  display: ItemOfferDisplay
) {
  if (item.id) result.set(String(item.id), display);
  if (item.menuItemId != null) result.set(String(item.menuItemId), display);
}

/**
 * Build best item-facing offer per menu item.
 * Indexes under both `id` (item_id) and `menuItemId` (PK) so lookups never miss.
 * Store-wide Boost applies to every catalog item; selected Boost only to matched ids.
 */
export function buildItemOfferDisplayMap(
  offers: MerchantOfferItem[],
  catalogItems: ItemOfferCatalogItem[] | Map<string, number>
): Map<string, ItemOfferDisplay> {
  const result = new Map<string, ItemOfferDisplay>();

  const items: ItemOfferCatalogItem[] = Array.isArray(catalogItems)
    ? catalogItems.filter((i) => Number.isFinite(i.price) && i.price > 0)
    : [...catalogItems.entries()]
        .filter(([, price]) => Number.isFinite(price) && price > 0)
        .map(([id, price]) => ({ id, price }));

  if (items.length === 0) return result;

  const surfaceOffers = offers.filter(isItemSurface);
  if (surfaceOffers.length === 0) return result;

  for (const item of items) {
    const candidates = surfaceOffers.filter((o) => offerTargetsItem(o, item));
    if (candidates.length === 0) continue;
    const best = [...candidates].sort((a, b) => offerPriority(b) - offerPriority(a))[0];
    if (!best) continue;
    writeAliases(result, item, toDisplay(best, item));
  }

  return result;
}

/** Offers that belong on store/checkout sheets (Precision / cart / presence). */
export function filterSheetMerchantOffers(offers: MerchantOfferItem[]): MerchantOfferItem[] {
  return offers.filter((o) => {
    const surface = o.display_surface;
    if (surface === "sheet" || surface === "both") return true;
    if (surface === "item") return false;
    return !isItemSurface(o) || !o.menu_item_ids?.length;
  });
}
