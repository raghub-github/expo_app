/**
 * Canonical item pricing — single formula for menu, cart, checkout, snapshot, settlement preview.
 *
 *   base CTM
 *     → item-surface Boost (% / flat of CTM)
 *     → discounted CTM
 *     → customerPriceFromBase (gross-up)
 *     → customer item price
 *
 * BOGO is NOT applied here. It remains a customer-facing free-unit discount after markup;
 * merchant CTM stays the full fulfilled quantity.
 *
 * Precision / platform offers are cart/checkout-stage and are not part of this function.
 */

import { isItemSurfaceMerchantOffer } from "../billing/discountEligibility.js";
import { parseMenuItemIdsFromMeta } from "../offers/offer-display-surface.js";
import type { MerchantOfferRow } from "../billing/types.js";
import { markupRupeesPaise, rupeesToPaise } from "../commission/pricing.js";

export const ITEM_PRICING_CALCULATION_VERSION = 2;

export type CanonicalOfferKind = "PERCENTAGE" | "FLAT" | "BOOST" | "BOGO" | "NONE";

export function isStoreFundedItemOfferType(t: string | null | undefined): boolean {
  const u = String(t ?? "").toUpperCase().replace(/[-\s]+/g, "_");
  return u === "PERCENTAGE" || u === "FLAT" || u === "BOOST";
}

export type ItemPricingResult = {
  calculationVersion: number;
  baseCtmUnit: number;
  baseCtmLine: number;
  addonCtmLine: number;
  merchantOfferId: number | null;
  merchantOfferType: CanonicalOfferKind;
  merchantOfferName: string | null;
  merchantOfferRawType: string | null;
  merchantDiscountAmount: number;
  boostPercent: number | null;
  boostFlat: number | null;
  discountedCtmUnit: number;
  discountedCtmLine: number;
  commissionRate: number;
  commissionAmount: number;
  customerStrikeUnit: number;
  customerStrikeLine: number;
  customerItemPriceUnit: number;
  customerItemPriceLine: number;
  merchantSettlementCtm: number;
  merchantOfferSnapshot: Record<string, unknown>;
};

