/**
 * Primary offer headline for merchant list cards (Swiggy-style: ₹/%-OFF only).
 */

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { merchantOffers } from "../../db/schema.js";

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

/** e.g. "40% OFF up to ₹80", "₹100 OFF" — numeric discount only. */
function buildOfferLabel(
  type: string,
  discountPct: number | null,
  discountVal: number | null,
  maxDiscount: number | null
): string {
  if (discountPct != null && discountPct > 0) {
    const pct = Math.round(discountPct);
    if (maxDiscount != null && maxDiscount > 0) {
      return `${pct}% OFF up to ₹${Math.round(maxDiscount)}`;
    }
    return `${pct}% OFF`;
  }
  if (discountVal != null && discountVal > 0) {
    return `₹${Math.round(discountVal)} OFF`;
  }

  const t = String(type ?? "").toUpperCase();
  if (t === "BOGO" || t === "BUY_X_GET_Y" || t === "BUY_N_GET_M") return "Buy 1 Get 1";
  if (maxDiscount != null && maxDiscount > 0) return `Up to ₹${Math.round(maxDiscount)} OFF`;
  return "";
}

function buildCardOfferHeadline(
  type: string,
  discountPct: number | null,
  discountVal: number | null,
  maxDiscount: number | null,
  minOrder: number | null
): string {
  const label = buildOfferLabel(type, discountPct, discountVal, maxDiscount);
  if (!label) return "";
  if (minOrder != null && minOrder > 0) {
    return `${label} above ₹${Math.round(minOrder)}`;
  }
  return label;
}

/** Highest-priority active offer with a discount line per store internal id. */
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
      storeId: merchantOffers.storeId,
      offerTitle: merchantOffers.offerTitle,
      offerType: merchantOffers.offerType,
      discountValue: merchantOffers.discountValue,
      discountPercentage: merchantOffers.discountPercentage,
      maxDiscountAmount: merchantOffers.maxDiscountAmount,
      minOrderAmount: merchantOffers.minOrderAmount,
      displayPriority: merchantOffers.displayPriority,
    })
    .from(merchantOffers)
    .where(
      and(
        inArray(merchantOffers.storeId, ids),
        eq(merchantOffers.isActive, true),
        lte(merchantOffers.validFrom, now),
        gte(merchantOffers.validTill, now)
      )
    );

  const ranked = [...rows].sort((a, b) => {
    const pa = n(a.displayPriority) ?? 0;
    const pb = n(b.displayPriority) ?? 0;
    if (pb !== pa) return pb - pa;
    return (a.storeId ?? 0) - (b.storeId ?? 0);
  });

  for (const r of ranked) {
    const sid = r.storeId;
    if (sid == null || map.has(sid)) continue;
    const offerType = String(r.offerType ?? "PERCENTAGE");
    const headline = buildCardOfferHeadline(
      offerType,
      n(r.discountPercentage),
      n(r.discountValue),
      n(r.maxDiscountAmount),
      n(r.minOrderAmount)
    );
    if (!headline || !isCardDiscountHeadline(headline)) continue;
    if (isDeliveryOnlyOffer(offerType, r.offerTitle, headline)) continue;
    map.set(sid, headline);
  }

  return map;
}
