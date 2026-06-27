import { calcWaitingCharge } from "@gatimitra/slab-pricing";
import { calculateProgressiveSlabAmount } from "../delivery-slab-pricing/deliverySlabPricing.service.js";
import type { DeliveryServiceType } from "../delivery-slab-pricing/types.js";
import type { RideVehiclePricingType } from "../rider-payout-pricing/types.js";
import {
  computeDeliveryFallbackFee,
  getDeliveryFallbackRates,
} from "../delivery/deliveryFallback.config.js";
import {
  fallbackSlabsToDeliveryRows,
  loadFallbackCustomerSlabs,
} from "./fallbackSlabPricing.repository.js";
import type { FallbackCustomerQuote } from "./types.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

let slabCache: {
  at: number;
  key: string;
  slabs: Awaited<ReturnType<typeof loadFallbackCustomerSlabs>>;
} | null = null;
const SLAB_CACHE_MS = 30_000;

async function getCachedFallbackSlabs(args: {
  service: DeliveryServiceType;
  vehicleType?: RideVehiclePricingType | null;
}) {
  const key = `${args.service}:${args.vehicleType ?? "none"}`;
  if (slabCache && slabCache.key === key && Date.now() - slabCache.at < SLAB_CACHE_MS) {
    return slabCache.slabs;
  }
  const slabs = await loadFallbackCustomerSlabs(args);
  slabCache = { at: Date.now(), key, slabs };
  return slabs;
}

export function invalidateFallbackSlabCache(): void {
  slabCache = null;
}

/** Customer fallback fee using shared slab engine, with legacy flat formula as last resort. */
export async function computeFallbackCustomerFee(args: {
  service: DeliveryServiceType;
  distanceKm: number;
  vehicleType?: RideVehiclePricingType | null;
  waitingMinutes?: number;
}): Promise<FallbackCustomerQuote> {
  const distanceKm = Math.max(0, args.distanceKm);
  const waitingMinutes = Math.max(0, args.waitingMinutes ?? 0);

  if (args.service === "person_ride" && !args.vehicleType) {
    const rates = await getDeliveryFallbackRates();
    const fee = computeDeliveryFallbackFee(distanceKm, rates);
    return {
      fee,
      engine: "fallback_per_km",
      baseFare: rates.baseInr,
      distanceFare: round2(fee - rates.baseInr),
      waitingAmount: 0,
      slabQuote: null,
    };
  }

  const fallbackSlabs = await getCachedFallbackSlabs({
    service: args.service,
    vehicleType: args.vehicleType,
  });

  if (fallbackSlabs.length > 0) {
    const deliveryRows = fallbackSlabsToDeliveryRows(fallbackSlabs, args.service);
    const calc = calculateProgressiveSlabAmount({
      distanceKm,
      slabs: deliveryRows,
      applyRiderExtras: false,
    });

    if (calc.ok) {
      const sorted = [...fallbackSlabs].sort((a, b) => a.minKm - b.minKm);
      const first = sorted[0];
      const waitingAmount =
        args.service === "person_ride" && first?.waitingChargePerMin
          ? calcWaitingCharge(
              waitingMinutes,
              first.waitingStartAfter ?? 0,
              first.waitingChargePerMin
            )
          : 0;
      const subtotal = round2(calc.quote.finalAmount + waitingAmount);

      return {
        fee: subtotal,
        engine: "fallback_slab",
        baseFare: calc.quote.baseFareApplied,
        distanceFare: round2(calc.quote.finalAmount - calc.quote.baseFareApplied),
        waitingAmount: round2(waitingAmount),
        slabQuote: {
          distanceKm: calc.quote.distanceKm,
          baseFareApplied: calc.quote.baseFareApplied,
          finalAmount: subtotal,
          segments: calc.quote.segments.map((s) => ({
            slabId: s.slabId,
            minKm: s.minKm,
            maxKm: s.maxKm,
            segmentKm: s.segmentKm,
            perKmRate: s.perKmRate,
            segmentAmount: s.segmentAmount,
          })),
        },
      };
    }
  }

  const rates = await getDeliveryFallbackRates();
  const fee = computeDeliveryFallbackFee(distanceKm, rates);
  return {
    fee,
    engine: "fallback_per_km",
    baseFare: rates.baseInr,
    distanceFare: round2(Math.max(0, fee - rates.baseInr)),
    waitingAmount: 0,
    slabQuote: null,
  };
}
