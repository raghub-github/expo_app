import { resolveRidePricingGeoFromPickup } from "../modules/ride-state-config/rideStateConfig.repository.js";
import { loadEffectiveServicePayoutRule } from "../modules/rider-payout-pricing/riderPayoutPricing.repository.js";
import { calculateWaitingCharge } from "../modules/rider-payout-pricing/riderPayoutPricing.service.js";
import { rideGeoFromCheckoutMetadata } from "./ride-address-display.js";

export const DEFAULT_RIDE_PICKUP_FREE_WAIT_MINUTES = 2;

export function ridePickupWaitFreeMinutesFromCheckoutMetadata(metadata: unknown): number | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const raw = (metadata as Record<string, unknown>).pickupWaitFreeMinutes;
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes < 0) return undefined;
  return Math.round(minutes);
}

export async function resolveRidePickupFreeWaitMinutes(args: {
  checkoutMetadata?: unknown;
  pickupLat?: number | null;
  pickupLng?: number | null;
  rideType?: string | null;
}): Promise<number> {
  const fromMeta = ridePickupWaitFreeMinutesFromCheckoutMetadata(args.checkoutMetadata);
  if (fromMeta != null) return fromMeta;

  const pickupLat = Number(args.pickupLat);
  const pickupLng = Number(args.pickupLng);
  if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) {
    return DEFAULT_RIDE_PICKUP_FREE_WAIT_MINUTES;
  }

  const geoHints = rideGeoFromCheckoutMetadata(args.checkoutMetadata);
  const rideGeo = await resolveRidePricingGeoFromPickup({
    pickupLat,
    pickupLng,
    pickupPincode: geoHints.pickupPincode,
    pickupState: geoHints.pickupState,
  });
  if (!rideGeo.pricingGeo) return DEFAULT_RIDE_PICKUP_FREE_WAIT_MINUTES;

  const { rule } = await loadEffectiveServicePayoutRule({
    level: rideGeo.pricingGeo.level,
    refId: rideGeo.pricingGeo.refId,
    service: "ride",
  });
  if (!rule) return DEFAULT_RIDE_PICKUP_FREE_WAIT_MINUTES;
  return Math.max(0, Math.round(rule.waitingFreeMinutes ?? DEFAULT_RIDE_PICKUP_FREE_WAIT_MINUTES));
}

export async function resolveRidePickupWaitingChargePerMin(args: {
  checkoutMetadata?: unknown;
  pickupLat?: number | null;
  pickupLng?: number | null;
  rideType?: string | null;
}): Promise<number> {
  const meta =
    args.checkoutMetadata && typeof args.checkoutMetadata === "object"
      ? (args.checkoutMetadata as Record<string, unknown>)
      : null;
  const fromMeta = Number(meta?.pickupWaitingChargePerMin ?? meta?.waitingChargePerMin);
  if (Number.isFinite(fromMeta) && fromMeta > 0) return fromMeta;

  const pickupLat = Number(args.pickupLat);
  const pickupLng = Number(args.pickupLng);
  if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) return 0;

  const geoHints = rideGeoFromCheckoutMetadata(args.checkoutMetadata);
  const rideGeo = await resolveRidePricingGeoFromPickup({
    pickupLat,
    pickupLng,
    pickupPincode: geoHints.pickupPincode,
    pickupState: geoHints.pickupState,
  });
  if (!rideGeo.pricingGeo) return 0;

  const { rule } = await loadEffectiveServicePayoutRule({
    level: rideGeo.pricingGeo.level,
    refId: rideGeo.pricingGeo.refId,
    service: "ride",
  });
  const perMin = Number(rule?.waitingChargePerMin ?? 0);
  return Number.isFinite(perMin) && perMin > 0 ? perMin : 0;
}

