import { and, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { billingDiscountUsages } from "../../db/schema.js";
import type { CouponUsageSnapshot } from "./checkoutCouponConfig.js";

const ACTIVE = ["reserved", "consumed"] as const;

/**
 * Load time-windowed usage for one checkout coupon + customer from billing_discount_usages.
 */
export async function loadCheckoutCouponUsageSnapshot(
  db: PostgresJsDatabase<Record<string, unknown>>,
  customerId: number,
  discountId: number,
  now: Date = new Date()
): Promise<CouponUsageSnapshot> {
  if (!customerId || !discountId) {
    return { lifetime: 0, day: 0, week: 0, month: 0, year: 0 };
  }

  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayOfWeek = now.getUTCDay(); // 0 Sun
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setUTCDate(startOfWeek.getUTCDate() - dayOfWeek);
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  // postgres.js rejects Date params inside drizzle sql`` fragments — pass ISO strings.
  const dayIso = startOfDay.toISOString();
  const weekIso = startOfWeek.toISOString();
  const monthIso = startOfMonth.toISOString();
  const yearIso = startOfYear.toISOString();

  const rows = await db
    .select({
      lifetime: sql<number>`coalesce(sum(${billingDiscountUsages.usageCount}), 0)::int`,
      day: sql<number>`coalesce(sum(case when ${billingDiscountUsages.appliedAt} >= ${dayIso}::timestamptz then ${billingDiscountUsages.usageCount} else 0 end), 0)::int`,
      week: sql<number>`coalesce(sum(case when ${billingDiscountUsages.appliedAt} >= ${weekIso}::timestamptz then ${billingDiscountUsages.usageCount} else 0 end), 0)::int`,
      month: sql<number>`coalesce(sum(case when ${billingDiscountUsages.appliedAt} >= ${monthIso}::timestamptz then ${billingDiscountUsages.usageCount} else 0 end), 0)::int`,
      year: sql<number>`coalesce(sum(case when ${billingDiscountUsages.appliedAt} >= ${yearIso}::timestamptz then ${billingDiscountUsages.usageCount} else 0 end), 0)::int`,
    })
    .from(billingDiscountUsages)
    .where(
      and(
        eq(billingDiscountUsages.billingDiscountId, discountId),
        eq(billingDiscountUsages.customerId, customerId),
        inArray(billingDiscountUsages.status, [...ACTIVE])
      )
    );

  const r = rows[0];
  return {
    lifetime: Number(r?.lifetime ?? 0),
    day: Number(r?.day ?? 0),
    week: Number(r?.week ?? 0),
    month: Number(r?.month ?? 0),
    year: Number(r?.year ?? 0),
  };
}

/**
 * Batch usage snapshots for checkout offer listing / auto-apply candidate filtering.
 */
export async function loadCheckoutCouponUsageSnapshotsForCustomer(
  db: PostgresJsDatabase<Record<string, unknown>>,
  customerId: number,
  discountIds: number[],
  now: Date = new Date()
): Promise<Map<number, CouponUsageSnapshot>> {
  const out = new Map<number, CouponUsageSnapshot>();
  const ids = [...new Set(discountIds.filter((id) => id > 0))];
  if (!customerId || ids.length === 0) return out;

  await Promise.all(
    ids.map(async (id) => {
      out.set(id, await loadCheckoutCouponUsageSnapshot(db, customerId, id, now));
    })
  );
  return out;
}
