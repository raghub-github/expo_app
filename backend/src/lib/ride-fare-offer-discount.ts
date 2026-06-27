import { and, eq, ilike } from "drizzle-orm";
import type { getDb } from "../db/client.js";
import { billingPlatformOffers, merchantOffers } from "../db/schema.js";

type Db = ReturnType<typeof getDb>;

function roundInr(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function estimatePlatformDiscount(
  row: typeof billingPlatformOffers.$inferSelect,
  fareSubtotal: number,
): number {
  const min = num(row.minOrderAmount);
  if (min > 0 && fareSubtotal + 0.005 < min) return 0;
  const dt = String(row.discountType ?? "").toUpperCase();
  const v = num(row.valueNumeric);
  const cap = num(row.maxDiscountAmount);
  let saving = 0;
  if (dt === "FIXED" && v > 0) saving = v;
  else if (dt === "PERCENTAGE" && v > 0 && fareSubtotal > 0) {
    saving = (fareSubtotal * v) / 100;
    if (cap > 0) saving = Math.min(saving, cap);
  }
  return roundInr(Math.min(Math.max(0, saving), fareSubtotal));
}

function estimateMerchantDiscount(
  row: typeof merchantOffers.$inferSelect,
  fareSubtotal: number,
): number {
  const min = num(row.minOrderAmount);
  if (min > 0 && fareSubtotal + 0.005 < min) return 0;
  const pct = num(row.discountPercentage);
  const fixed = num(row.discountValue);
  const cap = num(row.maxDiscountAmount);
  let saving = 0;
  if (pct > 0) {
    saving = (fareSubtotal * pct) / 100;
    if (cap > 0) saving = Math.min(saving, cap);
  } else if (fixed > 0) {
    saving = fixed;
    if (cap > 0) saving = Math.min(saving, cap);
  }
  return roundInr(Math.min(Math.max(0, saving), fareSubtotal));
}

function serviceMatches(serviceType: string | null | undefined): boolean {
  const s = String(serviceType ?? "FOOD").toUpperCase();
  return s === "RIDE" || s === "ALL";
}

export async function resolveRideFareOfferDiscount(
  db: Db,
  opts: {
    fareSubtotal: number;
    couponCode?: string | null;
    platformOfferId?: number | null;
  },
): Promise<number> {
  const fare = roundInr(opts.fareSubtotal);
  if (fare <= 0.005) return 0;

  if (opts.platformOfferId != null && opts.platformOfferId > 0) {
    const [row] = await db
      .select()
      .from(billingPlatformOffers)
      .where(
        and(
          eq(billingPlatformOffers.id, opts.platformOfferId),
          eq(billingPlatformOffers.isActive, true),
        ),
      )
      .limit(1);
    if (row && serviceMatches(row.serviceType)) {
      const discount = estimatePlatformDiscount(row, fare);
      if (discount > 0.005) return discount;
    }
  }

  const code = opts.couponCode?.trim();
  if (code) {
    const [merchantRow] = await db
      .select()
      .from(merchantOffers)
      .where(and(eq(merchantOffers.isActive, true), ilike(merchantOffers.couponCode, code)))
      .limit(1);
    if (merchantRow) {
      const discount = estimateMerchantDiscount(merchantRow, fare);
      if (discount > 0.005) return discount;
    }
  }

  return 0;
}
