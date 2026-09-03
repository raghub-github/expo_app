/**
 * Effective rider eligibility policy resolver — nearest-ancestor geo inheritance
 * (GLOBAL→STATE→DIVISION→DISTRICT→PINCODE) over rider_service_eligibility_rules,
 * same mechanism as service_payout_rules. Explicit child override wins; no rule at
 * any node → code default (serviceEligibilityDefaults). Deploy-safe: tolerates the
 * table not existing yet (pre-migration) by returning the default.
 */
import { getSql } from "../../db/client.js";
import type {
  EligibilityService,
  ServiceEligibilityPolicy,
  DocRequirement,
  VehicleClass,
  OwnershipType,
} from "./eligibilityEngine.js";
import { defaultPolicyForService } from "./serviceEligibilityDefaults.js";

type RuleRow = {
  service_enabled: boolean;
  dl_requirement: string;
  rc_requirement: string;
  commercial_required: boolean;
  allowed_vehicle_classes: string[] | null;
  allowed_fuel_kinds: string[] | null;
  allowed_ownership: string[] | null;
  effective_from: string | null;
  effective_to: string | null;
};

let tableMissing = false;

function normReq(v: string | null | undefined): DocRequirement {
  return v === "optional" || v === "exempt" ? v : "required";
}

async function findEffectiveNode(
  level: string,
  refId: string,
  service: EligibilityService,
  nowIso: string
): Promise<{ level: string; refId: string; row: RuleRow } | null> {
  const sql = getSql();
  const chain = await sql<{ step_level: string; step_id: string }[]>`
    SELECT step_level::text AS step_level, step_id::text AS step_id, step_ord
    FROM geo_pricing_chain_steps(${level}::geo_pricing_level, ${refId}::uuid)
    ORDER BY step_ord ASC
  `;
  for (const step of chain) {
    const rows = await sql<RuleRow[]>`
      SELECT service_enabled, dl_requirement, rc_requirement, commercial_required,
             allowed_vehicle_classes, allowed_fuel_kinds, allowed_ownership,
             effective_from, effective_to
      FROM rider_service_eligibility_rules
      WHERE geo_level = ${step.step_level}::geo_pricing_level
        AND geo_ref_id = ${step.step_id}::uuid
        AND service_type = ${service}
        AND is_active = TRUE AND deleted_at IS NULL
        AND (effective_from IS NULL OR effective_from <= ${nowIso}::timestamptz)
        AND (effective_to IS NULL OR effective_to >= ${nowIso}::timestamptz)
      ORDER BY priority DESC, id ASC
      LIMIT 1
    `;
    if (rows.length > 0) {
      return { level: step.step_level, refId: step.step_id, row: rows[0]! };
    }
  }
  return null;
}

/**
 * Resolve the effective eligibility policy for a geo node + service. Never throws:
 * on any DB error (incl. the table not yet migrated) it returns the code default so
 * eligibility evaluation and dispatch never wedge.
 */
export async function resolveEffectiveEligibilityPolicy(args: {
  level: string;
  refId: string;
  service: EligibilityService;
  now?: Date;
}): Promise<ServiceEligibilityPolicy> {
  const fallback = defaultPolicyForService(args.service);
  if (tableMissing || !args.level || !args.refId) return fallback;

  try {
    const nowIso = (args.now ?? new Date()).toISOString();
    const hit = await findEffectiveNode(args.level, args.refId, args.service, nowIso);
    if (!hit) return fallback;

    const r = hit.row;
    return {
      service: args.service,
      serviceEnabled: r.service_enabled !== false,
      dlRequirement: normReq(r.dl_requirement),
      rcRequirement: normReq(r.rc_requirement),
      commercialRequired: r.commercial_required === true,
      allowedVehicleClasses:
        (r.allowed_vehicle_classes?.filter(Boolean) as VehicleClass[] | undefined) ??
        fallback.allowedVehicleClasses,
      allowedFuelKinds: r.allowed_fuel_kinds?.filter(Boolean) ?? [],
      allowedOwnership:
        (r.allowed_ownership?.filter(Boolean) as OwnershipType[] | undefined) ??
        fallback.allowedOwnership,
      resolvedGeo: { level: hit.level, refId: hit.refId },
      ruleVersion: `${hit.level}:${hit.refId}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/relation .*rider_service_eligibility_rules.* does not exist/i.test(msg)) {
      tableMissing = true; // stop retrying until process restart post-migration
    }
    return fallback;
  }
}