function num(v: unknown): number {
  if (v == null) return 0;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function normalizeMenuId(v: unknown): string {
  return String(v ?? "").trim();
}

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

function offerTargetsAliases(offer: MerchantOfferRow, aliases: string[]): boolean {
  const raw = parseMenuItemIdsFromMeta(offer.metadata ?? {});
  if (!raw || raw.length === 0) return true;
  const allow = new Set<string>();
  for (const id of raw) {
    for (const a of menuIdAliases(id)) allow.add(a);
  }
  return aliases.some((a) => allow.has(a));
}

function isBogoType(t: string): boolean {
  const u = t.toUpperCase().replace(/[-\s]+/g, "_");
  return u === "BOGO" || u === "BUY_X_GET_Y" || u === "BUY_N_GET_M";
}

function isBoostType(offer: MerchantOfferRow): boolean {
  const t = offer.offerType.toUpperCase().replace(/[-\s]+/g, "_");
  if (t !== "PERCENTAGE" && t !== "FLAT") return false;
  return isItemSurfaceMerchantOffer(offer);
}

function timeEligible(offer: MerchantOfferRow, now: Date): boolean {
  if (offer.applicableOnDays && offer.applicableOnDays.length > 0) {
    const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const today = dayNames[now.getDay()];
    const allowed = offer.applicableOnDays.map((d) => d.toLowerCase().slice(0, 3));
    if (!allowed.includes(today ?? "")) return false;
  }
  if (offer.applicableTimeStart && offer.applicableTimeEnd) {
    const hhmm = now.toTimeString().slice(0, 5);
    if (hhmm < offer.applicableTimeStart || hhmm > offer.applicableTimeEnd) return false;
  }
  return true;
}

function boostOwnedBogoAliases(offers: MerchantOfferRow[]): Set<string> {
  const out = new Set<string>();
  for (const o of offers) {
    if (!isBogoType(o.offerType) && String(o.offerType).toUpperCase() !== "FREE_ITEM" && String(o.offerType).toUpperCase() !== "BUNDLE") {
      continue;
    }
    const ids = parseMenuItemIdsFromMeta(o.metadata ?? {});
    if (!ids || ids.length === 0) continue;
    for (const id of ids) {
      for (const a of menuIdAliases(id)) out.add(a);
    }
  }
  return out;
}

function resolvedBoostPct(offer: MerchantOfferRow): number {
  const t = offer.offerType.toUpperCase();
  if (t !== "PERCENTAGE") return 0;
  const pct = num(offer.discountPercentage);
  if (pct > 0) return pct;
  const flat = num(offer.discountValue);
  return flat > 0 && flat <= 100 ? flat : 0;
}

/**
 * Merchant store-offer discount in CTM rupees for a line (item base × qty, excluding addons).
 * Two-decimal MX rupees — 40% of ₹149 = ₹59.60, not a whole rupee.
 */
export function boostDiscountOnCtmLine(
  baseCtmLine: number,
  quantity: number,
  offer: MerchantOfferRow
): number {
  const base = Math.max(0, round2(baseCtmLine));
  if (base <= 0) return 0;
  const t = offer.offerType.toUpperCase();
  const cap = num(offer.maxDiscountAmount);
  const orderCap = num(offer.maxDiscountPerOrder);
  let remaining =
    cap > 0 || orderCap > 0
      ? Math.min(cap > 0 ? cap : Number.POSITIVE_INFINITY, orderCap > 0 ? orderCap : Number.POSITIVE_INFINITY)
      : Number.POSITIVE_INFINITY;

  let off = 0;
  if (t === "PERCENTAGE") {
    const pct = resolvedBoostPct(offer);
    if (pct <= 0) return 0;
    off = round2((base * pct) / 100);
  } else if (t === "FLAT") {
    const flat = num(offer.discountValue);
    if (flat <= 0) return 0;
    const qty = Math.max(1, quantity);
    const unit = base / qty;
    const newUnit = Math.max(0, round2(unit - flat));
    off = Math.max(0, round2((unit - newUnit) * qty));
  }
  off = Math.min(off, base, remaining);
  return Math.max(0, round2(off));
}

export function pickWinningItemBoost(
  offers: MerchantOfferRow[],
  aliases: string[],
  now: Date = new Date()
): MerchantOfferRow | null {
  const bogoOwned = boostOwnedBogoAliases(offers);
  if (aliases.some((a) => bogoOwned.has(a))) return null;

  const isSpecific = (o: MerchantOfferRow) => {
    const ids = parseMenuItemIdsFromMeta(o.metadata ?? {});
    return ids != null && ids.length > 0;
  };

  const candidates = offers
    .filter(isBoostType)
    .filter((o) => timeEligible(o, now))
    .filter((o) => offerTargetsAliases(o, aliases))
    .sort((a, b) => {
      const spec = (isSpecific(a) ? 0 : 10) - (isSpecific(b) ? 0 : 10);
      if (spec !== 0) return spec;
      const pr = (b.displayPriority ?? 0) - (a.displayPriority ?? 0);
      if (pr !== 0) return pr;
      return a.id - b.id;
    });

  return candidates[0] ?? null;
}

export type ResolveItemPricingInput = {
  baseCtmUnit: number;
  quantity: number;
  addonCtmLine?: number;
  commissionPercent: number;
  offers: MerchantOfferRow[];
  menuItemId: number | string;
  extraAliases?: string[];
  now?: Date;
};

export function resolveItemPricing(input: ResolveItemPricingInput): ItemPricingResult {
  const qty = Math.max(1, Math.floor(Number(input.quantity) || 1));
  const baseUnit = Math.max(0, round2(num(input.baseCtmUnit)));
  const addonLine = Math.max(0, round2(num(input.addonCtmLine)));
  const baseLine = round2(baseUnit * qty);
  const aliases = [
    ...menuIdAliases(input.menuItemId),
    ...(input.extraAliases ?? []).flatMap((a) => menuIdAliases(a)),
  ];
  const now = input.now ?? new Date();
  const winner = pickWinningItemBoost(input.offers, aliases, now);

  let merchantDiscount = 0;
  let kind: CanonicalOfferKind = "NONE";
  let offerName: string | null = null;
  let rawType: string | null = null;
  let boostPercent: number | null = null;
  let boostFlat: number | null = null;
  let snapshot: Record<string, unknown> = {};

  if (winner) {
    merchantDiscount = boostDiscountOnCtmLine(baseLine, qty, winner);
    if (merchantDiscount > 0.005) {
      const raw = winner.offerType.toUpperCase().replace(/[-\s]+/g, "_");
      kind = raw === "FLAT" ? "FLAT" : "PERCENTAGE";
      offerName = (winner.title || "").trim() || "Store Offer Applied";
      rawType = winner.offerType;
      const pct = resolvedBoostPct(winner);
      if (raw === "PERCENTAGE" && pct > 0) boostPercent = pct;
      if (raw === "FLAT") boostFlat = num(winner.discountValue);
      snapshot = {
        id: winner.id,
        offer_type: winner.offerType,
        offer_title: winner.title,
        discount_percentage: winner.discountPercentage,
        discount_value: winner.discountValue,
        max_discount_amount: winner.maxDiscountAmount,
      };
    }
  }

  const discountedLine = round2(Math.max(0, baseLine - merchantDiscount));
  const discountedUnit = qty > 0 ? round2(discountedLine / qty) : 0;
  const strikeUnit = markupRupeesPaise(baseUnit, input.commissionPercent);
  const finalUnit = markupRupeesPaise(discountedUnit, input.commissionPercent);
  const strikeLine = round2(strikeUnit * qty);
  const finalLine = round2(finalUnit * qty);
  const addonCustomer = addonLine > 0 ? markupRupeesPaise(addonLine, input.commissionPercent) : 0;
  const commissionAmount = round2(Math.max(0, finalLine - discountedLine));

  return {
    calculationVersion: ITEM_PRICING_CALCULATION_VERSION,
    baseCtmUnit: baseUnit,
    baseCtmLine: round2(baseLine + addonLine),
    addonCtmLine: addonLine,
    merchantOfferId: isStoreFundedItemOfferType(kind) && winner ? winner.id : null,
    merchantOfferType: kind,
    merchantOfferName: offerName,
    merchantOfferRawType: rawType,
    merchantDiscountAmount: merchantDiscount,
    boostPercent,
    boostFlat,
    discountedCtmUnit: discountedUnit,
    discountedCtmLine: round2(discountedLine + addonLine),
    commissionRate: input.commissionPercent,
    commissionAmount,
    customerStrikeUnit: strikeUnit,
    customerStrikeLine: round2(strikeLine + addonCustomer),
    customerItemPriceUnit: finalUnit,
    customerItemPriceLine: round2(finalLine + addonCustomer),
    merchantSettlementCtm: round2(discountedLine + addonLine),
    merchantOfferSnapshot: snapshot,
  };
}

export function serializeCanonicalPricing(p: ItemPricingResult): Record<string, unknown> {
  return {
    calculation_version: p.calculationVersion,
    base_ctm_unit: p.baseCtmUnit,
    base_ctm_line: p.baseCtmLine,
    addon_ctm_line: p.addonCtmLine,
    merchant_offer_id: p.merchantOfferId,
    merchant_offer_type: p.merchantOfferType,
    merchant_offer_name: p.merchantOfferName,
    merchant_offer_raw_type: p.merchantOfferRawType,
    merchant_discount_amount: p.merchantDiscountAmount,
    boost_percent: p.boostPercent,
    boost_flat: p.boostFlat,
    discounted_ctm_unit: p.discountedCtmUnit,
    discounted_ctm_line: p.discountedCtmLine,
    commission_rate: p.commissionRate,
    commission_amount: p.commissionAmount,
    customer_strike_unit: p.customerStrikeUnit,
    customer_strike_line: p.customerStrikeLine,
    customer_item_price_unit: p.customerItemPriceUnit,
    customer_item_price_line: p.customerItemPriceLine,
    merchant_settlement_ctm: p.merchantSettlementCtm,
    merchant_offer_snapshot: p.merchantOfferSnapshot,
  };
}

export function parseCanonicalPricing(raw: unknown): ItemPricingResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const version = Number(o.calculation_version ?? o.calculationVersion);
  if (version !== ITEM_PRICING_CALCULATION_VERSION) return null;
  const baseCtmUnit = num(o.base_ctm_unit ?? o.baseCtmUnit);
  const discountedCtmLine = num(o.discounted_ctm_line ?? o.discountedCtmLine);
  if (!(baseCtmUnit >= 0) && !(discountedCtmLine >= 0)) return null;
  const kindRaw = String(o.merchant_offer_type ?? o.merchantOfferType ?? "NONE")
    .toUpperCase()
    .replace(/[-\s]+/g, "_");
  const kind: CanonicalOfferKind =
    kindRaw === "PERCENTAGE"
      ? "PERCENTAGE"
      : kindRaw === "FLAT"
        ? "FLAT"
        : kindRaw === "BOOST"
          ? "BOOST"
          : kindRaw === "BOGO"
            ? "BOGO"
            : "NONE";
  return {
    calculationVersion: ITEM_PRICING_CALCULATION_VERSION,
    baseCtmUnit,
    baseCtmLine: num(o.base_ctm_line ?? o.baseCtmLine),
    addonCtmLine: num(o.addon_ctm_line ?? o.addonCtmLine),
    merchantOfferId:
      o.merchant_offer_id != null || o.merchantOfferId != null
        ? Number(o.merchant_offer_id ?? o.merchantOfferId)
        : null,
    merchantOfferType: kind,
    merchantOfferName: o.merchant_offer_name != null ? String(o.merchant_offer_name) : null,
    merchantOfferRawType:
      o.merchant_offer_raw_type != null ? String(o.merchant_offer_raw_type) : null,
    merchantDiscountAmount: num(o.merchant_discount_amount ?? o.merchantDiscountAmount),
    boostPercent:
      o.boost_percent != null && Number(o.boost_percent) > 0 ? Number(o.boost_percent) : null,
    boostFlat: o.boost_flat != null && Number(o.boost_flat) > 0 ? Number(o.boost_flat) : null,
    discountedCtmUnit: num(o.discounted_ctm_unit ?? o.discountedCtmUnit),
    discountedCtmLine,
    commissionRate: num(o.commission_rate ?? o.commissionRate),
    commissionAmount: num(o.commission_amount ?? o.commissionAmount),
    customerStrikeUnit: num(o.customer_strike_unit ?? o.customerStrikeUnit),
    customerStrikeLine: num(o.customer_strike_line ?? o.customerStrikeLine),
    customerItemPriceUnit: num(o.customer_item_price_unit ?? o.customerItemPriceUnit),
    customerItemPriceLine: num(o.customer_item_price_line ?? o.customerItemPriceLine),
    merchantSettlementCtm: num(o.merchant_settlement_ctm ?? o.merchantSettlementCtm),
    merchantOfferSnapshot:
      o.merchant_offer_snapshot && typeof o.merchant_offer_snapshot === "object"
        ? (o.merchant_offer_snapshot as Record<string, unknown>)
        : {},
  };
}

