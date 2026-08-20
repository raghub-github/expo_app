/**
 * Map store Boost / BOGO offers onto menu cards (badge + strike price).
 * Precision / cart offers stay on checkout — they are not painted here.
 */

import type { Offer } from "@/lib/database";
import { getOfferLifecycle, getOfferMenuItemIds } from "@/app/mx/offers/offer-lifecycle";
import { resolveMenuItemSelection } from "@/app/mx/offers/offer-utils";
import {
  formatBogoOfferBadge,
  isBogoOfferType,
} from "@/lib/merchant-offer-display";

export type MenuItemOfferKind = "bogo" | "boost";

export type MenuItemOfferDisplay = {
  kind: MenuItemOfferKind;
  /** Compact ribbon on the thumbnail (e.g. BOGO, B2G1, 30% OFF). */
  badge: string;
  /** Hover / accessible label. */
  label: string;
  /** Catalog selling price to strike when Boost applies. */
  strikePrice: number | null;
  /** Payable after Boost (null for BOGO). */
  offerPrice: number | null;
};

type CatalogItem = {
  item_id: string;
  id?: number | null;
  category_id?: number | null;
  selling_price?: number | string | null;
};

function toNum(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isLiveConfiguredOffer(offer: Offer, now: Date): boolean {
  const life = getOfferLifecycle(offer, now);
  return life.phase === "active" || life.phase === "upcoming";
}

function isBoostOffer(offer: Offer): boolean {
  const type = String(offer.offer_type ?? "").toUpperCase();
  if (isBogoOfferType(type)) return false;
  if (type !== "PERCENTAGE" && type !== "FLAT" && type !== "COUPON") return false;

  const meta = (offer.offer_metadata ?? {}) as Record<string, unknown>;
  if (meta.create_path === "precision" || meta.conditions_mode === "precision") return false;
  if (meta.create_path === "boost" || meta.conditions_mode === "boost") return true;

  const ids = getOfferMenuItemIds(offer);
  const sub = String(offer.offer_sub_type ?? "")
    .toUpperCase()
    .replace(/[-\s]+/g, "_");
  const itemScoped =
    ids.length > 0 ||
    sub === "SPECIFIC_ITEM" ||
    sub === "SPECIFIC_ITEMS" ||
    sub === "SELECTED_ITEM" ||
    sub === "SELECTED_ITEMS";
  return itemScoped && (type === "PERCENTAGE" || type === "FLAT");
}

function isItemSurfaceOffer(offer: Offer): boolean {
  return isBogoOfferType(offer.offer_type) || isBoostOffer(offer);
}

function compactBogoBadge(buy: number, get: number): string {
  if (buy === 1 && get === 1) return "BOGO";
  return `B${buy}G${get}`;
}

function boostBadge(offer: Offer): string {
  const type = String(offer.offer_type ?? "").toUpperCase();
  if (type === "PERCENTAGE" || type === "COUPON") {
    const pct = toNum(offer.discount_percentage ?? offer.discount_value);
    if (pct != null && pct > 0) return `${Math.round(pct)}% OFF`;
  }
  if (type === "FLAT") {
    const amt = toNum(offer.discount_value);
    if (amt != null && amt > 0) return `₹${Math.round(amt)} OFF`;
  }
  return "BOOST";
}

function estimateBoostPrice(selling: number, offer: Offer): number | null {
  if (!Number.isFinite(selling) || selling <= 0) return null;
  const type = String(offer.offer_type ?? "").toUpperCase();
  if (type === "PERCENTAGE" || type === "COUPON") {
    const pct = toNum(offer.discount_percentage ?? offer.discount_value);
    if (pct == null || pct <= 0) return null;
    let off = (selling * pct) / 100;
    const cap = toNum(offer.max_discount_amount);
    if (cap != null && cap > 0) off = Math.min(off, cap);
    return Math.max(0, Math.round(selling - off));
  }
  if (type === "FLAT") {
    const amt = toNum(offer.discount_value);
    if (amt == null || amt <= 0) return null;
    return Math.max(0, Math.round(selling - amt));
  }
  return null;
}

function offerPriority(offer: Offer): number {
  if (isBoostOffer(offer) && offer.auto_apply) return 3;
  if (isBoostOffer(offer)) return 2;
  if (isBogoOfferType(offer.offer_type)) return 1;
  return 0;
}

function offerCategoryIds(offer: Offer): number[] {
  const meta = (offer.offer_metadata ?? {}) as { category_ids?: unknown };
  if (!Array.isArray(meta.category_ids)) return [];
  return meta.category_ids
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

function offerTargetsItem(
  offer: Offer,
  item: CatalogItem,
  resolvedIds: Set<string>
): boolean {
  if (resolvedIds.size > 0) {
    const itemId = String(item.item_id ?? "").trim();
    return Boolean(itemId && resolvedIds.has(itemId));
  }
  const catIds = offerCategoryIds(offer);
  if (catIds.length > 0) {
    return item.category_id != null && catIds.includes(Number(item.category_id));
  }
  // Store-wide Boost with no item list. BOGO without items never paints the whole menu.
  return isBoostOffer(offer);
}

function toDisplay(offer: Offer, selling: number): MenuItemOfferDisplay | null {
  if (isBogoOfferType(offer.offer_type)) {
    const buy = Math.max(1, toNum(offer.buy_quantity) ?? 1);
    const get = Math.max(1, toNum(offer.get_quantity) ?? 1);
    const label = formatBogoOfferBadge(offer.offer_title, buy, get);
    return {
      kind: "bogo",
      badge: compactBogoBadge(buy, get),
      label,
      strikePrice: null,
      offerPrice: null,
    };
  }

  const offerPrice = estimateBoostPrice(selling, offer);
  if (offerPrice == null || offerPrice >= selling - 0.001) return null;
  return {
    kind: "boost",
    badge: boostBadge(offer),
    label: offer.offer_title?.trim() || boostBadge(offer),
    strikePrice: Math.round(selling),
    offerPrice,
  };
}

/**
 * Best live Boost/BOGO per menu item, keyed by item_id and numeric PK.
 */
export function buildMenuItemOfferDisplayMap(
  offers: Offer[],
  items: CatalogItem[],
  now: Date = new Date()
): Map<string, MenuItemOfferDisplay> {
  const result = new Map<string, MenuItemOfferDisplay>();
  const live = offers.filter((o) => isLiveConfiguredOffer(o, now) && isItemSurfaceOffer(o));
  if (live.length === 0 || items.length === 0) return result;

  const resolvedByOfferId = new Map<string, Set<string>>();
  for (const offer of live) {
    const resolved = resolveMenuItemSelection(getOfferMenuItemIds(offer), items);
    resolvedByOfferId.set(offer.offer_id, new Set(resolved));
  }

  for (const item of items) {
    const selling = toNum(item.selling_price);
    if (selling == null || selling <= 0) continue;
    const candidates = live.filter((o) =>
      offerTargetsItem(o, item, resolvedByOfferId.get(o.offer_id) ?? new Set())
    );
    if (candidates.length === 0) continue;
    const best = [...candidates].sort((a, b) => offerPriority(b) - offerPriority(a))[0];
    if (!best) continue;
    const display = toDisplay(best, selling);
    if (!display) continue;
    const itemId = String(item.item_id ?? "").trim();
    if (itemId) result.set(itemId, display);
    if (item.id != null) result.set(String(item.id), display);
  }

  return result;
}

export function getMenuItemOffer(
  map: Map<string, MenuItemOfferDisplay>,
  item: { item_id?: string | number | null; id?: number | string | null }
): MenuItemOfferDisplay | undefined {
  const itemId = String(item.item_id ?? "").trim();
  if (itemId && map.has(itemId)) return map.get(itemId);
  const pk = item.id != null ? String(item.id).trim() : "";
  if (pk && map.has(pk)) return map.get(pk);
  return undefined;
}
