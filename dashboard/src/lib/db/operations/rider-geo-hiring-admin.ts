import { getSql } from "../client";
import {
  resolveHiringFromChain,
  type HiringSourceLevel,
} from "@/lib/geo/rider-geo-hiring-chain";

export type GeoHierarchyLevel =
  | "state"
  | "region"
  | "district"
  | "division"
  | "post_office"
  | "pincode";

export type RiderGeoHiringRow = {
  id: number;
  geoLevel: GeoHierarchyLevel;
  geoRefId: string;
  hiringEnabled: boolean;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type { HiringSourceLevel };
export { resolveHiringFromChain };

export type ResolvedHiringFlags = {
  hiringEnabled: boolean;
  /** True only when THIS node has its own explicit row. */
  explicit: boolean;
  sourceLevel: HiringSourceLevel;
};

type DbRow = {
  id: number;
  geo_level: string;
  geo_ref_id: string;
  hiring_enabled: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(r: DbRow): RiderGeoHiringRow {
  return {
    id: Number(r.id),
    geoLevel: r.geo_level as GeoHierarchyLevel,
    geoRefId: String(r.geo_ref_id),
    hiringEnabled: r.hiring_enabled !== false,
    isActive: r.is_active !== false,
    notes: r.notes,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function normId(id: string | null | undefined): string {
  return String(id || "").trim().toLowerCase();
}

export async function getRiderGeoHiringExplicit(args: {
  level: GeoHierarchyLevel;
  refId: string;
}): Promise<RiderGeoHiringRow | null> {
  const sql = getSql();
  try {
    const rows = await sql<DbRow[]>`
      SELECT id, geo_level::text AS geo_level, geo_ref_id::text AS geo_ref_id,
             hiring_enabled, is_active, notes, created_at::text AS created_at,
             updated_at::text AS updated_at
      FROM rider_geo_hiring
      WHERE geo_level = ${args.level}::geo_pricing_level
        AND geo_ref_id = ${args.refId}::uuid
        AND deleted_at IS NULL AND is_active = TRUE
      ORDER BY id ASC
      LIMIT 1
    `;
    return rows[0] ? mapRow(rows[0]) : null;
  } catch {
    return null;
  }
}

/** Effective hiring for a single node (most-specific explicit ancestor; default ON). */
export async function resolveRiderGeoHiringEffective(args: {
  level: GeoHierarchyLevel;
  refId: string;
}): Promise<ResolvedHiringFlags> {
  const sql = getSql();
  try {
    const chain = await sql<{ step_level: string; step_id: string }[]>`
      SELECT step_level::text AS step_level, step_id::text AS step_id, step_ord
      FROM geo_pricing_chain_steps(${args.level}::geo_pricing_level, ${args.refId}::uuid)
      ORDER BY step_ord ASC
    `;
    const steps: Array<{ level: string; hiringEnabled: boolean | null }> = [];
    for (const step of chain) {
      const rows = await sql<{ hiring_enabled: boolean }[]>`
        SELECT hiring_enabled
        FROM rider_geo_hiring
        WHERE geo_level = ${step.step_level}::geo_pricing_level
          AND geo_ref_id = ${step.step_id}::uuid
          AND is_active = TRUE AND deleted_at IS NULL
        ORDER BY id ASC
        LIMIT 1
      `;
      steps.push({
        level: step.step_level,
        hiringEnabled: rows[0] ? rows[0].hiring_enabled !== false : null,
      });
    }
    const resolved = resolveHiringFromChain(steps);
    const explicitOnNode =
      resolved.source !== "default" &&
      resolved.source !== "none" &&
      String(args.level).toLowerCase() === resolved.source;
    return {
      hiringEnabled: resolved.hiringAllowed,
      explicit: explicitOnNode,
      sourceLevel: resolved.source,
    };
  } catch {
    // Fail closed for admin display — never claim siblings are ON after a resolution error.
    return { hiringEnabled: false, explicit: false, sourceLevel: "none" };
  }
}

/**
 * Batch-resolve hiring for many geo rows without N+1 chain lookups.
 * Each node is resolved independently — toggling District A never mutates sibling flags.
 */
export async function batchResolveRiderGeoHiring(
  targets: Array<{ kind: string; id: string }>,
): Promise<Map<string, ResolvedHiringFlags>> {
  const out = new Map<string, ResolvedHiringFlags>();
  const relevant = targets.filter(
    (t) => t.kind === "state" || t.kind === "region" || t.kind === "district",
  );
  if (relevant.length === 0) return out;

  const sql = getSql();
  const stateIds = relevant.filter((t) => t.kind === "state").map((t) => t.id);
  const regionIds = relevant.filter((t) => t.kind === "region").map((t) => t.id);
  const districtIds = relevant.filter((t) => t.kind === "district").map((t) => t.id);

  type Ancestry = {
    id: string;
    region_id: string | null;
    state_id: string | null;
  };

  let districtAnc: Ancestry[] = [];
  let regionAnc: Array<{ id: string; state_id: string | null }> = [];

  if (districtIds.length > 0) {
    districtAnc = await sql<Ancestry[]>`
      SELECT d.id::text AS id,
             d.region_id::text AS region_id,
             r.state_id::text AS state_id
      FROM districts d
      JOIN regions r ON r.id = d.region_id
      WHERE d.id IN ${sql(districtIds)}
    `;
  }
  if (regionIds.length > 0) {
    regionAnc = await sql<{ id: string; state_id: string | null }[]>`
      SELECT id::text AS id, state_id::text AS state_id
      FROM regions
      WHERE id IN ${sql(regionIds)}
    `;
  }

  const allStateIds = new Set<string>(stateIds.map(normId));
  const allRegionIds = new Set<string>(regionIds.map(normId));
  const allDistrictIds = new Set<string>(districtIds.map(normId));

  for (const d of districtAnc) {
    if (d.region_id) allRegionIds.add(normId(d.region_id));
    if (d.state_id) allStateIds.add(normId(d.state_id));
  }
  for (const r of regionAnc) {
    if (r.state_id) allStateIds.add(normId(r.state_id));
  }

  const hiringMap = new Map<string, boolean>(); // `${level}:${id}` → enabled
  const loadLevel = async (level: "state" | "region" | "district", ids: string[]) => {
    if (ids.length === 0) return;
    const rows = await sql<{ geo_ref_id: string; hiring_enabled: boolean }[]>`
      SELECT geo_ref_id::text AS geo_ref_id, hiring_enabled
      FROM rider_geo_hiring
      WHERE geo_level = ${level}::geo_pricing_level
        AND geo_ref_id IN ${sql(ids)}
        AND is_active = TRUE AND deleted_at IS NULL
    `;
    for (const row of rows) {
      hiringMap.set(`${level}:${normId(row.geo_ref_id)}`, row.hiring_enabled !== false);
    }
  };

  await Promise.all([
    loadLevel("state", [...allStateIds]),
    loadLevel("region", [...allRegionIds]),
    loadLevel("district", [...allDistrictIds]),
  ]);

  const districtById = new Map(districtAnc.map((d) => [normId(d.id), d]));
  const regionById = new Map(regionAnc.map((r) => [normId(r.id), r]));

  const flagFor = (level: string, id: string | null | undefined): boolean | null => {
    if (!id) return null;
    const key = `${level}:${normId(id)}`;
    return hiringMap.has(key) ? hiringMap.get(key)! : null;
  };

  for (const t of relevant) {
    const id = t.id;
    let chain: Array<{ level: string; hiringEnabled: boolean | null }> = [];
    if (t.kind === "district") {
      const a = districtById.get(normId(id));
      if (!a) {
        // Orphan / missing join — do not invent ON for siblings; leave unresolved as OFF.
        out.set(`${t.kind}:${id}`, {
          hiringEnabled: false,
          explicit: false,
          sourceLevel: "none",
        });
        continue;
      }
      chain = [
        { level: "district", hiringEnabled: flagFor("district", id) },
        { level: "region", hiringEnabled: flagFor("region", a.region_id) },
        { level: "state", hiringEnabled: flagFor("state", a.state_id) },
      ];
    } else if (t.kind === "region") {
      const a = regionById.get(normId(id));
      if (!a) {
        out.set(`${t.kind}:${id}`, {
          hiringEnabled: false,
          explicit: false,
          sourceLevel: "none",
        });
        continue;
      }
      chain = [
        { level: "region", hiringEnabled: flagFor("region", id) },
        { level: "state", hiringEnabled: flagFor("state", a.state_id) },
      ];
    } else {
      chain = [{ level: "state", hiringEnabled: flagFor("state", id) }];
    }

    const resolved = resolveHiringFromChain(chain);
    const explicitOnNode =
      resolved.source !== "default" &&
      resolved.source !== "none" &&
      String(t.kind).toLowerCase() === resolved.source &&
      flagFor(t.kind, id) !== null;

    out.set(`${t.kind}:${id}`, {
      hiringEnabled: resolved.hiringAllowed,
      explicit: explicitOnNode,
      sourceLevel: resolved.source,
    });
  }

  return out;
}

export async function upsertRiderGeoHiring(args: {
  level: GeoHierarchyLevel;
  refId: string;
  hiringEnabled: boolean;
  notes?: string | null;
}): Promise<RiderGeoHiringRow> {
  const sql = getSql();
  const existing = await sql<{ id: number }[]>`
    SELECT id FROM rider_geo_hiring
    WHERE geo_level = ${args.level}::geo_pricing_level
      AND geo_ref_id = ${args.refId}::uuid
      AND deleted_at IS NULL
    ORDER BY id ASC
    LIMIT 1
  `;

  if (existing[0]) {
    const rows = await sql<DbRow[]>`
      UPDATE rider_geo_hiring SET
        hiring_enabled = ${args.hiringEnabled},
        is_active = TRUE,
        notes = ${args.notes ?? null},
        updated_at = NOW(),
        deleted_at = NULL
      WHERE id = ${existing[0].id}
      RETURNING id, geo_level::text AS geo_level, geo_ref_id::text AS geo_ref_id,
                hiring_enabled, is_active, notes, created_at::text AS created_at,
                updated_at::text AS updated_at
    `;
    return mapRow(rows[0]!);
  }

  const rows = await sql<DbRow[]>`
    INSERT INTO rider_geo_hiring (
      geo_level, geo_ref_id, hiring_enabled, is_active, notes
    ) VALUES (
      ${args.level}::geo_pricing_level,
      ${args.refId}::uuid,
      ${args.hiringEnabled},
      TRUE,
      ${args.notes ?? null}
    )
    RETURNING id, geo_level::text AS geo_level, geo_ref_id::text AS geo_ref_id,
              hiring_enabled, is_active, notes, created_at::text AS created_at,
              updated_at::text AS updated_at
  `;
  return mapRow(rows[0]!);
}

/** Soft-delete explicit config so the node inherits parent/default again. */
export async function clearRiderGeoHiring(args: {
  level: GeoHierarchyLevel;
  refId: string;
}): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE rider_geo_hiring
    SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
    WHERE geo_level = ${args.level}::geo_pricing_level
      AND geo_ref_id = ${args.refId}::uuid
      AND deleted_at IS NULL
  `;
}

async function bulkUpsertHiring(
  level: "state" | "region" | "district",
  refIds: string[],
  hiringEnabled: boolean,
): Promise<void> {
  if (refIds.length === 0) return;
  const sql = getSql();
  // Soft-delete existing, then insert fresh rows in one pass (scoped id list only).
  await sql`
    UPDATE rider_geo_hiring
    SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
    WHERE geo_level = ${level}::geo_pricing_level
      AND geo_ref_id IN ${sql(refIds)}
      AND deleted_at IS NULL
  `;
  for (const refId of refIds) {
    await sql`
      INSERT INTO rider_geo_hiring (geo_level, geo_ref_id, hiring_enabled, is_active, notes)
      VALUES (${level}::geo_pricing_level, ${refId}::uuid, ${hiringEnabled}, TRUE, NULL)
    `;
  }
}

async function clearHiringForRefIds(
  level: "region" | "district",
  refIds: string[],
): Promise<void> {
  if (refIds.length === 0) return;
  const sql = getSql();
  await sql`
    UPDATE rider_geo_hiring
    SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
    WHERE geo_level = ${level}::geo_pricing_level
      AND geo_ref_id IN ${sql(refIds)}
      AND deleted_at IS NULL
  `;
}

async function loadDistrictAncestors(districtId: string): Promise<{
  districtId: string;
  regionId: string;
  stateId: string;
} | null> {
  const sql = getSql();
  const [row] = await sql<{ district_id: string; region_id: string; state_id: string }[]>`
    SELECT d.id::text AS district_id,
           r.id::text AS region_id,
           s.id::text AS state_id
    FROM districts d
    JOIN regions r ON r.id = d.region_id
    JOIN states s ON s.id = r.state_id
    WHERE d.id = ${districtId}::uuid
    LIMIT 1
  `;
  if (!row) return null;
  return {
    districtId: row.district_id,
    regionId: row.region_id,
    stateId: row.state_id,
  };
}

async function loadRegionAncestor(regionId: string): Promise<{
  regionId: string;
  stateId: string;
} | null> {
  const sql = getSql();
  const [row] = await sql<{ region_id: string; state_id: string }[]>`
    SELECT id::text AS region_id, state_id::text AS state_id
    FROM regions
    WHERE id = ${regionId}::uuid
    LIMIT 1
  `;
  if (!row?.state_id) return null;
  return { regionId: row.region_id, stateId: row.state_id };
}

/**
 * Final hiring hierarchy (State → Region → District):
 *
 * - State ON  → clear child overrides → every region/district inherits ON
 * - State OFF → force every region + district OFF
 * - District ON → that district ON, its region ON, state ON;
 *                 sibling districts OFF; sibling regions OFF
 * - District OFF → that district OFF; then reconcile region/state
 * - Region ON → that region ON, its districts inherit ON, state ON;
 *               sibling regions stay OFF (explicit) so they are unaffected
 * - Region OFF → that region OFF + all its districts OFF; reconcile state
 * - If no active hiring path remains under a state → State automatically OFF
 */
export async function applyRiderGeoHiringToggle(args: {
  level: GeoHierarchyLevel;
  refId: string;
  hiringEnabled: boolean;
  notes?: string | null;
}): Promise<RiderGeoHiringRow> {
  const level = args.level;
  if (level !== "state" && level !== "region" && level !== "district") {
    return upsertRiderGeoHiring(args);
  }

  const sql = getSql();

  // ─── STATE ───────────────────────────────────────────────────────────
  if (level === "state") {
    const regionIds = (
      await sql<{ id: string }[]>`
        SELECT id::text AS id FROM regions WHERE state_id = ${args.refId}::uuid
      `
    ).map((r) => r.id);
    const districtIds =
      regionIds.length === 0
        ? []
        : (
            await sql<{ id: string }[]>`
              SELECT d.id::text AS id
              FROM districts d
              WHERE d.region_id IN ${sql(regionIds)}
            `
          ).map((r) => r.id);

    if (args.hiringEnabled) {
      // State ON → full hierarchy ON via inheritance (no child override rows).
      await clearHiringForRefIds("region", regionIds);
      await clearHiringForRefIds("district", districtIds);
      return upsertRiderGeoHiring({
        level: "state",
        refId: args.refId,
        hiringEnabled: true,
        notes: args.notes ?? null,
      });
    }

    // State OFF → every child OFF (explicit) so UI shows OFF everywhere.
    await bulkUpsertHiring("region", regionIds, false);
    await bulkUpsertHiring("district", districtIds, false);
    return upsertRiderGeoHiring({
      level: "state",
      refId: args.refId,
      hiringEnabled: false,
      notes: args.notes ?? null,
    });
  }

  // ─── REGION ──────────────────────────────────────────────────────────
  if (level === "region") {
    const anc = await loadRegionAncestor(args.refId);
    if (!anc) {
      return upsertRiderGeoHiring(args);
    }
    const districtIds = (
      await sql<{ id: string }[]>`
        SELECT id::text AS id FROM districts WHERE region_id = ${args.refId}::uuid
      `
    ).map((r) => r.id);

    if (args.hiringEnabled) {
      // Region ON → all its districts ON (clear overrides); State ON.
      // Sibling regions: keep effectively OFF (do not open them via State inherit).
      await clearHiringForRefIds("district", districtIds);
      const otherRegionIds = (
        await sql<{ id: string }[]>`
          SELECT id::text AS id FROM regions
          WHERE state_id = ${anc.stateId}::uuid
            AND id <> ${args.refId}::uuid
        `
      ).map((r) => r.id);
      // Only force OFF siblings that are not already Explicit ON.
      if (otherRegionIds.length > 0) {
        const keepOn = await sql<{ geo_ref_id: string }[]>`
          SELECT geo_ref_id::text AS geo_ref_id
          FROM rider_geo_hiring
          WHERE geo_level = 'region'::geo_pricing_level
            AND geo_ref_id IN ${sql(otherRegionIds)}
            AND hiring_enabled = TRUE
            AND is_active = TRUE AND deleted_at IS NULL
        `;
        const keep = new Set(keepOn.map((r) => normId(r.geo_ref_id)));
        const forceOff = otherRegionIds.filter((id) => !keep.has(normId(id)));
        await bulkUpsertHiring("region", forceOff, false);
        // Districts under regions we forced OFF must not stay Explicit ON.
        if (forceOff.length > 0) {
          const otherDistrictIds = (
            await sql<{ id: string }[]>`
              SELECT id::text AS id FROM districts
              WHERE region_id IN ${sql(forceOff)}
            `
          ).map((r) => r.id);
          await bulkUpsertHiring("district", otherDistrictIds, false);
        }
      }
      await upsertRiderGeoHiring({
        level: "state",
        refId: anc.stateId,
        hiringEnabled: true,
      });
      return upsertRiderGeoHiring({
        level: "region",
        refId: args.refId,
        hiringEnabled: true,
        notes: args.notes ?? null,
      });
    }

    // Region OFF → all districts under it OFF; then auto State OFF if nothing left.
    await bulkUpsertHiring("district", districtIds, false);
    const row = await upsertRiderGeoHiring({
      level: "region",
      refId: args.refId,
      hiringEnabled: false,
      notes: args.notes ?? null,
    });
    await reconcileStateHiringSummary(anc.stateId);
    return row;
  }

  // ─── DISTRICT ────────────────────────────────────────────────────────
  const anc = await loadDistrictAncestors(args.refId);
  if (!anc) {
    return upsertRiderGeoHiring(args);
  }

  if (args.hiringEnabled) {
    // District ON → Region ON + State ON. Never activate sibling districts/regions.
    const siblingDistrictIds = (
      await sql<{ id: string }[]>`
        SELECT id::text AS id FROM districts
        WHERE region_id = ${anc.regionId}::uuid
          AND id <> ${args.refId}::uuid
      `
    ).map((r) => r.id);
    await bulkUpsertHiring("district", siblingDistrictIds, false);

    const otherRegionIds = (
      await sql<{ id: string }[]>`
        SELECT id::text AS id FROM regions
        WHERE state_id = ${anc.stateId}::uuid
          AND id <> ${anc.regionId}::uuid
      `
    ).map((r) => r.id);
    await bulkUpsertHiring("region", otherRegionIds, false);
    // Districts under sibling regions → OFF
    if (otherRegionIds.length > 0) {
      const otherDistrictIds = (
        await sql<{ id: string }[]>`
          SELECT id::text AS id FROM districts
          WHERE region_id IN ${sql(otherRegionIds)}
        `
      ).map((r) => r.id);
      await bulkUpsertHiring("district", otherDistrictIds, false);
    }

    await upsertRiderGeoHiring({
      level: "state",
      refId: anc.stateId,
      hiringEnabled: true,
    });
    await upsertRiderGeoHiring({
      level: "region",
      refId: anc.regionId,
      hiringEnabled: true,
    });
    return upsertRiderGeoHiring({
      level: "district",
      refId: args.refId,
      hiringEnabled: true,
      notes: args.notes ?? null,
    });
  }

  // District OFF → only this district; reconcile region + state if nothing active left.
  const row = await upsertRiderGeoHiring({
    level: "district",
    refId: args.refId,
    hiringEnabled: false,
    notes: args.notes ?? null,
  });

  const stillOnInRegion = await sql<{ id: number }[]>`
    SELECT 1 AS id
    FROM rider_geo_hiring h
    JOIN districts d ON d.id = h.geo_ref_id
    WHERE d.region_id = ${anc.regionId}::uuid
      AND h.geo_level = 'district'::geo_pricing_level
      AND h.hiring_enabled = TRUE
      AND h.is_active = TRUE AND h.deleted_at IS NULL
    LIMIT 1
  `;
  if (stillOnInRegion.length === 0) {
    await upsertRiderGeoHiring({
      level: "region",
      refId: anc.regionId,
      hiringEnabled: false,
    });
  }
  await reconcileStateHiringSummary(anc.stateId);
  return row;
}

/**
 * True when at least one district under the state is effectively hireable
 * (nearest explicit ancestor wins — same algorithm as rider app).
 */
export async function hasActiveHiringPathInState(stateId: string): Promise<boolean> {
  const sql = getSql();
  const districts = await sql<{ id: string; region_id: string }[]>`
    SELECT d.id::text AS id, d.region_id::text AS region_id
    FROM districts d
    JOIN regions r ON r.id = d.region_id
    WHERE r.state_id = ${stateId}::uuid
  `;
  if (districts.length === 0) {
    const stateExplicit = await getRiderGeoHiringExplicit({
      level: "state",
      refId: stateId,
    });
    return stateExplicit?.hiringEnabled === true;
  }

  const regionIds = [...new Set(districts.map((d) => d.region_id).filter(Boolean))];
  const hiringMap = new Map<string, boolean>();
  const load = async (level: "state" | "region" | "district", ids: string[]) => {
    if (ids.length === 0) return;
    const rows = await sql<{ geo_ref_id: string; hiring_enabled: boolean }[]>`
      SELECT geo_ref_id::text AS geo_ref_id, hiring_enabled
      FROM rider_geo_hiring
      WHERE geo_level = ${level}::geo_pricing_level
        AND geo_ref_id IN ${sql(ids)}
        AND is_active = TRUE AND deleted_at IS NULL
    `;
    for (const row of rows) {
      hiringMap.set(`${level}:${normId(row.geo_ref_id)}`, row.hiring_enabled !== false);
    }
  };
  await Promise.all([
    load("state", [stateId]),
    load("region", regionIds),
    load(
      "district",
      districts.map((d) => d.id),
    ),
  ]);

  const flag = (level: string, id: string | null | undefined): boolean | null => {
    if (!id) return null;
    const key = `${level}:${normId(id)}`;
    return hiringMap.has(key) ? hiringMap.get(key)! : null;
  };

  for (const d of districts) {
    const resolved = resolveHiringFromChain([
      { level: "district", hiringEnabled: flag("district", d.id) },
      { level: "region", hiringEnabled: flag("region", d.region_id) },
      { level: "state", hiringEnabled: flag("state", stateId) },
    ]);
    if (resolved.hiringAllowed) return true;
  }
  return false;
}

/** If nothing under the state is hireable, force State OFF. */
export async function reconcileStateHiringSummary(stateId: string): Promise<void> {
  const active = await hasActiveHiringPathInState(stateId);
  if (active) return;
  await upsertRiderGeoHiring({
    level: "state",
    refId: stateId,
    hiringEnabled: false,
  });
}
