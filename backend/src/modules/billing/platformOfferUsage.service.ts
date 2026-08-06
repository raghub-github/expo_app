/**
 * Platform offer redemption ledger — usage limits, budget, cancel/refund restore.
 * Store / merchant offer engines are intentionally untouched.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getSql } from "../../db/client.js";
import {
  billingPlatformOffers,
  platformOfferUsages,
} from "../../db/schema.js";
import type { PlatformOfferRow } from "./types.js";

const ACTIVE_USAGE_STATUSES = ["reserved", "consumed"] as const;

function asOrderPk(orderId: string | number | null | undefined): number | null {
  if (orderId == null) return null;
  if (typeof orderId === "number" && Number.isFinite(orderId) && orderId > 0) {
    return Math.floor(orderId);
  }
  const digits = String(orderId).replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type PlatformOfferUsageCounts = {
  lifetime: number;
  day: number;
  month: number;
};

/** Count active (reserved|consumed) redemptions for a customer against one offer. */
export async function loadPlatformOfferUsageCountsForUser(
  _db: PostgresJsDatabase<Record<string, unknown>>,
  customerId: number,
  offerIds: number[]
): Promise<Map<number, PlatformOfferUsageCounts>> {
  const out = new Map<number, PlatformOfferUsageCounts>();
  if (!customerId || offerIds.length === 0) return out;

  const sqlClient = getSql();
  const rows = await sqlClient<
    Array<{ offer_id: number; lifetime: number; day_count: number; month_count: number }>
  >`
    SELECT
      platform_offer_id::bigint AS offer_id,
      COUNT(*) FILTER (
        WHERE status IN ('reserved', 'consumed')
      )::int AS lifetime,
      COUNT(*) FILTER (
        WHERE status IN ('reserved', 'consumed')
          AND applied_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
      )::int AS day_count,
      COUNT(*) FILTER (
        WHERE status IN ('reserved', 'consumed')
          AND applied_at >= date_trunc('month', now() AT TIME ZONE 'UTC')
      )::int AS month_count
    FROM platform_offer_usages
    WHERE customer_id = ${customerId}
      AND platform_offer_id IN ${sqlClient(offerIds)}
    GROUP BY platform_offer_id
  `;

  for (const r of rows) {
    const id = Number(r.offer_id ?? 0);
    if (!(id > 0)) continue;
    out.set(id, {
      lifetime: Number(r.lifetime ?? 0) || 0,
      day: Number(r.day_count ?? 0) || 0,
      month: Number(r.month_count ?? 0) || 0,
    });
  }
  return out;
}

/** Total active redemptions for offers (lifetime campaign cap). */
export async function loadPlatformOfferLifetimeUseCounts(
  db: PostgresJsDatabase<Record<string, unknown>>,
  offerIds: number[]
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (offerIds.length === 0) return out;

  const rows = await db
    .select({
      offerId: platformOfferUsages.platformOfferId,
      cnt: sql<number>`count(*)::int`,
    })
    .from(platformOfferUsages)
    .where(
      and(
        inArray(platformOfferUsages.platformOfferId, offerIds),
        inArray(platformOfferUsages.status, [...ACTIVE_USAGE_STATUSES])
      )
    )
    .groupBy(platformOfferUsages.platformOfferId);

  for (const r of rows) out.set(r.offerId, r.cnt);
  return out;
}

export function platformOfferUsageLimitsPass(
  o: PlatformOfferRow,
  userCounts: PlatformOfferUsageCounts | undefined,
  lifetimeTotal: number | undefined
): boolean {
  const perUser = o.maxUsesPerUser;
  if (perUser != null && perUser > 0) {
    const used = userCounts?.lifetime ?? 0;
    if (used >= perUser) return false;
  }
  const perDay = o.maxUsesPerDay;
  if (perDay != null && perDay > 0) {
    const used = userCounts?.day ?? 0;
    if (used >= perDay) return false;
  }
  const perMonth = o.maxUsesPerMonth;
  if (perMonth != null && perMonth > 0) {
    const used = userCounts?.month ?? 0;
    if (used >= perMonth) return false;
  }
  const total = o.maxUsesTotal;
  if (total != null && total > 0) {
    const used = lifetimeTotal ?? 0;
    if (used >= total) return false;
  }
  return true;
}

