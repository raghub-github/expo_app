import { resolveRidePricingGeoFromPickup } from "../modules/ride-state-config/rideStateConfig.repository.js";
import { loadEffectiveServicePayoutRule } from "../modules/rider-payout-pricing/riderPayoutPricing.repository.js";
import { calculateWaitingCharge } from "../modules/rider-payout-pricing/riderPayoutPricing.service.js";
import {
  WAITING_DEFAULT_MAX_MINUTES,
  WAITING_DEFAULT_MAX_CHARGE,
} from "@gatimitra/slab-pricing";
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

/**
 * Combined pickup-waiting config from ONE rule load (free minutes + per-min charge + caps).
 * Used to attach live-waiting fields to the rider order summary so the app can render a live
 * ₹ estimate as the wait accrues (mirrors the customer live-status estimate). Falls back to
 * the same safe defaults the individual resolvers use when no rule/geo is available.
 */
export async function resolveRidePickupWaitingConfig(args: {
  checkoutMetadata?: unknown;
  pickupLat?: number | null;
  pickupLng?: number | null;
  rideType?: string | null;
}): Promise<{
  freeMinutes: number;
  chargePerMin: number;
  maxCharge: number | null;
  maxMinutes: number | null;
}> {
  const fromMetaFree = ridePickupWaitFreeMinutesFromCheckoutMetadata(args.checkoutMetadata);
  const meta =
    args.checkoutMetadata && typeof args.checkoutMetadata === "object"
      ? (args.checkoutMetadata as Record<string, unknown>)
      : null;
  const fromMetaPerMin = Number(meta?.pickupWaitingChargePerMin ?? meta?.waitingChargePerMin);

  const pickupLat = Number(args.pickupLat);
  const pickupLng = Number(args.pickupLng);
  const hasCoords = Number.isFinite(pickupLat) && Number.isFinite(pickupLng);

  let ruleFreeMinutes: number | null = null;
  let rulePerMin = 0;
  let ruleMaxCharge: number | null = null;
  let ruleMaxMinutes: number | null = null;

  if (hasCoords) {
    try {
      const geoHints = rideGeoFromCheckoutMetadata(args.checkoutMetadata);
      const rideGeo = await resolveRidePricingGeoFromPickup({
        pickupLat,
        pickupLng,
        pickupPincode: geoHints.pickupPincode,
        pickupState: geoHints.pickupState,
      });
      if (rideGeo.pricingGeo) {
        const { rule } = await loadEffectiveServicePayoutRule({
          level: rideGeo.pricingGeo.level,
          refId: rideGeo.pricingGeo.refId,
          service: "ride",
        });
        if (rule) {
          ruleFreeMinutes = Math.max(0, Math.round(rule.waitingFreeMinutes ?? DEFAULT_RIDE_PICKUP_FREE_WAIT_MINUTES));
          rulePerMin = Math.max(0, Number(rule.waitingChargePerMin ?? 0));
          const mc = Number(rule.waitingMaxCharge);
          ruleMaxCharge = Number.isFinite(mc) && mc > 0 ? mc : null;
          const mm = Number(rule.waitingMaxMinutes);
          ruleMaxMinutes = Number.isFinite(mm) && mm > 0 ? mm : null;
        }
      }
    } catch {
      // fall through to defaults / metadata
    }
  }

  const freeMinutes =
    fromMetaFree != null ? fromMetaFree : ruleFreeMinutes ?? DEFAULT_RIDE_PICKUP_FREE_WAIT_MINUTES;
  const chargePerMin =
    Number.isFinite(fromMetaPerMin) && fromMetaPerMin > 0 ? fromMetaPerMin : rulePerMin;

  return {
    freeMinutes: Math.max(0, freeMinutes),
    chargePerMin: Math.max(0, chargePerMin),
    maxCharge: ruleMaxCharge,
    maxMinutes: ruleMaxMinutes,
  };
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

/** Customer pickup waiting charge (₹) from finalized wait seconds — duration + amount capped. */
export function computeCustomerPickupWaitingCharge(args: {
  pickupWaitSeconds: number;
  freeMinutes: number;
  chargePerMin: number;
  maxCharge?: number | null;
  maxMinutes?: number | null;
  fundingMode?: "CUSTOMER_100" | "COMPANY_100" | "SHARED" | null;
  customerSharePct?: number | null;
  companySharePct?: number | null;
}): number {
  // Lazy import avoided — keep sync path; funding shares applied at bill merge.
  const freeBudgetSec = Math.max(0, Math.round(args.freeMinutes * 60));
  const billableSec = Math.max(0, Math.round(args.pickupWaitSeconds) - freeBudgetSec);
  if (billableSec <= 0 || args.chargePerMin <= 0) return 0;
  // Duration cap: rule value when set, else the absolute safety ceiling (never "no cap").
  const minutesCap =
    args.maxMinutes != null && Number(args.maxMinutes) > 0
      ? Number(args.maxMinutes)
      : WAITING_DEFAULT_MAX_MINUTES;
  const chargeableMinutes = Math.min(Math.ceil(billableSec / 60), minutesCap);
  let gross = Math.round(chargeableMinutes * args.chargePerMin * 10) / 10;
  // Amount cap: rule value when set, else the absolute safety ceiling (never "no cap").
  const amountCap =
    args.maxCharge != null && Number.isFinite(Number(args.maxCharge)) && Number(args.maxCharge) > 0
      ? Number(args.maxCharge)
      : WAITING_DEFAULT_MAX_CHARGE;
  return Math.min(gross, amountCap);
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
      // A-3 fix: bound the rider pickup-wait earning by the same rule caps.
      maxMinutes: rule.waitingMaxMinutes,
      maxCharge: rule.waitingMaxCharge,
    })
  );
}

