/**
 * Promo discount eligibility (Offer Engine v2 SSOT).
 *
 * Already-promoted lines (MRP strike / Boost / BOGO / free-item / bundle targets)
 * are excluded from coupon, platform cart, and merchant cart-surface bases.
 * Membership benefits are applied separately and are not gated here.
 *
 * Frontend must not invent eligibility for money math — server recomputes always.
 */

import { parseConditionsModeFromMeta, parseMenuItemIdsFromMeta } from "../offers/offer-display-surface.js";
import type { BillContext, MerchantOfferRow } from "./types.js";

export type IneligibilityReason = "ITEM_PROMO" | "MRP" | null;

export type OrderLineForEligibility = {
  menuItemId: string;
  lineTotal: number;
  quantity: number;
  /** Catalog base×qty (excludes add-ons) when available. */
  baseLineTotal?: number;
  addonLineTotal?: number;
  discountEligible?: boolean;
  ineligibilityReason?: IneligibilityReason;
};

function normalizeMenuId(v: unknown): string {
  return String(v ?? "").trim();
}

/**
 * Expand id aliases so "123", 123, and "123::cust" can match offer targets.
 * NOTE: "_" is only split when the prefix is a NUMERIC menu id ("102_half" → "102").
 * An opaque store item id like "HC77_d408a86767dbd6e1" is NEVER split — "HC77" is a store
 * prefix shared by every item and would alias-match the whole store's menu (cross-item bleed).
 */
export function menuIdAliases(raw: unknown): string[] {
  const s = normalizeMenuId(raw);
  if (!s) return [];
  const out = new Set<string>([s]);
  if (s.includes("::")) {
    const base = s.split("::")[0]!;
    if (base) out.add(base);
    const asNum = Number(base);
    if (Number.isFinite(asNum) && asNum > 0) out.add(String(asNum));
  } else if (s.includes("_")) {
    const prefix = s.split("_")[0]!;
    if (prefix && /^\d+$/.test(prefix)) out.add(prefix);
  }
  return [...out];
}

/**
 * Menu-row Boost / BOGO / free-item / bundle — item promotional pricing.
 * Precision (`conditions_mode: "precision"`) is never item-surface.
 */
export function isItemSurfaceMerchantOffer(offer: MerchantOfferRow): boolean {
  const type = String(offer.offerType ?? "").toUpperCase();
  if (type === "BOGO" || type === "BUY_X_GET_Y" || type === "BUY_N_GET_M") return true;
  if (type === "FREE_ITEM") return true;
  if (type === "BUNDLE") return true;

  const meta = offer.metadata ?? {};
  const mode = parseConditionsModeFromMeta(meta);
  if (mode === "precision") return false;

  if (
    type === "CART_PERCENTAGE" ||
    type === "CART_FLAT" ||
    type === "FREE_DELIVERY" ||
    type === "COUPON" ||
    type === "TIERED"
  ) {
    return false;
  }

  if (type === "PERCENTAGE" || type === "FLAT") {
    if (mode === "boost") return true;
    const ids = parseMenuItemIdsFromMeta(meta);
    const sub = String(offer.offerSubType ?? "")
      .toUpperCase()
      .trim()
      .replace(/[-\s]+/g, "_");
    if (
      (ids != null && ids.length > 0) ||
      sub === "SPECIFIC_ITEM" ||
      sub === "SPECIFIC_ITEMS" ||
      sub === "SELECTED_ITEM" ||
      sub === "SELECTED_ITEMS"
    ) {
      return true;
    }
    const surface = String(
      meta.display_surface ?? meta.displaySurface ?? ""
    )
      .toLowerCase()
      .trim();
    if (surface === "item" || surface === "both") return true;
    if (surface === "sheet") return false;
    // Legacy unspecified store-wide %/flat → item surface (menu Get for ₹).
    return mode == null;
  }
  return false;
}

function timeEligible(offer: MerchantOfferRow, now: Date): boolean {
  if (offer.applicableOnDays && offer.applicableOnDays.length > 0) {
    const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const today = dayNames[now.getDay()];
    const allowed = offer.applicableOnDays.map((d) => d.toLowerCase().slice(0, 3));
    if (!allowed.includes(today)) return false;
  }
  if (offer.applicableTimeStart && offer.applicableTimeEnd) {
    const hhmm = now.toTimeString().slice(0, 5);
    if (hhmm < offer.applicableTimeStart || hhmm > offer.applicableTimeEnd) return false;
  }
  return true;
}

