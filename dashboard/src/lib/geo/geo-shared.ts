/** Shared geo types + pure helpers — safe to import from Client Components (no DB). */

export type GeoHierarchyLevel =
  | "root"
  | "state"
  | "region"
  | "district"
  | "division"
  | "post_office"
  | "pincode";

/** Effective platform offers for a node (geo_effective_platform_offers_json). */
export type GeoEffectivePlatformOffer = {
  platform_offer_id: number;
  name: string | null;
  service_type: string;
  offer_audience: string;
  offer_kind: string;
  offer_setup_summary: string;
  applied_level: string;
  applied_ref_id: string;
  is_inherited: boolean;
};

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
  /**
   * Customer delivery progressive slabs preview (nearest-wins via `delivery_rate_slabs_effective`).
   * This is a compact label derived from the first slab (min_km=0) for quick tree scanning.
   */
  customer_food_delivery_slabs_preview: string | null;
  customer_parcel_delivery_slabs_preview: string | null;
  customer_ride_delivery_slabs_preview: string | null;
  /** Effective rider payout params per service (JSON from geo_effective_rider_rate_summaries). */
  rider_rate_summaries?: RiderRateSummaries | null;
  /** Merged platform offer bindings up the ancestor chain (closest wins per offer id). */
  effective_platform_offers?: GeoEffectivePlatformOffer[] | null;
  /** State-only: Super Admin rider-online checkout gate. Null on non-state rows. */
  require_rider_online_check?: boolean | null;
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
  customer_food_delivery_slabs_preview?: string | null;
  customer_parcel_delivery_slabs_preview?: string | null;
  customer_ride_delivery_slabs_preview?: string | null;
  rider_rate_summaries?: RiderRateSummaries | null;
  effective_platform_offers?: GeoEffectivePlatformOffer[] | null;
  require_rider_online_check?: boolean | null;
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

function numId(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") return parseInt(v, 10);
  return NaN;
}

export function parseGeoEffectivePlatformOffers(raw: unknown): GeoEffectivePlatformOffer[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const out: GeoEffectivePlatformOffer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = numId(o.platform_offer_id);
    if (!Number.isInteger(id)) continue;
    out.push({
      platform_offer_id: id,
      name: o.name == null ? null : String(o.name),
      service_type: String(o.service_type ?? "").toUpperCase(),
      offer_audience: String(o.offer_audience ?? "CUSTOMER").toUpperCase(),
      offer_kind: String(o.offer_kind ?? "DISCOUNT").toUpperCase(),
      offer_setup_summary: String(o.offer_setup_summary ?? ""),
      applied_level: String(o.applied_level ?? ""),
      applied_ref_id: String(o.applied_ref_id ?? ""),
      is_inherited: Boolean(o.is_inherited),
    });
  }
  return out.length > 0 ? out : [];
}
