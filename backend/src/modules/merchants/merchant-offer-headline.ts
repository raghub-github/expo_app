/**
 * Offer headlines for merchant list cards (Boost / BOGO / Precision).
 * Multiple active offers are joined with " | " for the client ticker.
 */

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { merchantOffers } from "../../db/schema.js";
import {
  parseMenuItemIdsFromMeta,
  parseConditionsModeFromMeta,
} from "../offers/offer-display-surface.js";

function n(v: unknown): number | null {
  if (v == null) return null;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : null;
}

/** Card list must not show delivery-only promos. */
export function isDeliveryOnlyOffer(type: string, offerTitle: string | null, headline?: string): boolean {
  const t = String(type ?? "").toUpperCase();
  if (t === "FREE_DELIVERY") return true;
  const blob = `${offerTitle ?? ""} ${headline ?? ""}`.toLowerCase();
  return /\bfree\s*delivery\b/.test(blob) || /\bfree\s*del\b/.test(blob);
}

const GENERIC_LABEL =
  /^(tiered|bundle|coupon|free item|special offer|bundle deal|coupon offer|tiered offer|spend more)\b/i;

/** Must look like a real discount line, not a campaign / type name. */
export function isCardDiscountHeadline(headline: string): boolean {
  const s = headline.trim();
  if (!s || GENERIC_LABEL.test(s)) return false;
  return /\d+\s*%|₹|%\s*off|\boff\b/i.test(s) || /^buy\s+\d+/i.test(s);
}

function isBogoType(type: string): boolean {
  const t = String(type ?? "").toUpperCase();
  return t === "BOGO" || t === "BUY_X_GET_Y" || t === "BUY_N_GET_M";
}

function normalizeSubType(sub: string | null | undefined): string {
  return String(sub ?? "")
    .toUpperCase()
    .trim()
    .replace(/[-\s]+/g, "_");
}

/** True when Boost applies only to some menu items (not the whole menu). */
export function isSelectedItemBoostScope(
  offerSubType: string | null | undefined,
  menuItemIds: string[] | null | undefined
): boolean {
  const sub = normalizeSubType(offerSubType);
  if (Array.isArray(menuItemIds) && menuItemIds.length > 0) return true;
  return (
    sub === "SPECIFIC_ITEM" ||
    sub === "SPECIFIC_ITEMS" ||
    sub === "SELECTED_ITEM" ||
    sub === "SELECTED_ITEMS" ||
    sub === "ITEM" ||
    sub === "ITEMS"
  );
}

/** Compact discount core: "40% OFF", "₹100 OFF", "Buy 2 Get 1". */
function buildOfferCore(
  type: string,
  discountPct: number | null,
  discountVal: number | null,
  buyQty: number | null,
  getQty: number | null
): string {
  if (isBogoType(type)) {
    const buy = buyQty != null && buyQty > 0 ? Math.round(buyQty) : 1;
    const get = getQty != null && getQty > 0 ? Math.round(getQty) : 1;
    return `Buy ${buy} Get ${get}`;
  }
  if (discountPct != null && discountPct > 0) {
    return `${Math.round(discountPct)}% OFF`;
  }
  if (discountVal != null && discountVal > 0) {
    return `₹${Math.round(discountVal)} OFF`;
  }
  return "";
}