export function platformOfferBudgetAvailable(o: PlatformOfferRow, extraDiscount = 0): boolean {
  const budgetTotal = o.budgetTotal;
  if (budgetTotal == null || !(budgetTotal > 0)) return true;
  const used = Math.max(0, o.budgetUsed ?? 0);
  return used + Math.max(0, extraDiscount) <= budgetTotal + 1e-6;
}

export type RecordPlatformOfferUsageInput = {
  platformOfferId: number;
  customerId: number;
  orderId: string | number;
  discountAmount: number;
  consumeMode?: string | null;
  /** Order payable / grand total at placement — frozen for sales analytics. */
  orderSaleAmount?: number | null;
};

/**
 * Atomically reserve/consume usage + budget at order placement.
 * Duplicate (offer, order) inserts are ignored (concurrency safe).
 */
export async function recordPlatformOfferUsageAtPlacement(
  tx: PostgresJsDatabase<Record<string, unknown>>,
  input: RecordPlatformOfferUsageInput
): Promise<{ ok: boolean; status: string }> {
  const offerId = input.platformOfferId;
  const customerId = input.customerId;
  if (!(offerId > 0) || !(customerId > 0)) return { ok: false, status: "invalid" };

  const orderPk = asOrderPk(input.orderId);
  const orderIdText = String(input.orderId ?? "").trim() || null;
  const discount = Math.max(0, Number(input.discountAmount) || 0);
  const saleRaw = input.orderSaleAmount;
  const orderSaleAmount =
    saleRaw != null && Number.isFinite(Number(saleRaw)) && Number(saleRaw) >= 0
      ? String(Number(saleRaw))
      : null;

  // Lock offer row so concurrent placements serialize limit + budget checks.
  const [offerCfg] = await tx
    .select({
      consumeMode: billingPlatformOffers.consumeMode,
      maxUsesTotal: billingPlatformOffers.maxUsesTotal,
      maxUsesPerUser: billingPlatformOffers.maxUsesPerUser,
      maxUsesPerDay: billingPlatformOffers.maxUsesPerDay,
      maxUsesPerMonth: billingPlatformOffers.maxUsesPerMonth,
    })
    .from(billingPlatformOffers)
    .where(eq(billingPlatformOffers.id, offerId))
    .limit(1)
    .for("update");

  const mode = String(
    input.consumeMode ?? offerCfg?.consumeMode ?? "ON_PLACED"
  ).toUpperCase();
  const status = mode === "ON_DELIVERED" ? "reserved" : "consumed";
  const now = new Date();

  const inserted = await tx
    .insert(platformOfferUsages)
    .values({
      platformOfferId: offerId,
      customerId,
      orderId: orderPk,
      orderIdText,
      status,
      appliedAt: now,
      consumedAt: status === "consumed" ? now : null,
      discountAmount: String(discount),
      consumedBudget: status === "consumed" ? String(discount) : "0",
      usageCount: 1,
      metadata: {
        consume_mode: mode,
        audit_event: "customer_redemption",
        audit_at: now.toISOString(),
      },
    } as never)
    .onConflictDoNothing()
    .returning({ id: platformOfferUsages.id });

  if (!inserted.length) {
    return { ok: true, status: "already_recorded" };
  }

  // Best-effort: freeze sale amount when analytics migration (0493/0483) is applied.
  if (orderSaleAmount != null) {
    try {
      await tx.execute(sql`
        UPDATE platform_offer_usages
        SET order_sale_amount = ${orderSaleAmount}::numeric
        WHERE id = ${inserted[0]!.id}
          AND EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'platform_offer_usages'
              AND column_name = 'order_sale_amount'
          )
      `);
    } catch {
      /* column may not exist yet */
    }
  }

  // Re-check usage caps under the offer lock (eligibility counts are race-prone).
  // Must use `tx` (same connection) so FOR UPDATE + insert are visible together.
  const peerRows = await tx
    .select({
      id: platformOfferUsages.id,
      customerId: platformOfferUsages.customerId,
      status: platformOfferUsages.status,
      appliedAt: platformOfferUsages.appliedAt,
    })
    .from(platformOfferUsages)
    .where(
      and(
        eq(platformOfferUsages.platformOfferId, offerId),
        inArray(platformOfferUsages.status, [...ACTIVE_USAGE_STATUSES])
      )
    );

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), 1));

  let userLifetime = 0;
  let userDay = 0;
  let userMonth = 0;
  let lifeTotal = 0;
  for (const r of peerRows) {
    if (r.id === inserted[0]!.id) continue;
    lifeTotal += 1;
    if (r.customerId !== customerId) continue;
    userLifetime += 1;
    const applied = r.appliedAt ? new Date(r.appliedAt) : null;
    if (applied && applied >= dayStart) userDay += 1;
    if (applied && applied >= monthStart) userMonth += 1;
  }

  const limitsOk = platformOfferUsageLimitsPass(
    {
      maxUsesTotal: offerCfg?.maxUsesTotal ?? null,
      maxUsesPerUser: offerCfg?.maxUsesPerUser ?? null,
      maxUsesPerDay: offerCfg?.maxUsesPerDay ?? null,
      maxUsesPerMonth: offerCfg?.maxUsesPerMonth ?? null,
    } as PlatformOfferRow,
    { lifetime: userLifetime, day: userDay, month: userMonth },
    lifeTotal
  );
  if (!limitsOk) {
    await tx
      .update(platformOfferUsages)
      .set({
        status: "cancelled",
        cancelledAt: now,
        updatedAt: now,
        metadata: sql`COALESCE(metadata, '{}'::jsonb) || '{"reason":"usage_limit_exceeded"}'::jsonb`,
      })
      .where(eq(platformOfferUsages.id, inserted[0]!.id));
    return { ok: false, status: "usage_limit_exceeded" };
  }

  if (status === "consumed" && discount > 0) {
    const updated = await tx
      .update(billingPlatformOffers)
      .set({
        budgetUsed: sql`COALESCE(budget_used, 0) + ${discount}`,
        updatedAt: now,
      })
      .where(
        and(
          eq(billingPlatformOffers.id, offerId),
          sql`(budget_total IS NULL OR budget_total::numeric <= 0 OR COALESCE(budget_used, 0) + ${discount} <= budget_total::numeric)`
        )
      )
      .returning({ id: billingPlatformOffers.id });

    if (!updated.length) {
      // Roll back the usage row so the customer can retry later
      await tx
        .update(platformOfferUsages)
        .set({
          status: "cancelled",
          cancelledAt: now,
          updatedAt: now,
          metadata: sql`COALESCE(metadata, '{}'::jsonb) || '{"reason":"budget_exhausted"}'::jsonb`,
        })
        .where(eq(platformOfferUsages.id, inserted[0]!.id));
      return { ok: false, status: "budget_exhausted" };
    }
  }

  return { ok: true, status };
}

