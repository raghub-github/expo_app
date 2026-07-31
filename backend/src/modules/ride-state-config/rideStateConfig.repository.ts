import { getSql } from "../../db/client.js";
import { resolveGeoLocation } from "../billing/geoLocationResolver.js";
import type { DropGeoRefByLevel } from "../billing/types.js";
import type { GeoHierarchyLevel, RideVehiclePricingType } from "../rider-payout-pricing/types.js";

const GEO_PRICING_ANCHOR_ORDER: GeoHierarchyLevel[] = [
  "pincode",
  "post_office",
  "division",
  "district",
  "region",
  "state",
];

export type RideVehicleLimitRow = {
  id: number;
  stateId: string;
  vehicleType: RideVehiclePricingType;
  maxDistanceKm: number;
  isEnabled: boolean;
};

export type StateSurgeType = "fixed" | "percentage";
export type StateSurgeVehicleScope =
  | "all"
  | "2_wheeler"
  | "3_wheeler"
  | "4_wheeler_non_ac"
  | "4_wheeler_ac";

/** Who pays the surge amount. See migration 0465. */
export type SurgeFundingMode = "CUSTOMER_100" | "COMPANY_100" | "SHARED";

export type StateSurgeConfigRow = {
  id: number;
  stateId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  surgeType: StateSurgeType;
  amount: number;
  vehicleType: StateSurgeVehicleScope;
  appliesFood: boolean;
  appliesParcel: boolean;
  appliesRide: boolean;
  maxRidersOnly: boolean;
  priority: number;
  manualActive: boolean;
  fundingMode: SurgeFundingMode;
  customerSharePct: number;
  companySharePct: number;
};

export type StateSurgeTimeSlotRow = {
  id: number;
  stateSurgeId: number;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  isEnabled: boolean;
};

function mapLimit(r: Record<string, unknown>): RideVehicleLimitRow {
  return {
    id: Number(r.id),
    stateId: String(r.state_id),
    vehicleType: String(r.vehicle_type) as RideVehiclePricingType,
    maxDistanceKm: Number(r.max_distance_km),
    isEnabled: r.is_enabled === true,
  };
}

function normalizeFundingMode(v: unknown): SurgeFundingMode {
  const s = typeof v === "string" ? v.toUpperCase() : "";
  if (s === "COMPANY_100" || s === "SHARED") return s;
  return "CUSTOMER_100";
}

