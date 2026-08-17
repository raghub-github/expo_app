import { eq } from "drizzle-orm";
import { getDb, getSql } from "../db/client.js";
import { ordersCore, ordersParcel } from "../db/schema.js";
import { resolveGeoLocation } from "../modules/billing/geoLocationResolver.js";
import { pickMostSpecificGeoAnchor } from "../modules/ride-state-config/rideStateConfig.repository.js";
import { loadEffectiveServicePayoutRule } from "../modules/rider-payout-pricing/riderPayoutPricing.repository.js";
import { computeWaitingCharge } from "../modules/rides/pricing/rideWaitingCharge.js";
import { resolveOrderLegVehicleType } from "./resolve-rider-legs-for-order.js";
import { computeRidePickupWaitSeconds } from "./ride-pickup-wait.js";

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * After the rider marks a parcel picked up: compute the waiting charge (funding-split and
 * vehicle aware, resolved from service_payout_rules at the order's drop geo — same anchor
 * used for the rider's base payout, see resolveOrderRiderPayoutBreakdown), record it in
 * billing_snapshot for accounting, and — unless the order is already paid — add the
 * customer-funded share to grand_total. Parcel is normally paid after completion (unlike
 * food's usual upfront capture), so this is the common path that actually updates the bill.
 * The rider's earning side is handled separately at settlement in
 * credit-rider-order-on-delivered.ts, which reads this same pickup_wait_seconds column.
 */
export async function applyParcelPickupWaitingToBilling(
  orderCorePk: number
): Promise<{ customerWaiting: number } | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: ordersCore.id,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      billingSnapshot: ordersCore.billingSnapshot,
      grandTotal: ordersCore.grandTotal,
      paymentStatus: ordersCore.paymentStatus,
      vehicleCategory: ordersParcel.vehicleCategory,
      riderReachedPickupAt: ordersParcel.riderReachedPickupAt,
      pickupWaitSeconds: ordersParcel.pickupWaitSeconds,
    })
    .from(ordersCore)
    .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
    .where(eq(ordersCore.id, orderCorePk))
    .limit(1);

  if (!row?.id) return null;

  const prevSnap =
    row.billingSnapshot != null && typeof row.billingSnapshot === "object"
      ? (row.billingSnapshot as Record<string, unknown>)
      : {};
  // Pickup confirmation is guarded to run once per order at the call site; cheap extra guard.
  if (prevSnap.waiting_charge != null) {
    return { customerWaiting: Number(prevSnap.waiting_customer_share) || 0 };
  }

  const waitSeconds =
    row.pickupWaitSeconds != null
      ? Math.max(0, Number(row.pickupWaitSeconds) || 0)
      : row.riderReachedPickupAt
        ? computeRidePickupWaitSeconds(row.riderReachedPickupAt, new Date())
        : 0;

  if (waitSeconds <= 0) return { customerWaiting: 0 };

  const vehicleType = resolveOrderLegVehicleType({
    service: "parcel",
    parcelVehicleCategory: row.vehicleCategory,
  });

  let freeMinutes = 2;
  let chargePerMin = 0;
  let waitingMax: number | null = null;
  let fundingMode: "CUSTOMER_100" | "COMPANY_100" | "SHARED" = "CUSTOMER_100";
  let customerSharePct = 100;
  let companySharePct = 0;

  try {
    // Parcel's payout geo anchor is the DROP location, matching
    // resolveOrderRiderPayoutBreakdown's non-ride branch.
    const geo = await resolveGeoLocation({
      latitude: Number(row.dropLat),
      longitude: Number(row.dropLon),
    });
    const anchor = pickMostSpecificGeoAnchor(geo.refs);
    if (anchor) {
      const { rule } = await loadEffectiveServicePayoutRule({
        level: anchor.level,
        refId: anchor.refId,
        service: "parcel",
        vehicleType,
      });
      if (rule) {
        freeMinutes = Math.max(0, Math.round(rule.waitingFreeMinutes ?? 2));
        chargePerMin = Math.max(0, Number(rule.waitingChargePerMin ?? 0));
        waitingMax = rule.waitingMaxCharge;
        fundingMode = rule.waitingFundingMode ?? "CUSTOMER_100";
        customerSharePct = rule.waitingCustomerSharePct ?? 100;
        companySharePct = rule.waitingCompanySharePct ?? 0;
      }
    }
  } catch {
    /* keep defaults */
  }

  if (chargePerMin <= 0) return { customerWaiting: 0 };

  const split = computeWaitingCharge(waitSeconds, {
    freeMinutes,
    chargePerMin,
    maxCharge: waitingMax,
    fundingMode,
    customerSharePct,
    companySharePct,
  });

  const customerWaiting = split.customerShare;

  const sql = getSql();
  await sql`
    UPDATE orders_core
    SET billing_snapshot = COALESCE(billing_snapshot, '{}'::jsonb) || ${JSON.stringify({
      waiting_charge: customerWaiting,
      waiting_charge_gross: split.capped,
      waiting_customer_share: split.customerShare,
      waiting_company_share: split.companyShare,
      waiting_funding_mode: split.fundingMode,
      company_funded_waiting: split.companyShare,
      pickup_wait_seconds: waitSeconds,
    })}::text::jsonb,
        updated_at = NOW()
    WHERE id = ${orderCorePk}
  `;

  if (customerWaiting > 0 && row.paymentStatus !== "completed") {
    const currentGrand = Number(row.grandTotal) || 0;
    await sql`
      UPDATE orders_core
      SET grand_total = ${String(round2(currentGrand + customerWaiting))},
          updated_at = NOW()
      WHERE id = ${orderCorePk}
    `;
  }

  return { customerWaiting };
}
