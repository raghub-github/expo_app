/**
 * Ride/Parcel platform offer eligibility + discount math.
 * Food offers (empty promo_config) are unaffected.
 */

import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { ordersCore, ordersParcel } from "../../db/schema.js";
import type { BillContext, PlatformOfferRow } from "./types.js";
import {
  parseRideParcelPromoConfig,
  type RideParcelPromoConfig,
} from "./rideParcelPromo.js";
import { platformOfferRequiresFirstRideOnly } from "./platformOfferFirstRide.js";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export function getOfferPromoConfig(o: PlatformOfferRow): RideParcelPromoConfig | null {
  // Prefer dedicated column; fall back to conditions.ride_parcel for older rows.
  const fromCol = parseRideParcelPromoConfig(o.promoConfig ?? null);
  if (fromCol) return fromCol;
  const cond = (o.conditions ?? {}) as Record<string, unknown>;
  return parseRideParcelPromoConfig(cond.ride_parcel ?? cond.promo_config ?? null);
}

function isRideOrParcelService(ctx: BillContext): boolean {
  const st = String(ctx.serviceType ?? "").toUpperCase();
  return st === "RIDE" || st === "PARCEL";
}

function peakSlotNow(now: Date): string[] {
  const day = now.getDay(); // 0 Sun
  const hour = now.getHours();
  const slots: string[] = [];
  if (day === 0 || day === 6) slots.push("weekend");
  if (hour >= 7 && hour < 11) slots.push("morning_peak");
  if (hour >= 17 && hour < 21) slots.push("evening_peak");
  if (hour >= 22 || hour < 5) slots.push("night");
  return slots;
}

/**
 * Extra eligibility for Ride/Parcel promo_config (and legacy first_ride_only).
 * Returns null if pass, or a short reason code if fail.
 */
