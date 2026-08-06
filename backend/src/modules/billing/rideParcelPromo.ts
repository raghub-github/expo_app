/**
 * Ride & Parcel platform promo config — stored in billing_platform_offers.promo_config (jsonb).
 * Food offers leave this empty; Food evaluation ignores it.
 */

export const RIDE_PARCEL_PROMO_TYPES = [
  "FLAT_OFF",
  "PERCENT_OFF",
  "FREE_FIRST_N",
  "FREE_UP_TO_KM",
  "FLAT_FARE_UP_TO_KM",
  "PAY_FIXED",
  "FARE_CAP",
  "DISTANCE_TIERED",
  "PEAK_HOUR",
  "ROUTE_ZONE",
  "PAYMENT_MODE",
  "NEW_USER_N",
  "LOYALTY_MILESTONE",
  "REFERRAL",
  "SUBSCRIPTION",
  "COUPON",
  // Parcel-specific
  "FREE_PICKUP",
  "FREE_DROP",
  "WEIGHT_BASED",
  "EXPRESS",
  "SAME_CITY",
  "INTERCITY",
  "BUSINESS",
  "BULK",
] as const;

export type RideParcelPromoType = (typeof RIDE_PARCEL_PROMO_TYPES)[number];

export const RIDE_VEHICLE_OPTIONS = [
  "bike",
  "bike-lite",
  "auto",
  "cab-economy",
  "cab-premium",
  "travel",
  "ev",
  "premium",
] as const;

export const PEAK_SLOT_OPTIONS = [
  "morning_peak",
  "evening_peak",
  "night",
  "weekend",
  "festival",
] as const;

export const PAYMENT_MODE_OPTIONS = [
  "upi",
  "wallet",
  "card",
  "online",
  "cash",
  "cashless",
] as const;

export type DistanceTier = {
  /** Inclusive upper bound km for this tier (null = remainder). */
  up_to_km: number | null;
  discount_pct: number;
};

export type RideParcelPromoConfig = {
  promo_type: RideParcelPromoType;
  /** First N completed rides/parcels eligible (1–10). 0/omit = no first-N gate. */
  first_n_completed?: number | null;
  /** Max free rides/parcels when promo_type is FREE_FIRST_N (defaults to first_n_completed). */
  max_free_count?: number | null;
  /** Cap on fare waived (₹). */
  max_fare_covered?: number | null;
  /** Max distance covered for free / flat-fare promos (km). */
  max_km?: number | null;
  /** Flat customer fare (₹) for FLAT_FARE_UP_TO_KM. */
  flat_fare?: number | null;
  /** Customer pays only this amount (₹) for PAY_FIXED. */
  pay_fixed?: number | null;
  /** Max payable fare (₹) for FARE_CAP. */
  fare_cap?: number | null;
  /** Loyalty: complete N rides then unlock. */
  loyalty_complete_count?: number | null;
  distance_tiers?: DistanceTier[];
  peak_slots?: string[];
  vehicle_types?: string[];
  payment_modes?: string[];
  pickup_zones?: string[];
  drop_zones?: string[];
  /** Parcel */
  max_weight_kg?: number | null;
  min_weight_kg?: number | null;
  parcel_speed?: "express" | "normal" | "any" | null;
  parcel_scope?: "same_city" | "intercity" | "any" | null;
  parcel_audience?: "personal" | "business" | "any" | null;
  auto_apply?: boolean;
};

export function emptyRideParcelPromoConfig(
  service: "RIDE" | "PARCEL" = "RIDE"
): RideParcelPromoConfig {
  return {
    promo_type: "FLAT_OFF",
    first_n_completed: null,
    max_free_count: null,
    max_fare_covered: null,
    max_km: null,
    flat_fare: null,
    pay_fixed: null,
    fare_cap: null,
    loyalty_complete_count: null,
    distance_tiers: [],
    peak_slots: [],
    vehicle_types: [],
    payment_modes: [],
    pickup_zones: [],
    drop_zones: [],
    max_weight_kg: null,
    min_weight_kg: null,
    parcel_speed: "any",
    parcel_scope: "any",
    parcel_audience: "any",
    auto_apply: true,
  };
}

