/**
 * Estimate merchant offer discount for preview / product price (mirrors checkoutExclusiveOffer).
 */
import type { MerchantOfferRow } from "../billing/types.js";

function num(v: unknown): number {
  if (v == null) return 0;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
}

function normalizeMenuId(v: unknown): string {
  return String(v ?? "").trim();
}

function itemScoped(offer: MerchantOfferRow, menuItemId: number): boolean {
  const meta = offer.metadata ?? {};
  const raw = meta.menu_item_ids ?? meta.menuItemIds;
  if (!Array.isArray(raw) || raw.length === 0) return true;
  const allow = new Set(raw.map(normalizeMenuId));
  return allow.has(normalizeMenuId(menuItemId)) || allow.has(String(menuItemId));
}

function categoryScoped(
  offer: MerchantOfferRow,
  categoryId: number | null | undefined
): boolean {
  const meta = offer.metadata ?? {};
  const cats = meta.category_ids as number[] | undefined;
  if (!Array.isArray(cats) || cats.length === 0) return true;
  if (categoryId == null) return false;
  return cats.includes(categoryId);
}

export function estimateMerchantOfferDiscountOnLine(
  offer: MerchantOfferRow,
  lineTotal: number,
  menuItemId: number,
  categoryId?: number | null
): number {
  if (lineTotal <= 0) return 0;
  if (!itemScoped(offer, menuItemId)) return 0;
  if (!categoryScoped(offer, categoryId)) return 0;

  const minOrder = num(offer.minOrderAmount);
  if (minOrder > 0 && lineTotal < minOrder) return 0;

  const t = offer.offerType.toUpperCase();
  if (t === "FREE_DELIVERY") return 0;

  let amt = 0;
  if (t === "PERCENTAGE" || t === "CART_PERCENTAGE") {
    const pct = num(offer.discountPercentage);
    if (pct <= 0) return 0;
    amt = (lineTotal * pct) / 100;
  } else if (
    t === "FLAT" ||
    t === "CART_FLAT" ||
    t === "COUPON" ||
    t === "FREE_ITEM" ||
    t === "TIERED" ||
    t === "BUNDLE"
  ) {
    amt = num(offer.discountValue);
  } else if (t === "BUY_X_GET_Y" || t === "BUY_N_GET_M" || t === "BOGO") {
    const buyN = offer.buyQuantity ?? 0;
    const getM = offer.getQuantity ?? 0;
    if (buyN > 0 && getM > 0) {
      const unit = lineTotal;
      const group = buyN + getM;
      if (unit > 0) {
        amt = (unit / Math.max(1, buyN)) * getM * 0.01 * unit;
        amt = Math.min(amt, unit * (getM / group));
      }
    }
  }

  const cap = num(offer.maxDiscountAmount);
  if (cap > 0) amt = Math.min(amt, cap);
  const orderCap = num(offer.maxDiscountPerOrder);
  if (orderCap > 0) amt = Math.min(amt, orderCap);
  return Math.min(Math.max(0, amt), lineTotal);
}

export function pickBestMerchantOfferForLine(
  offers: MerchantOfferRow[],
  lineTotal: number,
  menuItemId: number,
  categoryId?: number | null
): { offer: MerchantOfferRow; discount: number } | null {
  let best: { offer: MerchantOfferRow; discount: number } | null = null;
  const sorted = [...offers].sort((a, b) => {
    const pa = Number(b.priority ?? 0) - Number(a.priority ?? 0);
    if (pa !== 0) return pa;
    return Number(b.displayPriority ?? 0) - Number(a.displayPriority ?? 0);
  });

  for (const offer of sorted) {
    if (offer.autoApply === false) continue;
    const t = offer.offerType.toUpperCase();
    if (t === "COUPON") continue;
    const disc = estimateMerchantOfferDiscountOnLine(offer, lineTotal, menuItemId, categoryId);
    if (disc <= 0) continue;
    if (!best || disc > best.discount) {
      best = { offer, discount: disc };
    }
    if (!offer.isStackable) break;
  }
  return best;
}
