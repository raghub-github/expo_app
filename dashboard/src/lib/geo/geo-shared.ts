/** Shared geo types + pure helpers — safe to import from Client Components (no DB). */

export type GeoHierarchyLevel =
  | "root"
  | "state"
  | "region"
  | "district"
  | "division"
  | "post_office"
  | "pincode";

export type GeoChildRow = {
  kind: string;
  id: string;
  name: string;
  pincode: string | null;
  path: string;
  latitude: string | null;
  longitude: string | null;
  is_food_enabled: boolean;
  is_parcel_enabled: boolean;
  is_ride_enabled: boolean;
  food_override: boolean;
  parcel_override: boolean;
  ride_override: boolean;
  has_children: boolean;
  /** Resolved `base_fee` rule walking chain (current → … → state); null if none. */
  effective_food_base_fee: string | null;
  effective_parcel_base_fee: string | null;
  effective_ride_base_fee: string | null;
  /** Effective rider payout params per service (JSON from geo_effective_rider_rate_summaries). */
  rider_rate_summaries?: RiderRateSummaries | null;
};

export type GeoSearchRow = {
  kind: string;
  id: string;
  name: string;
  pincode: string | null;
  state_name: string | null;
  region_name: string | null;
  district_name: string | null;
  division_name: string | null;
  po_name: string | null;
  path: string;
  latitude: string | null;
  longitude: string | null;
  is_food_enabled: boolean;
  is_parcel_enabled: boolean;
  is_ride_enabled: boolean;
  food_override: boolean;
  parcel_override: boolean;
  ride_override: boolean;
  sort_key: string;
  /** Present when API runs geo_effective_base_fee (after migration 0174). */
  effective_food_base_fee?: string | null;
  effective_parcel_base_fee?: string | null;
  effective_ride_base_fee?: string | null;
  rider_rate_summaries?: RiderRateSummaries | null;
};

export type GeoPricingRuleRow = {
  id: string;
  level: string;
  ref_id: string;
  service: string;
  rule_type: string;
  value_numeric: string | null;
  value_json: unknown;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** Effective rider rate card for one service (from geo_effective_rider_rate_card_detail). */
export type RiderRateEffectiveDetail = {
  id: string;
  base_fare: number;
  per_km_rate: number;
  min_distance_km: number;
  max_distance_km: number | null;
  waiting_charge_per_min: number;
  surge_multiplier: number;
  priority: number;
  override: boolean;
  applied_level: string;
  applied_ref_id: string;
  is_inherited: boolean;
  step_ord: number;
};

export type RiderRateSummaries = {
  food?: RiderRateEffectiveDetail | null;
  parcel?: RiderRateEffectiveDetail | null;
  ride?: RiderRateEffectiveDetail | null;
};

export type RiderRateCardRow = {
  id: string;
  level: string;
  ref_id: string;
  service_type: string;
  base_fare: string;
  per_km_rate: string;
  min_distance_km: string;
  max_distance_km: string | null;
  waiting_charge_per_min: string;
  surge_multiplier: string;
  priority: number;
  is_active: boolean;
  override: boolean;
  created_at: string;
  updated_at: string;
};

/** Ordered root → … → current (state first). */
export type GeoAncestorStep = {
  level: Exclude<GeoHierarchyLevel, "root">;
  id: string;
  name: string;
};

export function geoPricingRefKey(step: Pick<GeoAncestorStep, "level" | "id">): string {
  return `${step.level}:${step.id}`;
}

function num(v: unknown): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return 0;
}

/** Normalize JSON from geo_effective_rider_rate_summaries / detail. */
export function parseRiderRateEffectiveDetail(raw: unknown): RiderRateEffectiveDetail | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.id == null) return null;
  return {
    id: String(o.id),
    base_fare: num(o.base_fare),
    per_km_rate: num(o.per_km_rate),
    min_distance_km: num(o.min_distance_km),
    max_distance_km: o.max_distance_km == null ? null : num(o.max_distance_km),
    waiting_charge_per_min: num(o.waiting_charge_per_min),
    surge_multiplier: o.surge_multiplier == null || num(o.surge_multiplier) === 0 ? 1 : num(o.surge_multiplier),
    priority: Number(o.priority ?? 0),
    override: Boolean(o.override),
    applied_level: String(o.applied_level ?? ""),
    applied_ref_id: String(o.applied_ref_id ?? ""),
    is_inherited: Boolean(o.is_inherited),
    step_ord: Number(o.step_ord ?? 0),
  };
}

export function parseRiderRateSummaries(raw: unknown): RiderRateSummaries | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const food = parseRiderRateEffectiveDetail(o.food);
  const parcel = parseRiderRateEffectiveDetail(o.parcel);
  const ride = parseRiderRateEffectiveDetail(o.ride);
  if (!food && !parcel && !ride) return null;
  return { food: food ?? undefined, parcel: parcel ?? undefined, ride: ride ?? undefined };
}