export function parseRideParcelPromoConfig(raw: unknown): RideParcelPromoConfig | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const promoType = String(o.promo_type ?? "").toUpperCase();
  if (!RIDE_PARCEL_PROMO_TYPES.includes(promoType as RideParcelPromoType)) return null;

  const numOrNull = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

  let distance_tiers: DistanceTier[] = [];
  if (Array.isArray(o.distance_tiers)) {
    distance_tiers = o.distance_tiers
      .map((t) => {
        if (!t || typeof t !== "object") return null;
        const row = t as Record<string, unknown>;
        const up = numOrNull(row.up_to_km);
        const pct = Number(row.discount_pct);
        if (!Number.isFinite(pct)) return null;
        return { up_to_km: up, discount_pct: pct };
      })
      .filter((x): x is DistanceTier => x != null);
  }

  return {
    promo_type: promoType as RideParcelPromoType,
    first_n_completed: numOrNull(o.first_n_completed),
    max_free_count: numOrNull(o.max_free_count),
    max_fare_covered: numOrNull(o.max_fare_covered),
    max_km: numOrNull(o.max_km),
    flat_fare: numOrNull(o.flat_fare),
    pay_fixed: numOrNull(o.pay_fixed),
    fare_cap: numOrNull(o.fare_cap),
    loyalty_complete_count: numOrNull(o.loyalty_complete_count),
    distance_tiers,
    peak_slots: strArr(o.peak_slots),
    vehicle_types: strArr(o.vehicle_types),
    payment_modes: strArr(o.payment_modes),
    pickup_zones: strArr(o.pickup_zones),
    drop_zones: strArr(o.drop_zones),
    max_weight_kg: numOrNull(o.max_weight_kg),
    min_weight_kg: numOrNull(o.min_weight_kg),
    parcel_speed:
      o.parcel_speed === "express" || o.parcel_speed === "normal" || o.parcel_speed === "any"
        ? o.parcel_speed
        : "any",
    parcel_scope:
      o.parcel_scope === "same_city" || o.parcel_scope === "intercity" || o.parcel_scope === "any"
        ? o.parcel_scope
        : "any",
    parcel_audience:
      o.parcel_audience === "personal" || o.parcel_audience === "business" || o.parcel_audience === "any"
        ? o.parcel_audience
        : "any",
    auto_apply: o.auto_apply !== false,
  };
}

export function rideParcelPromoPreviewTitle(
  cfg: RideParcelPromoConfig,
  service: "RIDE" | "PARCEL",
  discountType?: string | null,
  valueNumeric?: number | null
): string {
  const unit = service === "RIDE" ? "Ride" : "Parcel";
  const n = cfg.first_n_completed != null && cfg.first_n_completed > 0 ? cfg.first_n_completed : null;
  const km = cfg.max_km != null && cfg.max_km > 0 ? cfg.max_km : null;
  const val = valueNumeric != null && Number.isFinite(valueNumeric) ? valueNumeric : null;
  const isPct = String(discountType ?? "").toUpperCase() === "PERCENTAGE";

  switch (cfg.promo_type) {
    case "FREE_FIRST_N":
      return n && n > 1
        ? `First ${n} ${unit}s FREE${km ? ` (up to ${km} km)` : ""}`
        : `First ${unit} FREE${km ? ` (up to ${km} km)` : ""}`;
    case "FREE_UP_TO_KM":
      return `Free ${unit.toLowerCase()} up to ${km ?? "?"} km`;
    case "FLAT_FARE_UP_TO_KM":
      return `${unit} only ₹${cfg.flat_fare ?? "?"} up to ${km ?? "?"} km`;
    case "PAY_FIXED":
      return `Pay only ₹${cfg.pay_fixed ?? "?"}`;
    case "FARE_CAP":
      return `Max fare ₹${cfg.fare_cap ?? "?"}`;
    case "FLAT_OFF":
      return val != null ? `₹${Math.round(val)} OFF` : `Flat ${unit} discount`;
    case "PERCENT_OFF":
      return val != null ? `${Math.round(val)}% OFF` : `Percent ${unit} discount`;
    case "DISTANCE_TIERED":
      return `Distance-tiered ${unit.toLowerCase()} discount`;
    case "NEW_USER_N":
      return n && n > 1 ? `First ${n} ${unit}s offer` : `New ${unit.toLowerCase()} offer`;
    default:
      if (val != null) return isPct ? `${Math.round(val)}% OFF` : `₹${Math.round(val)} OFF`;
      return `${unit} offer`;
  }
}
