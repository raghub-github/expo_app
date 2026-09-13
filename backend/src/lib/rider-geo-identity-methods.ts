/**
 * Geo-scoped Aadhaar/identity method flags for rider onboarding.
 * Most-specific ancestor via geo_pricing_chain_steps wins; empty → all methods
 * allowed by global Policy Center. Intersect with verification_policies mode.
 */
import { getSql } from "../db/client.js";

export type RiderIdentityMethods = {
  digilocker: boolean;
  aadhaarMasking: boolean;
  manualUpload: boolean;
};

export type ResolvedRiderIdentityMethods = RiderIdentityMethods & {
  /** Global Policy Center mode for aadhaar_digilocker. */
  mode: "manual" | "auto" | "hybrid" | "disabled";
  source: "geo" | "global";
  resolvedGeo: { level: string; refId: string } | null;
  matchedRuleId: number | null;
};

type MethodRow = {
  id: number;
  digilocker_enabled: boolean;
  aadhaar_masking_enabled: boolean;
  manual_upload_enabled: boolean;
};

let tableMissing = false;

const ALL_ALLOWED: RiderIdentityMethods = {
  digilocker: true,
  aadhaarMasking: true,
  manualUpload: true,
};

async function findMostSpecificMethods(
  level: string,
  refId: string,
): Promise<{ level: string; refId: string; row: MethodRow } | null> {
  const sql = getSql();
  const chain = await sql<{ step_level: string; step_id: string }[]>`
    SELECT step_level::text AS step_level, step_id::text AS step_id, step_ord
    FROM geo_pricing_chain_steps(${level}::geo_pricing_level, ${refId}::uuid)
    ORDER BY step_ord ASC
  `;
  for (const step of chain) {
    const rows = await sql<MethodRow[]>`
      SELECT id, digilocker_enabled, aadhaar_masking_enabled, manual_upload_enabled
      FROM rider_geo_identity_methods
      WHERE geo_level = ${step.step_level}::geo_pricing_level
        AND geo_ref_id = ${step.step_id}::uuid
        AND is_active = TRUE AND deleted_at IS NULL
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
 * Map global verification mode onto which methods are conceptually available
 * before geo flags are applied.
 */
export function methodsFromGlobalMode(
  mode: string,
): RiderIdentityMethods & { mode: ResolvedRiderIdentityMethods["mode"] } {
  const m = String(mode || "manual").toLowerCase();
  if (m === "disabled") {
    return { digilocker: false, aadhaarMasking: false, manualUpload: false, mode: "disabled" };
  }
  if (m === "auto") {
    return { digilocker: true, aadhaarMasking: true, manualUpload: false, mode: "auto" };
  }
  if (m === "hybrid") {
    return { digilocker: true, aadhaarMasking: true, manualUpload: true, mode: "hybrid" };
  }
  return { digilocker: false, aadhaarMasking: false, manualUpload: true, mode: "manual" };
}

export function intersectIdentityMethods(
  global: RiderIdentityMethods,
  geo: RiderIdentityMethods | null,
): RiderIdentityMethods {
  if (!geo) return global;
  return {
    digilocker: global.digilocker && geo.digilocker,
    aadhaarMasking: global.aadhaarMasking && geo.aadhaarMasking,
    manualUpload: global.manualUpload && geo.manualUpload,
  };
}

export async function resolveRiderIdentityMethods(args: {
  geoLevel?: string | null;
  geoRefId?: string | null;
  globalMode?: string | null;
}): Promise<ResolvedRiderIdentityMethods> {
  const fromGlobal = methodsFromGlobalMode(args.globalMode ?? "manual");
  const base: ResolvedRiderIdentityMethods = {
    ...fromGlobal,
    source: "global",
    resolvedGeo: null,
    matchedRuleId: null,
  };

  if (tableMissing || !args.geoLevel || !args.geoRefId) {
    return base;
  }

  try {
    const hit = await findMostSpecificMethods(args.geoLevel, args.geoRefId);
    if (!hit) return base;
    const geoFlags: RiderIdentityMethods = {
      digilocker: hit.row.digilocker_enabled !== false,
      aadhaarMasking: hit.row.aadhaar_masking_enabled !== false,
      manualUpload: hit.row.manual_upload_enabled !== false,
    };
    const methods = intersectIdentityMethods(fromGlobal, geoFlags);
    return {
      ...methods,
      mode: fromGlobal.mode,
      source: "geo",
      resolvedGeo: { level: hit.level, refId: hit.refId },
      matchedRuleId: Number(hit.row.id),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/rider_geo_identity_methods|does not exist|undefined_table/i.test(msg)) {
      tableMissing = true;
    }
    return base;
  }
}

/** Prefer district → region → state anchor for identity method lookup. */
export function pickIdentityGeoAnchor(ids: {
  districtId?: string | null;
  regionId?: string | null;
  stateId?: string | null;
}): { level: string; refId: string } | null {
  if (ids.districtId) return { level: "district", refId: ids.districtId };
  if (ids.regionId) return { level: "region", refId: ids.regionId };
  if (ids.stateId) return { level: "state", refId: ids.stateId };
  return null;
}

export { ALL_ALLOWED };
