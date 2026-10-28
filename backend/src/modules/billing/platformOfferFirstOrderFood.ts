/**
 * First-order Free Delivery eligibility for FOOD platform offers.
 *
 * Authoritative gates (server-side only — never trust client isNewUser / userSegment):
 * 1. Offer opts into first-order via conditions.first_order_only OR
 *    (offer_kind=FREE_DELIVERY + customer_segment=NEW).
 * 2. Customer has zero delivered FOOD orders (order_type=food, status=delivered).
 * 3. Customer has no active (reserved|consumed) redemption in the shared
 *    benefit family `first_order_free_delivery` (blocks duplicate campaigns / aliases).
 *
 * Ride / Parcel / Grocery carts never receive this FOOD offer (service_type gate).
 * Cancel/refund restore is refused for this benefit family to prevent cancel-and-reorder abuse.
 */

import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getSql } from "../../db/client.js";
import { ordersCore } from "../../db/schema.js";
import type { BillContext, PlatformOfferRow } from "./types.js";

export const FIRST_ORDER_FREE_DELIVERY_BENEFIT_FAMILY = "first_order_free_delivery";

function truthyCond(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

function kindUpper(o: PlatformOfferRow): string {
  return String(o.offerKind ?? "DISCOUNT").toUpperCase().trim();
}

function segmentUpper(o: PlatformOfferRow): string {
  const row = String(o.customerSegment ?? "ALL").toUpperCase().trim();
  if (row === "NEW" || row === "EXISTING") return row;
  const cond = (o.conditions ?? {}) as Record<string, unknown>;
  const seg = String(cond.user_segment ?? "ALL").toUpperCase().trim();
  if (seg === "NEW" || seg === "EXISTING") return seg;
  return "ALL";
}

/** Explicit or implied first-order free-delivery campaign. */
export function platformOfferRequiresFirstOrderFreeDelivery(o: PlatformOfferRow): boolean {
  const cond = (o.conditions ?? {}) as Record<string, unknown>;
  if (truthyCond(cond.first_order_only)) return true;
  if (String(cond.benefit_family ?? "").trim() === FIRST_ORDER_FREE_DELIVERY_BENEFIT_FAMILY) {
    return true;
  }
  return kindUpper(o) === "FREE_DELIVERY" && segmentUpper(o) === "NEW";
}

export function platformOfferFirstOrderBenefitFamily(o: PlatformOfferRow): string | null {
  if (!platformOfferRequiresFirstOrderFreeDelivery(o)) return null;
  const cond = (o.conditions ?? {}) as Record<string, unknown>;
  const raw = String(cond.benefit_family ?? "").trim();
  return raw || FIRST_ORDER_FREE_DELIVERY_BENEFIT_FAMILY;
}

/**
 * Server-side gate for first-order free delivery.
 * Fail-closed when food history or benefit-family usage is unknown.
 */
export function platformOfferFirstOrderFreeDeliveryPasses(
  ctx: BillContext,
  o: PlatformOfferRow
): boolean {
  if (!platformOfferRequiresFirstOrderFreeDelivery(o)) return true;

  const st = String(ctx.serviceType ?? "").toUpperCase();
  if (st !== "FOOD") return false;

  const foodCount = ctx.completedFoodOrderCount;
  if (foodCount == null) return false;
  if (foodCount > 0) return false;

  const familyUses = ctx.firstOrderFreeDeliveryUsageCount;
  if (familyUses == null) return false;
  if (familyUses > 0) return false;

  return true;
}

/**
 * Qualifying prior FOOD order = orders_core.order_type = food + status delivered.
 * Cancelled / failed / rejected / unpaid never-delivered rows do not count.
 * Grocery carts still place as order_type=food when store type is grocery — those
 * delivered grocery orders also consume "first food order" eligibility (same table).
 */
export async function countDeliveredFoodOrdersForCustomer(
  db: PostgresJsDatabase<Record<string, unknown>>,
  customerId: number
): Promise<number> {
  if (!(customerId > 0)) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ordersCore)
    .where(
      and(
        eq(ordersCore.customerId, customerId),
        eq(ordersCore.orderType, "food"),
        eq(ordersCore.status, "delivered")
      )
    );
  return Number(row?.n ?? 0) || 0;
}

/**
 * Active redemptions across the shared first-order free-delivery benefit family.
 * Prefer denormalized benefit_family column when present; fall back to offer flags.
 */
/**
 * Returns null when the usage query cannot be evaluated (fail closed at the gate).
 */
export async function countFirstOrderFreeDeliveryUsagesForCustomer(
  _db: PostgresJsDatabase<Record<string, unknown>>,
  customerId: number
): Promise<number | null> {
  if (!(customerId > 0)) return 0;
  const sqlClient = getSql();
  try {
    const rows = await sqlClient<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n
      FROM platform_offer_usages u
      INNER JOIN billing_platform_offers o ON o.id = u.platform_offer_id
      WHERE u.customer_id = ${customerId}
        AND u.status IN ('reserved', 'consumed')
        AND (
          COALESCE(u.benefit_family, '') = ${FIRST_ORDER_FREE_DELIVERY_BENEFIT_FAMILY}
          OR COALESCE(o.conditions->>'benefit_family', '') = ${FIRST_ORDER_FREE_DELIVERY_BENEFIT_FAMILY}
          OR (
            UPPER(COALESCE(o.offer_kind, '')) = 'FREE_DELIVERY'
            AND (
              UPPER(COALESCE(o.customer_segment, 'ALL')) = 'NEW'
              OR COALESCE(o.conditions->>'first_order_only', 'false') IN ('true', '1')
            )
          )
        )
    `;
    return Number(rows[0]?.n ?? 0) || 0;
  } catch {
    // Prefer offer-flag path without benefit_family column (pre-migration).
    try {
      const rows = await sqlClient<Array<{ n: number }>>`
        SELECT COUNT(*)::int AS n
        FROM platform_offer_usages u
        INNER JOIN billing_platform_offers o ON o.id = u.platform_offer_id
        WHERE u.customer_id = ${customerId}
          AND u.status IN ('reserved', 'consumed')
          AND UPPER(COALESCE(o.offer_kind, '')) = 'FREE_DELIVERY'
          AND (
            UPPER(COALESCE(o.customer_segment, 'ALL')) = 'NEW'
            OR COALESCE(o.conditions->>'first_order_only', 'false') IN ('true', '1')
            OR COALESCE(o.conditions->>'benefit_family', '') = ${FIRST_ORDER_FREE_DELIVERY_BENEFIT_FAMILY}
          )
      `;
      return Number(rows[0]?.n ?? 0) || 0;
    } catch {
      return null;
    }
  }
}

export function firstOrderFreeDeliveryIneligibilityReason(
  ctx: BillContext,
  o: PlatformOfferRow
): string | null {
  if (!platformOfferRequiresFirstOrderFreeDelivery(o)) return null;
  const st = String(ctx.serviceType ?? "").toUpperCase();
  if (st !== "FOOD") return "first_order_free_delivery=not_food_service";
  if (ctx.completedFoodOrderCount == null) return "first_order_free_delivery=unknown_food_history";
  if (ctx.completedFoodOrderCount > 0) {
    return `first_order_free_delivery=has_${ctx.completedFoodOrderCount}_delivered_food_orders`;
  }
  if (ctx.firstOrderFreeDeliveryUsageCount == null) {
    return "first_order_free_delivery=unknown_benefit_usage";
  }
  if (ctx.firstOrderFreeDeliveryUsageCount > 0) {
    return "first_order_free_delivery=benefit_already_redeemed";
  }
  return null;
}