export function buildListCardOfferLine(input: {
  type: string;
  offerSubType: string | null;
  discountPct: number | null;
  discountVal: number | null;
  maxDiscount: number | null;
  minOrder: number | null;
  buyQty: number | null;
  getQty: number | null;
  menuItemIds: string[] | null;
  conditionsMode: "boost" | "precision" | null;
}): string {
  if (isBogoType(input.type)) {
    return buildOfferCore(input.type, null, null, input.buyQty, input.getQty);
  }

  const core = buildOfferCore(
    input.type,
    input.discountPct,
    input.discountVal,
    input.buyQty,
    input.getQty
  );
  if (!core) return "";

  const type = String(input.type ?? "").toUpperCase();
  const isPctOrFlat = type === "PERCENTAGE" || type === "FLAT";
  const isCartish =
    type === "CART_PERCENTAGE" ||
    type === "CART_FLAT" ||
    type === "COUPON" ||
    type === "TIERED" ||
    type === "BUNDLE" ||
    type === "FREE_DELIVERY";

  const onSelected = isSelectedItemBoostScope(input.offerSubType, input.menuItemIds);
  // Explicit Precision wins; otherwise Boost for boost mode / item-scoped / legacy null.
  const isBoostMode =
    input.conditionsMode === "precision"
      ? false
      : input.conditionsMode === "boost" ||
        onSelected ||
        (input.conditionsMode == null && !isCartish && isPctOrFlat);

  // Boost (explicit / legacy null / item-scoped) — never bare "x% OFF".
  if (isPctOrFlat && !isCartish && isBoostMode) {
    if (onSelected) return `${core} on selected item`;
    return `${core} on all items`;
  }

  // Precision / cart-style
  if (input.discountPct != null && input.discountPct > 0) {
    if (input.maxDiscount != null && input.maxDiscount > 0) {
      return `${Math.round(input.discountPct)}% OFF upto ₹${Math.round(input.maxDiscount)}`;
    }
    if (input.minOrder != null && input.minOrder > 0) {
      return `${Math.round(input.discountPct)}% OFF above ₹${Math.round(input.minOrder)}`;
    }
    return `${Math.round(input.discountPct)}% OFF`;
  }
  if (input.discountVal != null && input.discountVal > 0) {
    if (input.minOrder != null && input.minOrder > 0) {
      return `₹${Math.round(input.discountVal)} OFF above ₹${Math.round(input.minOrder)}`;
    }
    return `₹${Math.round(input.discountVal)} OFF`;
  }
  return core;
}

/**
 * Checkout Coupons & offers sheet title — never campaign names like
 * "Precision" / "Percentage discount".
 * Precision → "Flat X% Off" (optional "up to ₹Y")
 * Boost     → "X% off up to ₹Y" (or "X% Off" if no cap)
 * BOGO      → "Buy one get one" / "Buy X Get Y"
 */
export function buildCheckoutOfferDisplayTitle(input: {
  type: string;
  offerTitle?: string | null;
  discountPct: number | null;
  discountVal: number | null;
  maxDiscount: number | null;
  buyQty: number | null;
  getQty: number | null;
  conditionsMode: "boost" | "precision" | null;
}): string {
  const type = String(input.type ?? "").toUpperCase();
  if (isBogoType(type)) {
    const buy = input.buyQty != null && input.buyQty > 0 ? Math.round(input.buyQty) : 1;
    const get = input.getQty != null && input.getQty > 0 ? Math.round(input.getQty) : 1;
    if (buy === 1 && get === 1) return "Buy one get one";
    return `Buy ${buy} Get ${get}`;
  }

  const isPrecision = input.conditionsMode === "precision";
  const max =
    input.maxDiscount != null && input.maxDiscount > 0 ? Math.round(input.maxDiscount) : null;

  if (input.discountPct != null && input.discountPct > 0) {
    const pct = Math.round(input.discountPct);
    if (isPrecision) {
      return max != null ? `Flat ${pct}% Off up to ₹${max}` : `Flat ${pct}% Off`;
    }
    return max != null ? `${pct}% off up to ₹${max}` : `${pct}% Off`;
  }

  if (input.discountVal != null && input.discountVal > 0) {
    const flat = Math.round(input.discountVal);
    if (isPrecision) {
      return max != null ? `Flat ₹${flat} Off up to ₹${max}` : `Flat ₹${flat} Off`;
    }
    return max != null ? `₹${flat} off up to ₹${max}` : `₹${flat} Off`;
  }

  const raw = String(input.offerTitle ?? "").trim();
  if (raw && !/^(precision|percentage\s*discount|boost|percentage)$/i.test(raw)) {
    return raw;
  }
  return "Store offer";
}

