/**
 * GMitra Plus / customer subscription partial free-delivery pricing.
 *
 * Within the configured membership radius the full delivery fee is waived.
 * Beyond the radius the customer pays: base fare + charge for distance beyond
 * the covered radius (using the same progressive slab / fallback engine as the
 * canonical store quote — never a separate hardcoded fare table).
 */

import {
  computeDeliveryFallbackFee,
  type DeliveryFallbackRates,
} from "../delivery/deliveryFallback.config.js";
import { calculateProgressiveSlabAmount } from "../delivery-slab-pricing/deliverySlabPricing.service.js";
import type { DeliveryRateSlabRow } from "../delivery-slab-pricing/types.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type SubscriptionDeliveryPricingContext = {
  pricingEngine?: string | null;
  progressiveSlabs?: DeliveryRateSlabRow[] | null;
  fallbackRates?: DeliveryFallbackRates | null;
};

export type SubscriptionDeliveryBenefit = {
  /** Payable delivery after membership (0 when fully covered). */
  membershipDeliveryFeeInr: number;
  /** Amount waived from the pre-benefit delivery fee. */
  waivedInr: number;
  coveredRadiusKm: number;
  coveredDistanceKm: number;
  excessDistanceKm: number;
  isPartial: boolean;
  isFullWaiver: boolean;
};

export function isSubscriptionDeliveryBenefitEligible(args: {
  freeDeliveryEnabled: boolean;
  distanceKm: number | null;
  isSelfPickup?: boolean;
}): boolean {
  if (args.isSelfPickup) return false;
  if (!args.freeDeliveryEnabled) return false;
  return args.distanceKm != null && Number.isFinite(args.distanceKm) && args.distanceKm > 0;
}

export function computeSubscriptionDeliveryBenefit(args: {
  distanceKm: number;
  coveredRadiusKm: number;
  fullDeliveryFeeInr: number;
  pricing?: SubscriptionDeliveryPricingContext | null;
}): SubscriptionDeliveryBenefit | null {
  const { distanceKm, coveredRadiusKm, fullDeliveryFeeInr } = args;
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return null;
  if (!Number.isFinite(coveredRadiusKm) || coveredRadiusKm <= 0) return null;
  if (!Number.isFinite(fullDeliveryFeeInr) || fullDeliveryFeeInr <= 0.005) return null;

  const coveredDistanceKm = Math.min(distanceKm, coveredRadiusKm);
  const excessDistanceKm = Math.max(0, round2(distanceKm - coveredRadiusKm));

  if (excessDistanceKm <= 0.0001) {
    return {
      membershipDeliveryFeeInr: 0,
      waivedInr: round2(fullDeliveryFeeInr),
      coveredRadiusKm,
      coveredDistanceKm,
      excessDistanceKm: 0,
      isPartial: false,
      isFullWaiver: true,
    };
  }

  const engine = String(args.pricing?.pricingEngine ?? "");
  const slabs = args.pricing?.progressiveSlabs ?? null;
  const fallbackRates = args.pricing?.fallbackRates ?? null;

  let baseFare = 0;
  let coveredFee = 0;

  if (
    (engine === "slab_geo" || engine === "fallback_slab") &&
    slabs &&
    slabs.length > 0
  ) {
    const coveredCalc = calculateProgressiveSlabAmount({
      distanceKm: coveredDistanceKm,
      slabs,
    });
    if (coveredCalc.ok) {
      baseFare = coveredCalc.quote.baseFareApplied;
      coveredFee = coveredCalc.quote.finalAmount;
    } else if (fallbackRates) {
      baseFare = fallbackRates.baseInr;
      coveredFee = computeDeliveryFallbackFee(coveredDistanceKm, fallbackRates);
    } else {
      return null;
    }
  } else if (fallbackRates) {
    baseFare = fallbackRates.baseInr;
    coveredFee = computeDeliveryFallbackFee(coveredDistanceKm, fallbackRates);
  } else {
    return null;
  }

  const membershipDeliveryFeeInr = round2(
    Math.max(0, Math.min(fullDeliveryFeeInr, baseFare + (fullDeliveryFeeInr - coveredFee)))
  );
  const waivedInr = round2(Math.max(0, fullDeliveryFeeInr - membershipDeliveryFeeInr));

  if (waivedInr <= 0.005) return null;

  return {
    membershipDeliveryFeeInr,
    waivedInr,
    coveredRadiusKm,
    coveredDistanceKm,
    excessDistanceKm,
    isPartial: membershipDeliveryFeeInr > 0.005,
    isFullWaiver: membershipDeliveryFeeInr <= 0.005,
  };
}