export function rideParcelPromoEligibilityReason(
  ctx: BillContext,
  o: PlatformOfferRow
): string | null {
  const st = String(ctx.serviceType ?? "").toUpperCase();
  const cfg = getOfferPromoConfig(o);
  const legacyFirst = platformOfferRequiresFirstRideOnly(o);

  if (!cfg && !legacyFirst) return null;
  if (!isRideOrParcelService(ctx)) {
    // Ride/Parcel-only promos must not apply on Food.
    if (cfg || legacyFirst) return "ride_parcel_promo=wrong_service";
    return null;
  }

  // First-N completed (rides or parcels) — independent of per-user usage limits.
  let firstN =
    cfg?.first_n_completed != null && cfg.first_n_completed > 0
      ? Math.min(10, Math.floor(cfg.first_n_completed))
      : null;
  if (legacyFirst && firstN == null) firstN = 1;
  if (
    cfg?.promo_type === "FREE_FIRST_N" ||
    cfg?.promo_type === "NEW_USER_N" ||
    cfg?.promo_type === "FREE_UP_TO_KM"
  ) {
    const freeN =
      cfg.max_free_count != null && cfg.max_free_count > 0
        ? Math.min(10, Math.floor(cfg.max_free_count))
        : firstN;
    if (freeN != null) firstN = freeN;
    else if (firstN == null) firstN = 1;
  }

  if (firstN != null) {
    const count =
      st === "PARCEL" ? ctx.completedParcelCount : ctx.completedPersonRideCount;
    if (count == null) return "first_n=unknown_history";
    if (count >= firstN) return `first_n=has_${count}_need_lt_${firstN}`;
  }

  if (cfg?.loyalty_complete_count != null && cfg.loyalty_complete_count > 0) {
    const need = Math.floor(cfg.loyalty_complete_count);
    const count =
      st === "PARCEL" ? ctx.completedParcelCount : ctx.completedPersonRideCount;
    if (count == null) return "loyalty=unknown_history";
    if (count < need) return `loyalty=need_${need}_have_${count}`;
  }

  if (cfg?.vehicle_types && cfg.vehicle_types.length > 0) {
    const rideType = (ctx.rideType ?? ctx.vehicleType ?? "").trim().toLowerCase();
    if (!rideType) return "vehicle=unknown";
    const allowed = cfg.vehicle_types.map((v) => v.toLowerCase());
    if (!allowed.includes(rideType) && !allowed.includes((ctx.vehicleType ?? "").toLowerCase())) {
      return "vehicle=not_allowed";
    }
  }

  if (cfg?.payment_modes && cfg.payment_modes.length > 0) {
    const mode = (ctx.paymentMode ?? "").trim().toLowerCase();
    if (!mode) return "payment=unknown";
    const allowed = cfg.payment_modes.map((m) => m.toLowerCase());
    const cashless = ["upi", "wallet", "card", "online"];
    const ok =
      allowed.includes(mode) ||
      (allowed.includes("cashless") && cashless.includes(mode));
    if (!ok) return "payment=not_allowed";
  }

  if (cfg?.peak_slots && cfg.peak_slots.length > 0) {
    const nowSlots = peakSlotNow(ctx.now ?? new Date());
    const hit = cfg.peak_slots.some((s) => nowSlots.includes(s.toLowerCase()));
    if (!hit && !cfg.peak_slots.map((s) => s.toLowerCase()).includes("festival")) {
      // Festival is admin-scheduled via offer window; peak_slots without current match fails.
      const onlyFestival = cfg.peak_slots.every((s) => s.toLowerCase() === "festival");
      if (!onlyFestival) return "peak=outside_window";
    }
  }

  if (cfg?.max_km != null && cfg.max_km > 0 && (ctx.distanceKm ?? 0) > cfg.max_km + 1e-6) {
    // Distance-limited promos (flat fare / free up to km) still evaluated in discount math;
    // eligibility for FREE_UP_TO_KM / FLAT_FARE_UP_TO_KM fails when trip exceeds max_km.
    if (cfg.promo_type === "FLAT_FARE_UP_TO_KM" || cfg.promo_type === "FREE_UP_TO_KM") {
      return `distance=${ctx.distanceKm}>max_${cfg.max_km}`;
    }
  }

  if (st === "PARCEL" && cfg) {
    const w = ctx.parcelWeightKg;
    if (cfg.min_weight_kg != null && w != null && w < cfg.min_weight_kg) {
      return "weight=below_min";
    }
    if (cfg.max_weight_kg != null && w != null && w > cfg.max_weight_kg) {
      return "weight=above_max";
    }
    if (cfg.parcel_speed && cfg.parcel_speed !== "any") {
      const speed = (ctx.parcelSpeed ?? "").toLowerCase();
      if (speed && speed !== cfg.parcel_speed) return "parcel_speed=mismatch";
    }
    if (cfg.parcel_scope && cfg.parcel_scope !== "any") {
      const scope = (ctx.parcelScope ?? "").toLowerCase();
      if (scope && scope !== cfg.parcel_scope) return "parcel_scope=mismatch";
    }
  }

  if (cfg?.promo_type === "SUBSCRIPTION") {
    if (!ctx.subscriptionOptIn && !ctx.customerSubscriptionActive) {
      return "subscription=required";
    }
  }

  return null;
}

export function rideParcelPromoPasses(ctx: BillContext, o: PlatformOfferRow): boolean {
  return rideParcelPromoEligibilityReason(ctx, o) == null;
}

/**
 * Compute discount amount (₹) for Ride/Parcel special promo types.
 * Returns null when this offer should use the standard %/flat cart math instead.
 */