/**
 * Informational BOGO qty split. Settlement still uses full fulfilled CTM.
 * Customer must order paid+free together; merchant keeps CTM for every unit.
 */
export function bogoQuantitySplit(
  fulfilledQty: number,
  buyQty: number,
  getQty: number
): { paidQuantity: number; freeQuantity: number; fulfilledQuantity: number } {
  const fulfilled = Math.max(1, Math.floor(Number(fulfilledQty) || 1));
  const buy = Math.max(1, Math.floor(Number(buyQty) || 1));
  const get = Math.max(0, Math.floor(Number(getQty) || 0));
  const group = buy + get;
  if (get <= 0 || group <= 0) {
    return { paidQuantity: fulfilled, freeQuantity: 0, fulfilledQuantity: fulfilled };
  }
  const groups = Math.floor(fulfilled / group);
  const freeQuantity = groups * get;
  return {
    paidQuantity: fulfilled - freeQuantity,
    freeQuantity,
    fulfilledQuantity: fulfilled,
  };
}

/** Invariant check used by tests and placement. */
export function assertItemPricingInvariants(p: ItemPricingResult): void {
  if (p.baseCtmLine + 0.001 < p.discountedCtmLine) {
    throw new Error("base_ctm must be >= discounted_ctm");
  }
  if (p.discountedCtmLine < -0.001) {
    throw new Error("discounted_ctm must be >= 0");
  }
  const expectedUnit = markupRupeesPaise(p.discountedCtmUnit, p.commissionRate);
  if (Math.abs(expectedUnit - p.customerItemPriceUnit) > 0.005) {
    throw new Error("customer item price must equal gross-up(discounted CTM)");
  }
}

/** Paise helper re-export for callers that snapshot in minor units. */
export function itemPricingToPaise(p: ItemPricingResult) {
  return {
    base_ctm: rupeesToPaise(p.baseCtmLine),
    discounted_ctm: rupeesToPaise(p.discountedCtmLine),
    customer_item_price: rupeesToPaise(p.customerItemPriceLine),
    commission_amount: rupeesToPaise(p.commissionAmount),
    merchant_discount: rupeesToPaise(p.merchantDiscountAmount),
  };
}