export type RidePickupWaitAttachInput = {
  riderReachedPickupAt?: Date | string | null;
  pickupWaitSeconds?: number | null;
  pickupOtpVerifiedAt?: Date | string | null;
  pickupWaitFreeMinutes: number;
  /** ₹/min charged after the free window — lets the app render a live ₹ estimate as it accrues. */
  pickupWaitingChargePerMin?: number | null;
  /** Amount cap (₹) on the waiting charge, when the rule sets one. */
  pickupWaitingMaxCharge?: number | null;
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
  ridePickupWaitingChargePerMin?: number;
  ridePickupWaitingMaxCharge?: number | null;
} {
  const startedAt = toIsoOrNull(input.riderReachedPickupAt);
  const verifiedAt = toIsoOrNull(input.pickupOtpVerifiedAt);
  const freeMinutes = Math.max(0, input.pickupWaitFreeMinutes);
  const freeBudgetSeconds = Math.max(0, Math.round(freeMinutes * 60));
  const perMin = Math.max(0, Number(input.pickupWaitingChargePerMin) || 0);
  const maxCharge =
    input.pickupWaitingMaxCharge != null && Number(input.pickupWaitingMaxCharge) > 0
      ? Number(input.pickupWaitingMaxCharge)
      : null;
  const rateFields =
    perMin > 0
      ? { ridePickupWaitingChargePerMin: perMin, ridePickupWaitingMaxCharge: maxCharge }
      : {};

  if (!startedAt || verifiedAt) {
    if (startedAt && verifiedAt && input.pickupWaitSeconds != null) {
      return {
        ...summary,
        pickupWaitStartedAt: startedAt,
        pickupWaitSeconds: Math.max(0, Number(input.pickupWaitSeconds) || 0),
        pickupWaitFinalized: true,
        pickupTimerBudgetSeconds: freeBudgetSeconds,
        ridePickupWaitFreeMinutes: freeMinutes,
        ...rateFields,
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
    ...rateFields,
  };
}
