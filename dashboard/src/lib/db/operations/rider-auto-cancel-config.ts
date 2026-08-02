/**
 * Super Admin — "Auto-cancelled by engine" channel config (per service).
 * Reads/writes gm_rider_auto_cancel_config (one row per service_type × phase).
 * Only pre_pickup is exposed for now (product decision). Distances in km/m,
 * times in minutes. Rows ship disabled; Super Admin turns a service on.
 */
import { getSql } from "../client";

export type AutoCancelServiceType = "food" | "parcel" | "person_ride";
export type AutoCancelPhase = "pre_pickup" | "post_pickup";

export type RiderAutoCancelServiceConfig = {
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
};

const SERVICES: AutoCancelServiceType[] = ["food", "parcel", "person_ride"];

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

function mapRow(r: Row): RiderAutoCancelServiceConfig {
  return {
    serviceType: r.service_type as AutoCancelServiceType,
    phase: r.phase as AutoCancelPhase,
    isEnabled: r.is_enabled,
    penaltyAmount: Number(r.penalty_amount ?? 0),
    oppositeDirectionKm: Number(r.opposite_direction_km ?? 0),
    noMovementMinutes: Number(r.no_movement_minutes ?? 0),
    locationOffMinutes: Number(r.location_off_minutes ?? 0),
    routeDeviationM: Number(r.route_deviation_m ?? 0),
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

async function ensureSeedRows(): Promise<void> {
  const sql = getSql();
  await sql.unsafe(
    `
      INSERT INTO gm_rider_auto_cancel_config (service_type, phase, penalty_amount)
      VALUES ('food','pre_pickup',5), ('parcel','pre_pickup',10), ('person_ride','pre_pickup',15)
      ON CONFLICT (service_type, phase) DO NOTHING
    `
  );
}

export async function getRiderAutoCancelConfig(
  phase: AutoCancelPhase = "pre_pickup"
): Promise<{ phase: AutoCancelPhase; services: RiderAutoCancelServiceConfig[] }> {
  const sql = getSql();
  await ensureSeedRows();
  const rows = await sql.unsafe<Row[]>(
    `SELECT * FROM gm_rider_auto_cancel_config WHERE phase = $1`,
    [phase]
  );
  const byService = new Map(rows.map((r) => [r.service_type, mapRow(r)]));
  // Always return the three services in a stable order.
  const services = SERVICES.map(
    (s) =>
      byService.get(s) ?? {
        serviceType: s,
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
      }
  );
  return { phase, services };
}

export type RiderAutoCancelServicePatch = {
  serviceType: AutoCancelServiceType;
  phase?: AutoCancelPhase;
  isEnabled?: boolean;
  penaltyAmount?: number;
  oppositeDirectionKm?: number;
  noMovementMinutes?: number;
  locationOffMinutes?: number;
  routeDeviationM?: number;
  enableLocationOffRule?: boolean;
  enableNoMovementRule?: boolean;
  enableOppositeDirectionRule?: boolean;
  enableRouteDeviationRule?: boolean;
  warningIntervalMinutes?: number;
  graceMinutes?: number;
  ledgerTitle?: string;
  ledgerDescription?: string;
  reasonCode?: string | null;
};

// column -> value coercion for a whitelist of editable fields
const NUMERIC_FIELDS: Record<string, keyof RiderAutoCancelServicePatch> = {
  penalty_amount: "penaltyAmount",
  opposite_direction_km: "oppositeDirectionKm",
  no_movement_minutes: "noMovementMinutes",
  location_off_minutes: "locationOffMinutes",
  route_deviation_m: "routeDeviationM",
  warning_interval_minutes: "warningIntervalMinutes",
  grace_minutes: "graceMinutes",
};
const BOOL_FIELDS: Record<string, keyof RiderAutoCancelServicePatch> = {
  is_enabled: "isEnabled",
  enable_location_off_rule: "enableLocationOffRule",
  enable_no_movement_rule: "enableNoMovementRule",
  enable_opposite_direction_rule: "enableOppositeDirectionRule",
  enable_route_deviation_rule: "enableRouteDeviationRule",
};
const TEXT_FIELDS: Record<string, keyof RiderAutoCancelServicePatch> = {
  ledger_title: "ledgerTitle",
  ledger_description: "ledgerDescription",
  reason_code: "reasonCode",
};

export async function saveRiderAutoCancelConfig(args: {
  services: RiderAutoCancelServicePatch[];
  updatedBy?: string | null;
}): Promise<{ phase: AutoCancelPhase; services: RiderAutoCancelServiceConfig[] }> {
  const sql = getSql();
  await ensureSeedRows();

  for (const patch of args.services) {
    if (!SERVICES.includes(patch.serviceType)) continue;
    const phase: AutoCancelPhase = patch.phase ?? "pre_pickup";
    const sets: string[] = [];
    const vals: (string | number | boolean | Date | null)[] = [];
    let i = 1;

    const push = (col: string, value: string | number | boolean | Date | null) => {
      sets.push(`${col} = $${i++}`);
      vals.push(value);
    };

    for (const [col, key] of Object.entries(NUMERIC_FIELDS)) {
      const v = patch[key];
      if (v != null && Number.isFinite(Number(v))) push(col, Math.max(0, Number(v)));
    }
    for (const [col, key] of Object.entries(BOOL_FIELDS)) {
      const v = patch[key];
      if (typeof v === "boolean") push(col, v);
    }
    for (const [col, key] of Object.entries(TEXT_FIELDS)) {
      const v = patch[key];
      if (v !== undefined) push(col, v === null ? null : String(v));
    }

    if (sets.length === 0) continue;
    push("updated_at", new Date());
    if (args.updatedBy) push("updated_by", args.updatedBy);

    vals.push(patch.serviceType);
    vals.push(phase);
    await sql.unsafe(
      `UPDATE gm_rider_auto_cancel_config
         SET ${sets.join(", ")}
       WHERE service_type = $${i++} AND phase = $${i++}`,
      vals
    );
  }

  return getRiderAutoCancelConfig(args.services[0]?.phase ?? "pre_pickup");
}
