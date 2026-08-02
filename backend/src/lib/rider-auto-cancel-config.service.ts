/**
 * Backend read model for the "Auto-cancelled by engine" per-service config
 * (gm_rider_auto_cancel_config, migration 0474). Super Admin edits it from the
 * Financial Rule Engine → Rider Penalties → "Auto-cancelled by engine" tab.
 *
 * The watchdog reads this every tick, so we cache briefly and degrade to a
 * DISABLED default if the table is missing (pre-migration) — never throws.
 */
import { getSql } from "../db/client.js";

export type AutoCancelServiceType = "food" | "parcel" | "person_ride";
export type AutoCancelPhase = "pre_pickup" | "post_pickup";

export interface RiderAutoCancelConfig {
  serviceType: AutoCancelServiceType;
  phase: AutoCancelPhase;
  isEnabled: boolean;
  penaltyAmount: number;
  oppositeDirectionKm: number;
  noMovementMinutes: number;
  locationOffMinutes: number;
  routeDeviationM: number;
  enableLocationOffRule: boolean;
  enableNoMovementRule: boolean;
  enableOppositeDirectionRule: boolean;
  enableRouteDeviationRule: boolean;
  warningIntervalMinutes: number;
  graceMinutes: number;
  ledgerTitle: string;
  ledgerDescription: string;
  reasonCode: string | null;
}

export function disabledAutoCancelConfig(
  serviceType: AutoCancelServiceType,
  phase: AutoCancelPhase = "pre_pickup"
): RiderAutoCancelConfig {
  return {
    serviceType,
    phase,
    isEnabled: false,
    penaltyAmount: 0,
    oppositeDirectionKm: 7,
    noMovementMinutes: 15,
    locationOffMinutes: 15,
    routeDeviationM: 300,
    enableLocationOffRule: true,
    enableNoMovementRule: true,
    enableOppositeDirectionRule: true,
    enableRouteDeviationRule: true,
    warningIntervalMinutes: 4,
    graceMinutes: 0,
    ledgerTitle: "Auto-cancellation penalty",
    ledgerDescription:
      "The order was auto-cancelled by the system because the tracking rules were not met.",
    reasonCode: null,
  };
}

export function normalizeServiceType(raw: string | null | undefined): AutoCancelServiceType {
  const t = String(raw ?? "").trim().toLowerCase();
  if (t === "person_ride" || t === "ride" || t === "person-ride") return "person_ride";
  if (t === "parcel") return "parcel";
  return "food";
}

type CacheEntry = { at: number; value: RiderAutoCancelConfig };
const CACHE_TTL_MS = 15_000;
const cache = new Map<string, CacheEntry>();

type Row = {
  service_type: string;
  phase: string;
  is_enabled: boolean;
  penalty_amount: string | null;
  opposite_direction_km: string | null;
  no_movement_minutes: number | null;
  location_off_minutes: number | null;
  route_deviation_m: number | null;
  enable_location_off_rule: boolean;
  enable_no_movement_rule: boolean;
  enable_opposite_direction_rule: boolean;
  enable_route_deviation_rule: boolean;
  warning_interval_minutes: number | null;
  grace_minutes: number | null;
  ledger_title: string;
  ledger_description: string;
  reason_code: string | null;
};

export async function getRiderAutoCancelConfig(
  serviceType: AutoCancelServiceType,
  phase: AutoCancelPhase = "pre_pickup"
): Promise<RiderAutoCancelConfig> {
  const key = `${serviceType}:${phase}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  let value = disabledAutoCancelConfig(serviceType, phase);
  try {
    const sql = getSql();
    const rows = await sql.unsafe<Row[]>(
      `SELECT * FROM gm_rider_auto_cancel_config WHERE service_type = $1 AND phase = $2 LIMIT 1`,
      [serviceType, phase]
    );
    const r = rows[0];
    if (r) {
      value = {
        serviceType,
        phase,
        isEnabled: r.is_enabled,
        penaltyAmount: Number(r.penalty_amount ?? 0),
        oppositeDirectionKm: Number(r.opposite_direction_km ?? 7),
        noMovementMinutes: Number(r.no_movement_minutes ?? 15),
        locationOffMinutes: Number(r.location_off_minutes ?? 15),
        routeDeviationM: Number(r.route_deviation_m ?? 300),
        enableLocationOffRule: r.enable_location_off_rule,
        enableNoMovementRule: r.enable_no_movement_rule,
        enableOppositeDirectionRule: r.enable_opposite_direction_rule,
        enableRouteDeviationRule: r.enable_route_deviation_rule,
        warningIntervalMinutes: Number(r.warning_interval_minutes ?? 4),
        graceMinutes: Number(r.grace_minutes ?? 0),
        ledgerTitle: r.ledger_title,
        ledgerDescription: r.ledger_description,
        reasonCode: r.reason_code,
      };
    }
  } catch {
    // table missing (pre-migration) or transient — keep the disabled default.
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}