function clampPct(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function mapSurge(r: Record<string, unknown>): StateSurgeConfigRow {
  const fundingMode = normalizeFundingMode(r.funding_mode);
  // For CUSTOMER_100 / COMPANY_100 the DB stores canonical shares; if a row
  // was written before migration 0465 (columns missing / null), collapse to
  // canonical CUSTOMER_100 so the resolver never sees partial data.
  const customerSharePct =
    fundingMode === "CUSTOMER_100"
      ? 100
      : fundingMode === "COMPANY_100"
        ? 0
        : clampPct(r.customer_share_pct, 100);
  const companySharePct =
    fundingMode === "CUSTOMER_100"
      ? 0
      : fundingMode === "COMPANY_100"
        ? 100
        : clampPct(r.company_share_pct, 0);
  return {
    id: Number(r.id),
    stateId: String(r.state_id),
    name: String(r.name),
    description: r.description == null ? null : String(r.description),
    enabled: r.enabled === true,
    surgeType: String(r.surge_type) as StateSurgeType,
    amount: Number(r.amount),
    vehicleType: String(r.vehicle_type) as StateSurgeVehicleScope,
    appliesFood: r.applies_food !== false,
    appliesParcel: r.applies_parcel !== false,
    appliesRide: r.applies_ride !== false,
    maxRidersOnly: r.max_riders_only === true,
    priority: Number(r.priority ?? 100),
    manualActive: r.manual_active === true,
    fundingMode,
    customerSharePct,
    companySharePct,
  };
}

function mapSlot(r: Record<string, unknown>): StateSurgeTimeSlotRow {
  const days = r.days_of_week;
  return {
    id: Number(r.id),
    stateSurgeId: Number(r.state_surge_id),
    startTime: String(r.start_time).slice(0, 5),
    endTime: String(r.end_time).slice(0, 5),
    daysOfWeek: Array.isArray(days) ? days.map((d) => Number(d)) : [0, 1, 2, 3, 4, 5, 6],
    isEnabled: r.is_enabled === true,
  };
}

export function pickMostSpecificGeoAnchor(
  refs: DropGeoRefByLevel | null
): { level: GeoHierarchyLevel; refId: string } | null {
  if (!refs) return null;
  for (const level of GEO_PRICING_ANCHOR_ORDER) {
    const refId = refs[level];
    if (refId) return { level, refId };
  }
  return null;
}

export async function resolveRidePricingGeoFromPickup(args: {
  pickupLat: number;
  pickupLng: number;
  pickupPincode?: string | null;
  pickupState?: string | null;
}): Promise<{
  stateId: string | null;
  pricingGeo: { level: GeoHierarchyLevel; refId: string } | null;
}> {
  const geo = await resolveGeoLocation({
    livePincode: args.pickupPincode,
    liveState: args.pickupState,
    latitude: args.pickupLat,
    longitude: args.pickupLng,
  });
  const stateId = geo.refs?.state ?? null;
  const pricingGeo =
    pickMostSpecificGeoAnchor(geo.refs) ??
    (stateId ? { level: "state" as GeoHierarchyLevel, refId: stateId } : null);
  return { stateId, pricingGeo };
}

export async function resolveStateIdFromGeoChain(
  level: GeoHierarchyLevel,
  refId: string
): Promise<string | null> {
  const sql = getSql();
  const rows = await sql<{ step_level: string; step_id: string }[]>`
    SELECT step_level::text AS step_level, step_id::text AS step_id
    FROM geo_pricing_chain_steps(${level}::geo_pricing_level, ${refId}::uuid)
    ORDER BY step_ord ASC
  `;
  for (const row of rows) {
    if (row.step_level === "state") return row.step_id;
  }
  return null;
}

export async function resolveRideStateIdFromCoords(args: {
  pickupLat: number;
  pickupLng: number;
  pickupPincode?: string | null;
  pickupState?: string | null;
}): Promise<string | null> {
  const { stateId } = await resolveRidePricingGeoFromPickup(args);
  return stateId;
}

export async function loadRideVehicleLimitsForState(stateId: string): Promise<RideVehicleLimitRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM ride_vehicle_limits
    WHERE state_id = ${stateId}::uuid AND is_enabled = true
    ORDER BY vehicle_type ASC
  `;
  return (Array.isArray(rows) ? rows : []).map((r) => mapLimit(r as Record<string, unknown>));
}

export async function loadStateSurgeConfigs(stateId: string): Promise<StateSurgeConfigRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM state_surge_configs
    WHERE state_id = ${stateId}::uuid AND deleted_at IS NULL
    ORDER BY priority DESC, id ASC
  `;
  return (Array.isArray(rows) ? rows : []).map((r) => mapSurge(r as Record<string, unknown>));
}

export async function loadStateSurgeTimeSlots(stateSurgeId?: number): Promise<StateSurgeTimeSlotRow[]> {
  const sql = getSql();
  const rows =
    stateSurgeId != null
      ? await sql`
          SELECT * FROM state_surge_time_slots
          WHERE state_surge_id = ${stateSurgeId}
          ORDER BY start_time ASC, id ASC
        `
      : await sql`
          SELECT * FROM state_surge_time_slots ORDER BY state_surge_id ASC, start_time ASC
        `;
  return (Array.isArray(rows) ? rows : []).map((r) => mapSlot(r as Record<string, unknown>));
}

export async function getMaxDistanceForVehicle(
  stateId: string | null,
  vehicleType: RideVehiclePricingType
): Promise<number | null> {
  if (!stateId) return null;
  const sql = getSql();
  const rows = await sql<{ max_distance_km: string }[]>`
    SELECT max_distance_km::text AS max_distance_km
    FROM ride_vehicle_limits
    WHERE state_id = ${stateId}::uuid
      AND vehicle_type = ${vehicleType}::ride_vehicle_pricing_type
      AND is_enabled = true
    LIMIT 1
  `;
  const row = rows[0];
  return row ? Number(row.max_distance_km) : null;
}

export type StateSurgeSettingsRow = {
  stateId: string;
  maxTotalSurgeAmount: number | null;
};

export async function ensureStateSurgeSettingsSchema(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS state_surge_settings (
      state_id uuid PRIMARY KEY,
      max_total_surge_amount numeric(12, 2) NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT state_surge_settings_state_fk FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE CASCADE,
      CONSTRAINT state_surge_settings_max_nonneg CHECK (
        max_total_surge_amount IS NULL OR max_total_surge_amount >= 0
      )
    )
  `;
}

export async function loadStateSurgeSettings(stateId: string): Promise<StateSurgeSettingsRow> {
  await ensureStateSurgeSettingsSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT state_id::text AS state_id, max_total_surge_amount
    FROM state_surge_settings
    WHERE state_id = ${stateId}::uuid
    LIMIT 1
  `;
  const row = rows[0] as { state_id?: string; max_total_surge_amount?: unknown } | undefined;
  return {
    stateId,
    maxTotalSurgeAmount:
      row?.max_total_surge_amount == null ? null : Number(row.max_total_surge_amount),
  };
}
