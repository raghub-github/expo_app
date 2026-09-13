/**
 * Geo-scoped rider hiring (State → Region → District).
 * Most-specific explicit row via geo_pricing_chain_steps wins.
 * No row in chain → default hiring ON for known hierarchy nodes.
 * Unknown / manual-Other (no geo ids) → hiring OFF (not assumed eligible).
 */
import { getSql } from "../db/client.js";

export type HiringStatus = "HIRING" | "NOT_HIRING";

export type ResolvedRiderHiring = {
  hiringAllowed: boolean;
  status: HiringStatus;
  /** Where the effective flag came from. */
  source: "district" | "region" | "state" | "default" | "none";
  resolvedGeo: { level: string; refId: string } | null;
  matchedRuleId: number | null;
  explicit: boolean;
  state?: string | null;
  region?: string | null;
  district?: string | null;
};

type HiringRow = {
  id: number;
  hiring_enabled: boolean;
};

let tableMissing = false;

function normUuid(id: string | null | undefined): string {
  return String(id || "").trim().toLowerCase();
}

/** Prefer district → region → state for chain start. */
export function pickHiringGeoAnchor(ids: {
  districtId?: string | null;
  regionId?: string | null;
  stateId?: string | null;
}): { level: string; refId: string } | null {
  if (ids.districtId) return { level: "district", refId: ids.districtId };
  if (ids.regionId) return { level: "region", refId: ids.regionId };
  if (ids.stateId) return { level: "state", refId: ids.stateId };
  return null;
}

/**
 * Pure inheritance: walk most-specific → ancestors; first non-null explicit wins.
 * null entries mean "no config at this level".
 * `explicit` here means "matched some explicit row in the chain" — callers that need
 * "explicit on this node" should compare `source` to the requested level.
 */
export function resolveHiringFromChain(
  chain: Array<{ level: string; hiringEnabled: boolean | null }>,
): {
  hiringAllowed: boolean;
  source: ResolvedRiderHiring["source"];
  explicit: boolean;
} {
  for (const step of chain) {
    if (step.hiringEnabled === null || step.hiringEnabled === undefined) continue;
    const level = String(step.level || "").toLowerCase();
    const source: ResolvedRiderHiring["source"] =
      level === "district" || level === "region" || level === "state"
        ? level
        : "default";
    return {
      hiringAllowed: step.hiringEnabled === true,
      source,
      explicit: true,
    };
  }
  return { hiringAllowed: true, source: "default", explicit: false };
}

async function findMostSpecificHiring(
  level: string,
  refId: string,
): Promise<{ level: string; refId: string; row: HiringRow } | null> {
  const sql = getSql();
  const chain = await sql<{ step_level: string; step_id: string }[]>`
    SELECT step_level::text AS step_level, step_id::text AS step_id, step_ord
    FROM geo_pricing_chain_steps(${level}::geo_pricing_level, ${refId}::uuid)
    ORDER BY step_ord ASC
  `;
  for (const step of chain) {
    const rows = await sql<HiringRow[]>`
      SELECT id, hiring_enabled
      FROM rider_geo_hiring
      WHERE geo_level = ${step.step_level}::geo_pricing_level
        AND geo_ref_id = ${step.step_id}::uuid
        AND is_active = TRUE AND deleted_at IS NULL
      ORDER BY id ASC
      LIMIT 1
    `;
    if (rows.length > 0) {
      return { level: step.step_level, refId: step.step_id, row: rows[0]! };
    }
  }
  return null;
}

export async function resolveRiderHiring(args: {
  stateId?: string | null;
  regionId?: string | null;
  districtId?: string | null;
  /** When true (manual Other with no UUIDs), never treat as eligible. */
  manualOther?: boolean;
  stateName?: string | null;
  regionName?: string | null;
  districtName?: string | null;
}): Promise<ResolvedRiderHiring> {
  const labels = {
    state: args.stateName ?? null,
    region: args.regionName ?? null,
    district: args.districtName ?? null,
  };

  if (args.manualOther || (!args.stateId && !args.regionId && !args.districtId)) {
    return {
      hiringAllowed: false,
      status: "NOT_HIRING",
      source: "none",
      resolvedGeo: null,
      matchedRuleId: null,
      explicit: false,
      ...labels,
    };
  }

  const anchor = pickHiringGeoAnchor(args);
  if (!anchor) {
    return {
      hiringAllowed: false,
      status: "NOT_HIRING",
      source: "none",
      resolvedGeo: null,
      matchedRuleId: null,
      explicit: false,
      ...labels,
    };
  }

  if (tableMissing) {
    return {
      hiringAllowed: true,
      status: "HIRING",
      source: "default",
      resolvedGeo: { level: anchor.level, refId: anchor.refId },
      matchedRuleId: null,
      explicit: false,
      ...labels,
    };
  }

  try {
    const hit = await findMostSpecificHiring(anchor.level, anchor.refId);
    if (!hit) {
      return {
        hiringAllowed: true,
        status: "HIRING",
        source: "default",
        resolvedGeo: { level: anchor.level, refId: anchor.refId },
        matchedRuleId: null,
        explicit: false,
        ...labels,
      };
    }
    const allowed = hit.row.hiring_enabled === true;
    const lvl = String(hit.level || "").toLowerCase();
    const source: ResolvedRiderHiring["source"] =
      lvl === "district" || lvl === "region" || lvl === "state" ? lvl : "default";
    const explicitOnNode =
      normUuid(hit.refId) === normUuid(anchor.refId) &&
      String(hit.level).toLowerCase() === String(anchor.level).toLowerCase();
    return {
      hiringAllowed: allowed,
      status: allowed ? "HIRING" : "NOT_HIRING",
      source,
      resolvedGeo: { level: hit.level, refId: hit.refId },
      matchedRuleId: Number(hit.row.id),
      explicit: explicitOnNode,
      ...labels,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/rider_geo_hiring|does not exist|undefined_table/i.test(msg)) {
      tableMissing = true;
      return {
        hiringAllowed: true,
        status: "HIRING",
        source: "default",
        resolvedGeo: { level: anchor.level, refId: anchor.refId },
        matchedRuleId: null,
        explicit: false,
        ...labels,
      };
    }
    // Other DB errors: fail closed so siblings of an ON district never look hireable.
    return {
      hiringAllowed: false,
      status: "NOT_HIRING",
      source: "none",
      resolvedGeo: { level: anchor.level, refId: anchor.refId },
      matchedRuleId: null,
      explicit: false,
      ...labels,
    };
  }
}