/** Finalize reserved → consumed on delivery (ON_DELIVERED). */
export async function consumePlatformOfferUsagesOnDelivery(
  db: PostgresJsDatabase<Record<string, unknown>>,
  orderId: string | number
): Promise<void> {
  const orderPk = asOrderPk(orderId);
  const orderIdText = String(orderId ?? "").trim();
  if (!orderPk && !orderIdText) return;
  const now = new Date();

  const rows = await db
    .select()
    .from(platformOfferUsages)
    .where(
      and(
        eq(platformOfferUsages.status, "reserved"),
        orderPk
          ? eq(platformOfferUsages.orderId, orderPk)
          : eq(platformOfferUsages.orderIdText, orderIdText)
      )
    );

  for (const row of rows) {
    const discount = Number(row.discountAmount ?? 0) || 0;
    await db.transaction(async (tx) => {
      if (discount > 0) {
        const updated = await tx
          .update(billingPlatformOffers)
          .set({
            budgetUsed: sql`COALESCE(budget_used, 0) + ${discount}`,
            updatedAt: now,
          })
          .where(
            and(
              eq(billingPlatformOffers.id, row.platformOfferId),
              sql`(budget_total IS NULL OR budget_total::numeric <= 0 OR COALESCE(budget_used, 0) + ${discount} <= budget_total::numeric)`
            )
          )
          .returning({ id: billingPlatformOffers.id });

        if (!updated.length) {
          // Keep reserved if budget cannot absorb — do not silently overspend.
          await tx
            .update(platformOfferUsages)
            .set({
              updatedAt: now,
              metadata: sql`COALESCE(metadata, '{}'::jsonb) || '{"reason":"budget_exhausted_on_delivery"}'::jsonb`,
            })
            .where(eq(platformOfferUsages.id, row.id));
          return;
        }
      }

      await tx
        .update(platformOfferUsages)
        .set({
          status: "consumed",
          consumedAt: now,
          consumedBudget: String(discount),
          updatedAt: now,
          metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
            audit_event: "consume_on_delivered",
            audit_at: now.toISOString(),
          })}::jsonb`,
        })
        .where(and(eq(platformOfferUsages.id, row.id), eq(platformOfferUsages.status, "reserved")));
    });
  }
}

async function releaseUsages(
  db: PostgresJsDatabase<Record<string, unknown>>,
  orderId: string | number,
  nextStatus: "cancelled" | "refunded",
  restoreFlag: "restoreOnCancel" | "restoreOnRefund"
): Promise<void> {
  const orderPk = asOrderPk(orderId);
  const orderIdText = String(orderId ?? "").trim();
  if (!orderPk && !orderIdText) return;
  const now = new Date();

  const rows = await db
    .select({
      usage: platformOfferUsages,
      restoreOnCancel: billingPlatformOffers.restoreOnCancel,
      restoreOnRefund: billingPlatformOffers.restoreOnRefund,
    })
    .from(platformOfferUsages)
    .innerJoin(
      billingPlatformOffers,
      eq(billingPlatformOffers.id, platformOfferUsages.platformOfferId)
    )
    .where(
      and(
        inArray(platformOfferUsages.status, ["reserved", "consumed"]),
        orderPk
          ? eq(platformOfferUsages.orderId, orderPk)
          : eq(platformOfferUsages.orderIdText, orderIdText)
      )
    );

  for (const row of rows) {
    const allow =
      restoreFlag === "restoreOnCancel" ? row.restoreOnCancel !== false : row.restoreOnRefund !== false;
    if (!allow) continue;

    const u = row.usage;
    const wasConsumed = u.status === "consumed";
    const budgetToRestore = wasConsumed ? Number(u.consumedBudget ?? u.discountAmount ?? 0) || 0 : 0;

    await db.transaction(async (tx) => {
      const auditEvent =
        nextStatus === "cancelled" ? "rollback_on_cancel" : "refund_restore";
      await tx
        .update(platformOfferUsages)
        .set({
          status: nextStatus,
          cancelledAt: nextStatus === "cancelled" ? now : u.cancelledAt,
          refundedAt: nextStatus === "refunded" ? now : u.refundedAt,
          updatedAt: now,
          metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
            audit_event: auditEvent,
            audit_at: now.toISOString(),
            previous_status: u.status,
            budget_restored: budgetToRestore,
          })}::jsonb`,
        })
        .where(
          and(
            eq(platformOfferUsages.id, u.id),
            inArray(platformOfferUsages.status, ["reserved", "consumed"])
          )
        );

      if (budgetToRestore > 0) {
        await tx
          .update(billingPlatformOffers)
          .set({
            budgetUsed: sql`GREATEST(0, COALESCE(budget_used, 0) - ${budgetToRestore})`,
            updatedAt: now,
          })
          .where(eq(billingPlatformOffers.id, u.platformOfferId));
      }
    });
  }
}

export async function releasePlatformOfferUsagesOnCancel(
  db: PostgresJsDatabase<Record<string, unknown>>,
  orderId: string | number
): Promise<void> {
  await releaseUsages(db, orderId, "cancelled", "restoreOnCancel");
}

export async function releasePlatformOfferUsagesOnRefund(
  db: PostgresJsDatabase<Record<string, unknown>>,
  orderId: string | number
): Promise<void> {
  await releaseUsages(db, orderId, "refunded", "restoreOnRefund");
}
