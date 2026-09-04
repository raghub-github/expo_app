import { getSql } from "../client";

export type GeoHierarchyLevel =
  | "state"
  | "region"
  | "district"
  | "division"
  | "post_office"
  | "pincode";
export type EligibilityService = "food" | "parcel" | "person_ride";
export type DocRequirement = "required" | "optional" | "exempt";
export type VehicleClass = "2_wheeler" | "3_wheeler" | "4_wheeler";
export type OwnershipType = "commercial" | "non_commercial";

/**
 * Rider service ELIGIBILITY policy row (separate from pricing). Geo-inherited
 * (nearest-ancestor via geo_pricing_chain_steps). Configures whether a service is
 * enabled and the document/vehicle/commercial gates at a geo node.
 */
export type RiderEligibilityRuleRow = {
  id: number;
  serviceType: EligibilityService;
  geoLevel: GeoHierarchyLevel;
  geoRefId: string;
  serviceEnabled: boolean;
  dlRequirement: DocRequirement;
  rcRequirement: DocRequirement;
  evProofRequirement: DocRequirement;
  ownershipProofRequirement: DocRequirement;
  commercialProofRequirement: DocRequirement;
  commercialRequired: boolean;
  allowedVehicleClasses: VehicleClass[];
  allowedFuelKinds: string[];
  allowedOwnership: OwnershipType[];
  priority: number;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
};

function normReq(v: unknown): DocRequirement {
  const s = String(v ?? "required").toLowerCase();
  return s === "optional" || s === "exempt" ? s : "required";
}

/** Proof gates default to exempt (no gate) when null/legacy. */
function normProof(v: unknown): DocRequirement {
  const s = String(v ?? "exempt").toLowerCase();
  return s === "required" || s === "optional" ? s : "exempt";
}

function mapRule(r: Record<string, unknown>): RiderEligibilityRuleRow {
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
  return {
    id: Number(r.id),
    serviceType: String(r.service_type) as EligibilityService,
    geoLevel: String(r.geo_level) as GeoHierarchyLevel,
    geoRefId: String(r.geo_ref_id),
    serviceEnabled: r.service_enabled !== false,
    dlRequirement: normReq(r.dl_requirement),
    rcRequirement: normReq(r.rc_requirement),
    evProofRequirement: normProof(r.ev_proof_requirement),
    ownershipProofRequirement: normProof(r.ownership_proof_requirement),
    commercialProofRequirement: normProof(r.commercial_proof_requirement),
    commercialRequired: r.commercial_required === true,
    allowedVehicleClasses: arr(r.allowed_vehicle_classes) as VehicleClass[],
    allowedFuelKinds: arr(r.allowed_fuel_kinds),
    allowedOwnership: arr(r.allowed_ownership) as OwnershipType[],
    priority: Number(r.priority ?? 100),
    isActive: r.is_active === true,
    effectiveFrom: r.effective_from == null ? null : String(r.effective_from),
    effectiveTo: r.effective_to == null ? null : String(r.effective_to),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

export async function listRiderEligibilityRules(args: {
  level: GeoHierarchyLevel;
  refId: string;
  service: EligibilityService;
}): Promise<RiderEligibilityRuleRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM rider_service_eligibility_rules
    WHERE geo_level = ${args.level}::geo_pricing_level AND geo_ref_id = ${args.refId}::uuid
      AND service_type = ${args.service} AND deleted_at IS NULL
    ORDER BY priority DESC, id ASC
  `;
  return (Array.isArray(rows) ? rows : []).map((r) => mapRule(r as Record<string, unknown>));
}

export async function getRiderEligibilityRuleById(
  id: number
): Promise<RiderEligibilityRuleRow | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM rider_service_eligibility_rules WHERE id = ${id} AND deleted_at IS NULL LIMIT 1
  `;
  const list = Array.isArray(rows) ? rows : [];
  return list.length ? mapRule(list[0] as Record<string, unknown>) : null;
}

export type RiderEligibilityRuleInput = {
  level: GeoHierarchyLevel;
  refId: string;
  service: EligibilityService;
  serviceEnabled: boolean;
  dlRequirement: DocRequirement;
  rcRequirement: DocRequirement;
  evProofRequirement: DocRequirement;
  ownershipProofRequirement: DocRequirement;
  commercialProofRequirement: DocRequirement;
  commercialRequired: boolean;
  allowedVehicleClasses: VehicleClass[];
  allowedFuelKinds: string[];
  allowedOwnership: OwnershipType[];
  priority: number;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

export async function insertRiderEligibilityRule(
  args: RiderEligibilityRuleInput
): Promise<RiderEligibilityRuleRow> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO rider_service_eligibility_rules (
      geo_level, geo_ref_id, service_type, service_enabled,
      dl_requirement, rc_requirement,
      ev_proof_requirement, ownership_proof_requirement, commercial_proof_requirement,
      commercial_required,
      allowed_vehicle_classes, allowed_fuel_kinds, allowed_ownership,
      priority, is_active, effective_from, effective_to
    ) VALUES (
      ${args.level}::geo_pricing_level, ${args.refId}::uuid, ${args.service}, ${args.serviceEnabled},
      ${args.dlRequirement}, ${args.rcRequirement},
      ${args.evProofRequirement}, ${args.ownershipProofRequirement}, ${args.commercialProofRequirement},
      ${args.commercialRequired},
      ${args.allowedVehicleClasses}::text[], ${args.allowedFuelKinds}::text[], ${args.allowedOwnership}::text[],
      ${args.priority}, ${args.isActive}, ${args.effectiveFrom}, ${args.effectiveTo}
    )
    RETURNING *
  `;
  return mapRule((Array.isArray(rows) ? rows : [])[0] as Record<string, unknown>);
}

export async function updateRiderEligibilityRule(
  id: number,
  args: Omit<RiderEligibilityRuleInput, "level" | "refId" | "service">
): Promise<RiderEligibilityRuleRow | null> {
  const sql = getSql();
  const rows = await sql`
    UPDATE rider_service_eligibility_rules SET
      service_enabled = ${args.serviceEnabled},
      dl_requirement = ${args.dlRequirement},
      rc_requirement = ${args.rcRequirement},
      ev_proof_requirement = ${args.evProofRequirement},
      ownership_proof_requirement = ${args.ownershipProofRequirement},
      commercial_proof_requirement = ${args.commercialProofRequirement},
      commercial_required = ${args.commercialRequired},
      allowed_vehicle_classes = ${args.allowedVehicleClasses}::text[],
      allowed_fuel_kinds = ${args.allowedFuelKinds}::text[],
      allowed_ownership = ${args.allowedOwnership}::text[],
      priority = ${args.priority},
      is_active = ${args.isActive},
      effective_from = ${args.effectiveFrom},
      effective_to = ${args.effectiveTo},
      updated_at = now()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING *
  `;
  const list = Array.isArray(rows) ? rows : [];
  return list.length ? mapRule(list[0] as Record<string, unknown>) : null;
}

export async function softDeleteRiderEligibilityRule(id: number): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    UPDATE rider_service_eligibility_rules
    SET deleted_at = now(), updated_at = now(), is_active = false
    WHERE id = ${id} AND deleted_at IS NULL RETURNING id
  `;
  return (Array.isArray(rows) ? rows : []).length > 0;
}
