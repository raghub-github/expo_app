import { eq } from "drizzle-orm";
import { getDb, getSql } from "../db/client.js";
import { ordersCore, ordersFood } from "../db/schema.js";
import { resolveGeoLocation } from "../modules/billing/geoLocationResolver.js";
import { pickMostSpecificGeoAnchor } from "../modules/ride-state-config/rideStateConfig.repository.js";
import { loadEffectiveServicePayoutRule } from "../modules/rider-payout-pricing/riderPayoutPricing.repository.js";
import { computeWaitingCharge } from "../modules/rides/pricing/rideWaitingCharge.js";
import {
  readRideRiderPayoutSnapshot,
  writeRideRiderPayoutSnapshot,
  type RideRiderPayoutSnapshot,
} from "./ride-rider-payout-snapshot.js";
import { computeRidePickupWaitSeconds } from "./ride-pickup-wait.js";
import { applyMerchantFundedWaitingDebit } from "./merchant-funded-waiting-debit.js";
import {
  resolveFoodWaitingFreeBudgetSeconds,
  resolveBulkOrderExtraGraceMinutes,
  type WaitingStartMode,
} from "./food-waiting-start.js";

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * After the rider marks a food order picked up: compute the waiting charge (funding-split
 * aware, resolved from service_payout_rules for the food service at the order's drop geo —
 * same anchor used for the rider's base payout, see resolveOrderRiderPayoutBreakdown), credit
 * the full amount to the rider's frozen accept-time payout snapshot, and — only when the
 * order isn't already paid — add the customer-funded share to the bill. Food defaults to
 * COMPANY_100 funding (migration 0532), so in the common case customerWaiting is 0 and the
 * already-captured customer payment is never touched; the company-funded share is still
 * recorded in billing_snapshot for settlement/subsidy accounting either way.
 */
export async function applyFoodPickupWaitingToBilling(
  orderCorePk: number
): Promise<{ customerWaiting: number; riderWaiting: number } | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: ordersCore.id,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      billingSnapshot: ordersCore.billingSnapshot,
      grandTotal: ordersCore.grandTotal,
      tipAmount: ordersCore.tipAmount,
      paymentStatus: ordersCore.paymentStatus,
      riderReachedPickupAt: ordersFood.riderReachedPickupAt,
      pickupWaitSeconds: ordersFood.pickupWaitSeconds,
      ordersFoodId: ordersFood.id,
      merchantStoreId: ordersFood.merchantStoreId,
      prepReadyByAt: ordersFood.prepReadyByAt,
      foodItemsTotalValue: ordersFood.foodItemsTotalValue,
      foodItemsCount: ordersFood.foodItemsCount,
    })
    .from(ordersCore)
    .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
    .where(eq(ordersCore.id, orderCorePk))
    .limit(1);

  if (!row?.id) return null;

  const prevSnap =
    row.billingSnapshot != null && typeof row.billingSnapshot === "object"
      ? (row.billingSnapshot as Record<string, unknown>)
      : {};
  // Finalize is guarded to run once per order at the call site; this is a cheap extra guard.
  if (prevSnap.waiting_charge != null) {
    return {
      customerWaiting: Number(prevSnap.waiting_customer_share) || 0,
      riderWaiting: 0,
    };
  }

  const waitSeconds =
    row.pickupWaitSeconds != null
      ? Math.max(0, Number(row.pickupWaitSeconds) || 0)
      : row.riderReachedPickupAt
        ? computeRidePickupWaitSeconds(row.riderReachedPickupAt, new Date())
        : 0;

  if (waitSeconds <= 0) return { customerWaiting: 0, riderWaiting: 0 };

  let freeMinutes = 2;
  let chargePerMin = 0;
  let waitingMax: number | null = null;
  let waitingMaxMinutes: number | null = null;
  let waitingStartMode: WaitingStartMode = "FIXED_GRACE";
  let waitingKptGraceMinutes = 0;
  let bulkValueThreshold: number | null = null;
  let bulkItemThreshold: number | null = null;
  let bulkExtraGraceMinutes: number | null = null;
  let fundingMode: "CUSTOMER_100" | "COMPANY_100" | "MERCHANT_100" | "SHARED" = "COMPANY_100";
  let customerSharePct = 0;
  let companySharePct = 100;

  try {
    // Food's payout geo anchor is the DROP location (matches resolveOrderRiderPayoutBreakdown's
    // non-ride branch), not pickup — keeps this in sync with the node used for the base earning.
    const geo = await resolveGeoLocation({
      latitude: Number(row.dropLat),
      longitude: Number(row.dropLon),
    });
    const anchor = pickMostSpecificGeoAnchor(geo.refs);
    if (anchor) {
      const { rule } = await loadEffectiveServicePayoutRule({
        level: anchor.level,
        refId: anchor.refId,
        service: "food",
      });
      if (rule) {
        freeMinutes = Math.max(0, Math.round(rule.waitingFreeMinutes ?? 2));
        chargePerMin = Math.max(0, Number(rule.waitingChargePerMin ?? 0));
        waitingMax = rule.waitingMaxCharge;
        waitingMaxMinutes = rule.waitingMaxMinutes;
        waitingStartMode = rule.waitingStartMode ?? "FIXED_GRACE";
        waitingKptGraceMinutes = Math.max(0, Number(rule.waitingKptGraceMinutes ?? 0));
        bulkValueThreshold = rule.waitingBulkValueThreshold;
        bulkItemThreshold = rule.waitingBulkItemThreshold;
        bulkExtraGraceMinutes = rule.waitingBulkExtraGraceMinutes;
        fundingMode = rule.waitingFundingMode ?? "COMPANY_100";
        customerSharePct = rule.waitingCustomerSharePct ?? 0;
        companySharePct = rule.waitingCompanySharePct ?? 100;
      }
    }
  } catch {
    /* keep defaults */
  }

  if (chargePerMin <= 0) return { customerWaiting: 0, riderWaiting: 0 };

  // Start-mode (Step 3): FIXED_GRACE keeps the arrival+grace window; KPT_PLUS_GRACE stretches
  // the free window until the merchant's ORIGINAL prep_ready_by_at + grace (frozen at accept,
  // so padding KPT afterwards can't defer waiting). Both feed the same engine as `freeMinutes`.
  const arrivalAtMs = row.riderReachedPickupAt
    ? new Date(row.riderReachedPickupAt).getTime()
    : NaN;
  const originalPrepReadyByMs = row.prepReadyByAt ? new Date(row.prepReadyByAt).getTime() : null;
  // Bulk orders (by value or item count) get extra free grace (Step 5) — a big order needs
  // more prep, so the rider isn't charged waiting for that legitimate extra time.
  const bulk = resolveBulkOrderExtraGraceMinutes({
    orderValue: row.foodItemsTotalValue == null ? null : Number(row.foodItemsTotalValue),
    itemCount: row.foodItemsCount,
    valueThreshold: bulkValueThreshold,
    itemThreshold: bulkItemThreshold,
    extraGraceMinutes: bulkExtraGraceMinutes,
  });
  const effectiveFreeSeconds =
    resolveFoodWaitingFreeBudgetSeconds({
      startMode: waitingStartMode,
      freeMinutes,
      kptGraceMinutes: waitingKptGraceMinutes,
      arrivalAtMs,
      originalPrepReadyByMs,
    }) +
    bulk.extraGraceMinutes * 60;
  const effectiveFreeMinutes = effectiveFreeSeconds / 60;

  const split = computeWaitingCharge(waitSeconds, {
    freeMinutes: effectiveFreeMinutes,
    chargePerMin,
    maxCharge: waitingMax,
    maxMinutes: waitingMaxMinutes,
    fundingMode,
    customerSharePct,
    companySharePct,
  });

  const customerWaiting = split.customerShare;
  const riderWaiting = split.capped;
  const tip = round2(Number(row.tipAmount) || 0);

  const snapshot = readRideRiderPayoutSnapshot(row.billingSnapshot);
  if (snapshot) {
    const updatedSnapshot: RideRiderPayoutSnapshot = {
      ...snapshot,
      waitingEarning: riderWaiting,
      totalEarning: round2(snapshot.baseEarning + riderWaiting + snapshot.surgeEarning + tip),
    };
    await writeRideRiderPayoutSnapshot(orderCorePk, updatedSnapshot, tip);
  }

  const sql = getSql();
  await sql`
    UPDATE orders_core
    SET billing_snapshot = COALESCE(billing_snapshot, '{}'::jsonb) || ${JSON.stringify({
      waiting_charge: customerWaiting,
      waiting_charge_gross: split.capped,
      waiting_customer_share: split.customerShare,
      waiting_company_share: split.companyShare,
      waiting_merchant_share: split.merchantShare,
      waiting_funding_mode: split.fundingMode,
      company_funded_waiting: split.companyShare,
      merchant_funded_waiting: split.merchantShare,
      waiting_is_bulk: bulk.isBulk,
      waiting_bulk_extra_grace_minutes: bulk.extraGraceMinutes,
      pickup_wait_seconds: waitSeconds,
    })}::text::jsonb,
        updated_at = NOW()
    WHERE id = ${orderCorePk}
  `;

  // MERCHANT_100 food waiting: the rider is still paid (riderWaiting above), but the store
  // bears it — debit the merchant wallet by the merchant share. Idempotent + non-blocking;
  // the obligation is already recorded in billing_snapshot above for settlement netting if
  // the immediate debit can't apply (no available balance yet).
  if (split.merchantShare > 0) {
    await applyMerchantFundedWaitingDebit({
      orderCoreId: orderCorePk,
      ordersFoodId: Number(row.ordersFoodId),
      merchantStoreId: Number(row.merchantStoreId),
      amount: split.merchantShare,
    });
  }

  // Customer bill already captured (the common food path) — never retroactively recollect.
  // Only unpaid orders (e.g. COD food) pick up the customer-funded share in grand_total.
  if (customerWaiting > 0 && row.paymentStatus !== "completed") {
    const currentGrand = Number(row.grandTotal) || 0;
    await sql`
      UPDATE orders_core
      SET grand_total = ${String(round2(currentGrand + customerWaiting))},
          updated_at = NOW()
      WHERE id = ${orderCorePk}
    `;
  }

  return { customerWaiting, riderWaiting };
}