export function computeRideParcelPromoDiscount(
  ctx: BillContext,
  o: PlatformOfferRow,
  fareBase: number
): number | null {
  if (!isRideOrParcelService(ctx)) return null;
  const cfg = getOfferPromoConfig(o);
  if (!cfg) return null;

  const fare = Math.max(0, fareBase);
  const distanceKm = Math.max(0, ctx.distanceKm ?? 0);
  const maxCap = num(o.maxDiscountAmount);
  const clamp = (amt: number) => {
    let a = Math.max(0, amt);
    if (maxCap > 0) a = Math.min(a, maxCap);
    if (cfg.max_fare_covered != null && cfg.max_fare_covered > 0) {
      a = Math.min(a, cfg.max_fare_covered);
    }
    return Math.min(a, fare);
  };

  switch (cfg.promo_type) {
    case "FLAT_OFF":
    case "PERCENT_OFF":
    case "COUPON":
    case "PEAK_HOUR":
    case "ROUTE_ZONE":
    case "PAYMENT_MODE":
    case "NEW_USER_N":
    case "LOYALTY_MILESTONE":
    case "REFERRAL":
    case "SUBSCRIPTION":
    case "WEIGHT_BASED":
    case "EXPRESS":
    case "SAME_CITY":
    case "INTERCITY":
    case "BUSINESS":
    case "BULK":
      // Use standard discount_type / value_numeric.
      return null;

    case "FREE_FIRST_N":
    case "FREE_PICKUP":
    case "FREE_DROP": {
      return clamp(fare);
    }

    case "FREE_UP_TO_KM": {
      const maxKm = cfg.max_km != null && cfg.max_km > 0 ? cfg.max_km : distanceKm;
      if (distanceKm <= 0) return clamp(fare);
      const covered = Math.min(1, maxKm / distanceKm);
      return clamp(fare * covered);
    }

    case "FLAT_FARE_UP_TO_KM": {
      const maxKm = cfg.max_km ?? 0;
      const flat = cfg.flat_fare ?? 0;
      if (maxKm > 0 && distanceKm > maxKm + 1e-6) return 0;
      return clamp(Math.max(0, fare - flat));
    }

    case "PAY_FIXED": {
      const fixed = cfg.pay_fixed ?? 0;
      return clamp(Math.max(0, fare - fixed));
    }

    case "FARE_CAP": {
      const cap = cfg.fare_cap ?? 0;
      if (cap <= 0) return 0;
      return clamp(Math.max(0, fare - cap));
    }

    case "DISTANCE_TIERED": {
      if (!cfg.distance_tiers || cfg.distance_tiers.length === 0) return null;
      // Approximate: apply weighted % across distance using fare ∝ distance.
      if (distanceKm <= 0) return null;
      let remaining = distanceKm;
      let prev = 0;
      let weightedPct = 0;
      const tiers = [...cfg.distance_tiers].sort(
        (a, b) => (a.up_to_km ?? 1e9) - (b.up_to_km ?? 1e9)
      );
      for (const t of tiers) {
        const up = t.up_to_km == null ? distanceKm : Math.min(t.up_to_km, distanceKm);
        const span = Math.max(0, up - prev);
        if (span <= 0) continue;
        weightedPct += (span / distanceKm) * t.discount_pct;
        prev = up;
        remaining = Math.max(0, distanceKm - prev);
      }
      if (remaining > 0 && tiers.length > 0) {
        const last = tiers[tiers.length - 1]!;
        weightedPct += (remaining / distanceKm) * last.discount_pct;
      }
      return clamp((fare * weightedPct) / 100);
    }

    default:
      return null;
  }
}

export async function countCompletedParcelsForCustomer(
  db: PostgresJsDatabase<Record<string, unknown>>,
  customerId: number
): Promise<number> {
  if (!customerId || customerId < 1) return 0;
  const [row] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(ordersCore)
    .leftJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
    .where(
      and(
        eq(ordersCore.customerId, customerId),
        eq(ordersCore.orderType, "parcel"),
        eq(ordersCore.status, "delivered")
      )
    );
  const n = Number(row?.cnt ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Re-export ride counter for callers that only import this module. */
export { countCompletedPersonRidesForCustomer } from "./platformOfferFirstRide.js";
