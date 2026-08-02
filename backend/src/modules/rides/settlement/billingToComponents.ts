import type { BillingResult } from "../../billing/types.js";
import type { RideBillComponents } from "./rideSettlement.math.js";
import {
  extractRideChargeComponents,
  extractRideDiscountAmount,
  RIDE_FARE_DISCOUNT_SUBTYPES,
} from "../pricing/rideFareComponents.js";

function round2(n: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Map the existing billing pipeline's BillingResult into the settlement
 * engine's RideBillComponents. This is the SINGLE place that translates
 * between the two shapes — every consumer of settlement math must go through
 * here so that whenever the billing pipeline grows a new component (Phase 2
 * night / peak / festival / airport / toll etc.), we only patch this mapper.
 *
 * `snapshot` is the ride billing_snapshot JSON on orders_core / ride payment
 * snapshots — it may carry ride-specific fields (waiting_charge, toll_charge,
 * company_funded_discount split) that are not part of BillingResult.
 */
export function rideBillingToSettlementComponents(
  billing: BillingResult,
  snapshot?: Record<string, unknown> | null
): RideBillComponents {
  const snap = snapshot ?? {};

  // Phase 2: the pipeline emits ride fare components as billing_pricing_rules
  // rows with a canonical `charge_subtype`. Prefer those pipeline lines over
  // legacy per-field snapshot values so that a rule toggled off in admin is
  // immediately reflected in settlement math. Snapshot fields remain a
  // fallback for historic orders written before Phase 2 seeding.
  const pipelineComponents = extractRideChargeComponents(billing.charges);
  const pickComponent = (fromPipeline: number, ...snapFields: string[]): number => {
    if (fromPipeline > 0) return round2(fromPipeline);
    for (const field of snapFields) {
      const v = num((snap as Record<string, unknown>)[field]);
      if (v > 0) return round2(v);
    }
    return 0;
  };

  const waiting = pickComponent(
    pipelineComponents.waitingCharge,
    "waiting_charge",
    "waiting_charges",
    "pickup_waiting_charge"
  );
  const toll = pickComponent(
    pipelineComponents.tollCharge,
    "toll_charge",
    "toll_charges"
  );
  const nightCharge = pickComponent(pipelineComponents.nightCharge, "night_charge");
  const peak = pickComponent(pipelineComponents.peakHourCharge, "peak_hour_charge");
  const festival = pickComponent(pipelineComponents.festivalCharge, "festival_charge");
  const airport = pickComponent(pipelineComponents.airportCharge, "airport_charge");
  const extraStops = pickComponent(
    pipelineComponents.extraStopsCharge,
    "extra_stops_charge"
  );

  // Bike Lite is a company-funded discount (we set the fare lower for the
  // customer without asking the rider to eat the difference). Anything that
  // isn't Bike-Lite and isn't a snapshot-tagged company-funded promo is
  // treated as a coupon discount from the customer's perspective.
  const bikeLiteDiscount = extractRideDiscountAmount(
    billing.discounts,
    RIDE_FARE_DISCOUNT_SUBTYPES.BIKE_LITE
  );
  const snapshotCompanyFundedDiscount = round2(
    num((snap as { company_funded_discount?: unknown }).company_funded_discount)
  );
  const companyFundedDiscount = round2(
    Math.max(snapshotCompanyFundedDiscount, bikeLiteDiscount)
  );
  const couponDiscount = round2(
    Math.max(0, num(billing.discount_total) - companyFundedDiscount)
  );

  // Base + distance fare split: the ride quote engine already computed these
  // and stashes them on the snapshot; if absent, fall back to item_total as a
  // single distance component so the settlement row is still auditable.
  const baseFare = round2(
    num((snap as { base_fare?: unknown }).base_fare) ||
      num((snap as { baseFare?: unknown }).baseFare)
  );
  const distanceFare = round2(
    num((snap as { distance_fare?: unknown }).distance_fare) ||
      num((snap as { distanceFare?: unknown }).distanceFare) ||
      Math.max(0, round2(billing.item_total) - baseFare)
  );

  // Surge funding — Phase 3 populates the split. Until then treat everything
  // as customer-funded so today's economics are unchanged.
  const surgeTotal = round2(billing.surge_fee);
  const surgeCustomerShare = round2(
    num((snap as { surge_customer_share?: unknown }).surge_customer_share) || surgeTotal
  );
  const surgeCompanyShare = Math.max(
    0,
    round2(surgeTotal - surgeCustomerShare)
  );

  const pickupIncentive = round2(
    num((snap as { pickup_incentive?: unknown }).pickup_incentive) ||
      num((snap as { pickupIncentive?: unknown }).pickupIncentive)
  );
  const pickupIncentiveCustomerShare = round2(
    num((snap as { pickup_incentive_customer_share?: unknown }).pickup_incentive_customer_share)
  );
  const pickupIncentiveCompanyShare = round2(
    num((snap as { pickup_incentive_company_share?: unknown }).pickup_incentive_company_share)
  );

  return {
    baseFare,
    distanceFare,
    waitingCharge: waiting,
    tollCharge: toll,
    nightCharge,
    peakHourCharge: peak,
    festivalCharge: festival,
    airportCharge: airport,
    extraStopsCharge: extraStops,
    pickupIncentive,
    ...(pickupIncentive > 0
      ? {
          pickupIncentiveCustomerShare:
            pickupIncentiveCustomerShare > 0 || pickupIncentiveCompanyShare > 0
              ? pickupIncentiveCustomerShare
              : undefined,
          pickupIncentiveCompanyShare:
            pickupIncentiveCustomerShare > 0 || pickupIncentiveCompanyShare > 0
              ? pickupIncentiveCompanyShare
              : undefined,
        }
      : {}),
    platformFee: round2(billing.platform_fee),
    convenienceFee: round2(billing.convenience_fee),
    serviceCharge: 0,
    gatewayFee: 0,
    smallOrderFee: round2(billing.small_order_fee),
    surgeTotal,
    surgeCustomerShare,
    surgeCompanyShare,
    taxTotal: round2(billing.tax_total),
    couponDiscount,
    companyFundedDiscount,
    tipAmount: round2(billing.tip_amount),
  };
}