export function computeRidePickupWaitSeconds(
  reachedAt: Date | string,
  endedAt: Date | string
): number {
  const startMs = new Date(reachedAt).getTime();
  const endMs = new Date(endedAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return Math.max(0, Math.floor((endMs - startMs) / 1000));
}

/** Customer pickup waiting charge (₹) from finalized wait seconds. */
export function computeCustomerPickupWaitingCharge(args: {
  pickupWaitSeconds: number;
  freeMinutes: number;
  chargePerMin: number;
  maxCharge?: number | null;
  fundingMode?: "CUSTOMER_100" | "COMPANY_100" | "SHARED" | null;
  customerSharePct?: number | null;
  companySharePct?: number | null;
}): number {
  // Lazy import avoided — keep sync path; funding shares applied at bill merge.
  const freeBudgetSec = Math.max(0, Math.round(args.freeMinutes * 60));
  const billableSec = Math.max(0, Math.round(args.pickupWaitSeconds) - freeBudgetSec);
  if (billableSec <= 0 || args.chargePerMin <= 0) return 0;
  let gross = Math.round(Math.ceil(billableSec / 60) * args.chargePerMin * 10) / 10;
  const max = args.maxCharge != null ? Number(args.maxCharge) : null;
  if (max != null && Number.isFinite(max) && max > 0) {
    gross = Math.min(gross, max);
  }
  return gross;
}

/** Rider pickup waiting earning from payout slabs (ignores surge-wait-max gating). */
export async function computeRiderPickupWaitingEarning(args: {
  checkoutMetadata?: unknown;
  pickupLat: number;
  pickupLng: number;
  rideType?: string | null;
  pickupWaitSeconds: number;
}): Promise<number> {
  const waitSeconds = Math.max(0, Math.round(args.pickupWaitSeconds));
  if (waitSeconds <= 0) return 0;

  const pickupLat = Number(args.pickupLat);
  const pickupLng = Number(args.pickupLng);
  if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) return 0;

  const geoHints = rideGeoFromCheckoutMetadata(args.checkoutMetadata);
  const rideGeo = await resolveRidePricingGeoFromPickup({
    pickupLat,
    pickupLng,
    pickupPincode: geoHints.pickupPincode,
    pickupState: geoHints.pickupState,
  });
  if (!rideGeo.pricingGeo) return 0;

  const { rule } = await loadEffectiveServicePayoutRule({
    level: rideGeo.pricingGeo.level,
    refId: rideGeo.pricingGeo.refId,
    service: "ride",
  });
  if (!rule) return 0;
  const startAfterMinutes = Math.max(0, Math.round(rule.waitingFreeMinutes ?? 0));
  const chargePerMin = Math.max(0, Number(rule.waitingChargePerMin ?? 0));
  if (chargePerMin <= 0) return 0;

  const waitMinutes = Math.ceil(waitSeconds / 60);
  return Math.round(
    calculateWaitingCharge({
      waitingMinutes: waitMinutes,
      chargePerMin,
      startAfterMinutes,
    })
  );
}

export type RidePickupWaitAttachInput = {
  riderReachedPickupAt?: Date | string | null;
  pickupWaitSeconds?: number | null;
  pickupOtpVerifiedAt?: Date | string | null;
  pickupWaitFreeMinutes: number;
};

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const t = new Date(String(value)).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Attach live ride pickup-wait timer fields for rider + customer APIs. */
export function attachRidePickupWaitFields<T extends Record<string, unknown>>(
  summary: T,
  input: RidePickupWaitAttachInput
): T & {
  pickupWaitStartedAt?: string;
  pickupWaitSeconds?: number | null;
  pickupWaitFinalized?: boolean;
  pickupTimerBudgetSeconds?: number;
  ridePickupWaitFreeMinutes?: number;
} {
  const startedAt = toIsoOrNull(input.riderReachedPickupAt);
  const verifiedAt = toIsoOrNull(input.pickupOtpVerifiedAt);
  const freeMinutes = Math.max(0, input.pickupWaitFreeMinutes);
  const freeBudgetSeconds = Math.max(0, Math.round(freeMinutes * 60));

  if (!startedAt || verifiedAt) {
    if (startedAt && verifiedAt && input.pickupWaitSeconds != null) {
      return {
        ...summary,
        pickupWaitStartedAt: startedAt,
        pickupWaitSeconds: Math.max(0, Number(input.pickupWaitSeconds) || 0),
        pickupWaitFinalized: true,
        pickupTimerBudgetSeconds: freeBudgetSeconds,
        ridePickupWaitFreeMinutes: freeMinutes,
      };
    }
    return summary;
  }

  return {
    ...summary,
    pickupWaitStartedAt: startedAt,
    pickupWaitSeconds: null,
    pickupWaitFinalized: false,
    pickupTimerBudgetSeconds: freeBudgetSeconds,
    ridePickupWaitFreeMinutes: freeMinutes,
  };
}