/** Resolve menu ids targeted by an item-surface offer (empty = store-wide / all cart). */
function targetedMenuIdsFromOffer(offer: MerchantOfferRow): string[] | null {
  const type = String(offer.offerType ?? "").toUpperCase();
  const meta = offer.metadata ?? {};

  if (type === "FREE_ITEM") {
    const raw = meta.free_item_ids ?? meta.freeItemIds;
    if (!Array.isArray(raw) || raw.length === 0) return [];
    return raw.map((v) => normalizeMenuId(v)).filter(Boolean);
  }

  if (type === "BUNDLE") {
    const bundle = Array.isArray(meta.bundle_items) ? meta.bundle_items : [];
    const ids = bundle
      .map((bi: { item_id?: unknown }) => normalizeMenuId(bi?.item_id))
      .filter(Boolean);
    return ids.length > 0 ? ids : [];
  }

  return parseMenuItemIdsFromMeta(meta);
}

/**
 * Menu item IDs that would receive an item-surface merchant promo
 * on this bill — those lines are not eligible for further cart/coupon discounts.
 */
export function menuItemIdsWithItemSurfacePromo(
  offers: MerchantOfferRow[],
  orderMenuItemIds: string[],
  now: Date,
  /** Extra aliases per cart line id (e.g. catalog item_id ↔ menu PK). */
  extraAliasesByLineId?: Map<string, string[]>
): Set<string> {
  const cartAliasToCanonical = new Map<string, string>();
  for (const raw of orderMenuItemIds) {
    const canonical = normalizeMenuId(raw);
    if (!canonical) continue;
    for (const alias of menuIdAliases(canonical)) {
      cartAliasToCanonical.set(alias, canonical);
    }
    const extras = extraAliasesByLineId?.get(canonical);
    if (extras) {
      for (const extra of extras) {
        const a = normalizeMenuId(extra);
        if (a) cartAliasToCanonical.set(a, canonical);
      }
    }
  }
  const hit = new Set<string>();
  if (cartAliasToCanonical.size === 0) return hit;

  for (const offer of offers) {
    if (!isItemSurfaceMerchantOffer(offer)) continue;
    if (!timeEligible(offer, now)) continue;

    const rawIds = targetedMenuIdsFromOffer(offer);
    if (rawIds == null || rawIds.length === 0) {
      // Store-wide Boost / BOGO — every cart line is already item-discounted.
      // FREE_ITEM/BUNDLE with empty targets → skip (misconfigured).
      const type = String(offer.offerType ?? "").toUpperCase();
      if (type === "FREE_ITEM" || type === "BUNDLE") continue;
      for (const canonical of new Set(cartAliasToCanonical.values())) {
        hit.add(canonical);
      }
      continue;
    }

    for (const rawId of rawIds) {
      for (const alias of menuIdAliases(rawId)) {
        const canonical = cartAliasToCanonical.get(alias);
        if (canonical) hit.add(canonical);
      }
    }
  }
  return hit;
}

export function markOrderLinesDiscountEligibility(
  lines: OrderLineForEligibility[],
  opts: {
    mrpIneligibleIds: Set<string>;
    merchantOffers: MerchantOfferRow[];
    now: Date;
    /** Catalog item_id (and other aliases) keyed by cart menuItemId / PK. */
    extraAliasesByLineId?: Map<string, string[]>;
  }
): Array<OrderLineForEligibility & { discountEligible: boolean; ineligibilityReason: IneligibilityReason }> {
  const orderIds = lines.map((l) => normalizeMenuId(l.menuItemId));
  const surfaceHit = menuItemIdsWithItemSurfacePromo(
    opts.merchantOffers,
    orderIds,
    opts.now,
    opts.extraAliasesByLineId
  );

  return lines.map((line) => {
    const id = normalizeMenuId(line.menuItemId);
    const aliases = menuIdAliases(id);
    const mrpHit = aliases.some((a) => opts.mrpIneligibleIds.has(a));
    const surface = aliases.some((a) => surfaceHit.has(a)) || surfaceHit.has(id);
    let ineligibilityReason: IneligibilityReason = null;
    if (mrpHit) ineligibilityReason = "MRP";
    else if (surface) ineligibilityReason = "ITEM_PROMO";
    const discountEligible = ineligibilityReason == null;
    return { ...line, discountEligible, ineligibilityReason };
  });
}

/** Σ lineTotal for lines still open to coupon / platform / cart-surface promos. */
export function promoEligibleSubtotal(ctx: BillContext): number {
  let sum = 0;
  for (const line of ctx.orderLines ?? []) {
    if (line.discountEligible === false) continue;
    sum += Math.max(0, Number(line.lineTotal) || 0);
  }
  return Math.max(0, sum);
}

/**
 * Canonical eligible cart total (Offer Engine v2).
 * Alias of promoEligibleSubtotal — prefer this name in new code.
 */
export function eligibleSubtotal(ctx: BillContext): number {
  return promoEligibleSubtotal(ctx);
}

/**
 * Cart/coupon/platform min-order + % base.
 * Falls back to itemPlusAddon when order lines are empty (listing stubs / legacy tests).
 */
export function cartPromoQualifyingSubtotal(ctx: BillContext, itemPlusAddon: number): number {
  const lines = ctx.orderLines ?? [];
  if (lines.length === 0) return Math.max(0, itemPlusAddon);
  return eligibleSubtotal(ctx);
}