const MAX_LINES_PER_STORE = 5;

/**
 * Active offer lines per store (pipe-joined for list-card ticker).
 * Boost selected → "x% OFF on selected item"
 * Boost all      → "x% OFF on all items"
 * Precision      → "x% OFF upto ₹Y"
 * BOGO           → "Buy X Get Y"
 */
export async function getPrimaryOfferHeadlinesForStores(
  storeInternalIds: number[]
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const ids = [...new Set(storeInternalIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return map;

  const db = getDb();
  const now = new Date();
  const rows = await db
    .select({
      id: merchantOffers.id,
      storeId: merchantOffers.storeId,
      offerTitle: merchantOffers.offerTitle,
      offerType: merchantOffers.offerType,
      offerSubType: merchantOffers.offerSubType,
      discountValue: merchantOffers.discountValue,
      discountPercentage: merchantOffers.discountPercentage,
      maxDiscountAmount: merchantOffers.maxDiscountAmount,
      minOrderAmount: merchantOffers.minOrderAmount,
      buyQuantity: merchantOffers.buyQuantity,
      getQuantity: merchantOffers.getQuantity,
      displayPriority: merchantOffers.displayPriority,
      offerMetadata: merchantOffers.offerMetadata,
    })
    .from(merchantOffers)
    .where(
      and(
        inArray(merchantOffers.storeId, ids),
        eq(merchantOffers.isActive, true),
        lte(merchantOffers.validFrom, now),
        gte(merchantOffers.validTill, now),
        sql`COALESCE(${merchantOffers.lifecycleStatus}, 'ACTIVE') IN ('ACTIVE', 'SCHEDULED')`
      )
    );

  const ranked = [...rows].sort((a, b) => {
    const pa = n(a.displayPriority) ?? 0;
    const pb = n(b.displayPriority) ?? 0;
    if (pb !== pa) return pb - pa;
    const pctA = n(a.discountPercentage) ?? 0;
    const pctB = n(b.discountPercentage) ?? 0;
    if (pctB !== pctA) return pctB - pctA;
    return Number(b.id) - Number(a.id);
  });

  const linesByStore = new Map<number, string[]>();

  for (const r of ranked) {
    const sid = r.storeId;
    if (sid == null) continue;
    const offerType = String(r.offerType ?? "PERCENTAGE");
    const meta =
      r.offerMetadata && typeof r.offerMetadata === "object"
        ? (r.offerMetadata as Record<string, unknown>)
        : {};
    const menuItemIds = parseMenuItemIdsFromMeta(meta);
    const conditionsMode = parseConditionsModeFromMeta(meta);
    const headline = buildListCardOfferLine({
      type: offerType,
      offerSubType: r.offerSubType ?? null,
      discountPct: n(r.discountPercentage),
      discountVal: n(r.discountValue),
      maxDiscount: n(r.maxDiscountAmount),
      minOrder: n(r.minOrderAmount),
      buyQty: r.buyQuantity != null ? Number(r.buyQuantity) : null,
      getQty: r.getQuantity != null ? Number(r.getQuantity) : null,
      menuItemIds,
      conditionsMode,
    });
    if (!headline || !isCardDiscountHeadline(headline)) continue;
    if (isDeliveryOnlyOffer(offerType, r.offerTitle, headline)) continue;

    const list = linesByStore.get(sid) ?? [];
    if (list.length >= MAX_LINES_PER_STORE) continue;
    if (list.includes(headline)) continue;
    list.push(headline);
    linesByStore.set(sid, list);
  }

  for (const [sid, lines] of linesByStore) {
    if (lines.length > 0) map.set(sid, lines.join(" | "));
  }

  return map;
}
