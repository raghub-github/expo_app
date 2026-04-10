import { getSql } from "../client";
import type {
  GeoAncestorStep,
  GeoChildRow,
  GeoHierarchyLevel,
  GeoPricingRuleRow,
  GeoSearchRow,
  RiderRateCardRow,
} from "@/lib/geo/geo-shared";
import { geoPricingRefKey, parseRiderRateSummaries } from "@/lib/geo/geo-shared";

export type {
  GeoAncestorStep,
  GeoChildRow,
  GeoHierarchyLevel,
  GeoPricingRuleRow,
  GeoSearchRow,
  RiderRateCardRow,
} from "@/lib/geo/geo-shared";

export async function geoGetAncestorChain(
  level: Exclude<GeoHierarchyLevel, "root">,
  id: string
): Promise<GeoAncestorStep[]> {
  const sql = getSql();
  if (level === "state") {
    const rows = await sql<{ id: string; name: string }[]>`
      SELECT id, name FROM states WHERE id = ${id}::uuid`;
    const s = rows[0];
    if (!s) return [];
    return [{ level: "state", id: s.id, name: s.name }];
  }
  if (level === "region") {
    const rows = await sql<{ sid: string; sname: string; rid: string; rname: string }[]>`
      SELECT s.id AS sid, s.name AS sname, r.id AS rid, r.name AS rname
      FROM regions r
      JOIN states s ON s.id = r.state_id
      WHERE r.id = ${id}::uuid`;
    const r = rows[0];
    if (!r) return [];
    return [
      { level: "state", id: r.sid, name: r.sname },
      { level: "region", id: r.rid, name: r.rname },
    ];
  }
  if (level === "district") {
    const rows = await sql<{
      sid: string;
      sname: string;
      rid: string;
      rname: string;
      did: string;
      dname: string;
    }[]>`
      SELECT s.id AS sid, s.name AS sname, r.id AS rid, r.name AS rname,
             d.id AS did, d.name AS dname
      FROM districts d
      JOIN regions r ON r.id = d.region_id
      JOIN states s ON s.id = r.state_id
      WHERE d.id = ${id}::uuid`;
    const d = rows[0];
    if (!d) return [];
    return [
      { level: "state", id: d.sid, name: d.sname },
      { level: "region", id: d.rid, name: d.rname },
      { level: "district", id: d.did, name: d.dname },
    ];
  }
  if (level === "division") {
    const rows = await sql<{
      sid: string;
      sname: string;
      rid: string;
      rname: string;
      did: string;
      dname: string;
      dvid: string;
      dvname: string;
    }[]>`
      SELECT s.id AS sid, s.name AS sname, r.id AS rid, r.name AS rname,
             d.id AS did, d.name AS dname, dv.id AS dvid, dv.name AS dvname
      FROM divisions dv
      JOIN districts d ON d.id = dv.district_id
      JOIN regions r ON r.id = d.region_id
      JOIN states s ON s.id = r.state_id
      WHERE dv.id = ${id}::uuid`;
    const x = rows[0];
    if (!x) return [];
    return [
      { level: "state", id: x.sid, name: x.sname },
      { level: "region", id: x.rid, name: x.rname },
      { level: "district", id: x.did, name: x.dname },
      { level: "division", id: x.dvid, name: x.dvname },
    ];
  }
  if (level === "post_office") {
    const rows = await sql<{
      sid: string;
      sname: string;
      rid: string;
      rname: string;
      did: string;
      dname: string;
      dvid: string;
      dvname: string;
      poid: string;
      poname: string;
    }[]>`
      SELECT s.id AS sid, s.name AS sname, r.id AS rid, r.name AS rname,
             d.id AS did, d.name AS dname, dv.id AS dvid, dv.name AS dvname,
             po.id AS poid, po.name AS poname
      FROM post_offices po
      JOIN divisions dv ON dv.id = po.division_id
      JOIN districts d ON d.id = dv.district_id
      JOIN regions r ON r.id = d.region_id
      JOIN states s ON s.id = r.state_id
      WHERE po.id = ${id}::uuid`;
    const x = rows[0];
    if (!x) return [];
    return [
      { level: "state", id: x.sid, name: x.sname },
      { level: "region", id: x.rid, name: x.rname },
      { level: "district", id: x.did, name: x.dname },
      { level: "division", id: x.dvid, name: x.dvname },
      { level: "post_office", id: x.poid, name: x.poname },
    ];
  }
  const rows = await sql<{
    sid: string;
    sname: string;
    rid: string;
    rname: string;
    did: string;
    dname: string;
    dvid: string;
    dvname: string;
    poid: string;
    poname: string;
    pid: string;
    pin: string;
  }[]>`
    SELECT s.id AS sid, s.name AS sname, r.id AS rid, r.name AS rname,
           d.id AS did, d.name AS dname, dv.id AS dvid, dv.name AS dvname,
           po.id AS poid, po.name AS poname, p.id AS pid, p.pincode AS pin
    FROM pincodes p
    JOIN pincode_post_offices ppo ON ppo.pincode_id = p.id
    JOIN post_offices po ON po.id = ppo.post_office_id
    JOIN divisions dv ON dv.id = po.division_id
    JOIN districts d ON d.id = dv.district_id
    JOIN regions r ON r.id = d.region_id
    JOIN states s ON s.id = r.state_id
    WHERE p.id = ${id}::uuid
    LIMIT 1`;
  const x = rows[0];
  if (!x) return [];
  return [
    { level: "state", id: x.sid, name: x.sname },
    { level: "region", id: x.rid, name: x.rname },
    { level: "district", id: x.did, name: x.dname },
    { level: "division", id: x.dvid, name: x.dvname },
    { level: "post_office", id: x.poid, name: x.poname },
    { level: "pincode", id: x.pid, name: x.pin },
  ];
}

export async function getGeoPricingContext(
  level: Exclude<GeoHierarchyLevel, "root">,
  refId: string
): Promise<{ chain: GeoAncestorStep[]; rulesByRef: Record<string, GeoPricingRuleRow[]> }> {
  const chain = await geoGetAncestorChain(level, refId);
  const rulesByRef: Record<string, GeoPricingRuleRow[]> = {};
  await Promise.all(
    chain.map(async (step) => {
      const k = geoPricingRefKey(step);
      rulesByRef[k] = await listGeoPricingRules(step.level, step.id);
    })
  );
  return { chain, rulesByRef };
}

type ServiceFlagRow = {
  is_food_enabled: boolean;
  is_parcel_enabled: boolean;
  is_ride_enabled: boolean;
  food_override: boolean;
  parcel_override: boolean;
  ride_override: boolean;
  has_children: boolean;
  latitude: string | null;
  longitude: string | null;
};

async function withEffectiveBaseFees(
  level: Exclude<GeoHierarchyLevel, "root">,
  id: string,
  row: GeoChildRow
): Promise<GeoChildRow> {
  const sql = getSql();
  try {
    const [fr] = await sql<{
      ef: string | null;
      ep: string | null;
      er: string | null;
      rider_rate_summaries: unknown;
    }[]>`
      SELECT
        geo_effective_base_fee(${level}::geo_pricing_level, ${id}::uuid, 'food'::geo_service)::text AS ef,
        geo_effective_base_fee(${level}::geo_pricing_level, ${id}::uuid, 'parcel'::geo_service)::text AS ep,
        geo_effective_base_fee(${level}::geo_pricing_level, ${id}::uuid, 'ride'::geo_service)::text AS er,
        geo_effective_rider_rate_summaries(${level}::geo_pricing_level, ${id}::uuid) AS rider_rate_summaries
    `;
    if (!fr) return row;
    return {
      ...row,
      effective_food_base_fee: fr.ef,
      effective_parcel_base_fee: fr.ep,
      effective_ride_base_fee: fr.er,
      rider_rate_summaries: parseRiderRateSummaries(fr.rider_rate_summaries),
    };
  } catch {
    return row;
  }
}

async function geoFetchChildRowSnapshot(
  level: Exclude<GeoHierarchyLevel, "root">,
  id: string,
  name: string,
  fullPath: string
): Promise<GeoChildRow> {
  const sql = getSql();
  const base = (f: ServiceFlagRow): GeoChildRow => ({
    kind: level,
    id,
    name,
    pincode: level === "pincode" ? name : null,
    path: fullPath,
    latitude: f.latitude != null ? String(f.latitude) : null,
    longitude: f.longitude != null ? String(f.longitude) : null,
    is_food_enabled: f.is_food_enabled,
    is_parcel_enabled: f.is_parcel_enabled,
    is_ride_enabled: f.is_ride_enabled,
    food_override: f.food_override,
    parcel_override: f.parcel_override,
    ride_override: f.ride_override,
    has_children: f.has_children,
    effective_food_base_fee: null,
    effective_parcel_base_fee: null,
    effective_ride_base_fee: null,
    rider_rate_summaries: null,
  });

  if (level === "state") {
    const [r] = await sql<ServiceFlagRow[]>`
      SELECT s.is_food_enabled, s.is_parcel_enabled, s.is_ride_enabled,
             s.food_override, s.parcel_override, s.ride_override,
             EXISTS (SELECT 1 FROM regions r2 WHERE r2.state_id = s.id LIMIT 1) AS has_children,
             NULL::numeric AS latitude, NULL::numeric AS longitude
      FROM states s WHERE s.id = ${id}::uuid`;
    if (!r) throw new Error("Geo state not found");
    return withEffectiveBaseFees(level, id, base(r));
  }
  if (level === "region") {
    const [r] = await sql<ServiceFlagRow[]>`
      SELECT r.is_food_enabled, r.is_parcel_enabled, r.is_ride_enabled,
             r.food_override, r.parcel_override, r.ride_override,
             EXISTS (SELECT 1 FROM districts d WHERE d.region_id = r.id LIMIT 1) AS has_children,
             NULL::numeric AS latitude, NULL::numeric AS longitude
      FROM regions r WHERE r.id = ${id}::uuid`;
    if (!r) throw new Error("Geo region not found");
    return withEffectiveBaseFees(level, id, base(r));
  }
  if (level === "district") {
    const [r] = await sql<ServiceFlagRow[]>`
      SELECT d.is_food_enabled, d.is_parcel_enabled, d.is_ride_enabled,
             d.food_override, d.parcel_override, d.ride_override,
             EXISTS (SELECT 1 FROM divisions dv WHERE dv.district_id = d.id LIMIT 1) AS has_children,
             NULL::numeric AS latitude, NULL::numeric AS longitude
      FROM districts d WHERE d.id = ${id}::uuid`;
    if (!r) throw new Error("Geo district not found");
    return withEffectiveBaseFees(level, id, base(r));
  }
  if (level === "division") {
    const [r] = await sql<ServiceFlagRow[]>`
      SELECT dv.is_food_enabled, dv.is_parcel_enabled, dv.is_ride_enabled,
             dv.food_override, dv.parcel_override, dv.ride_override,
             EXISTS (SELECT 1 FROM post_offices po WHERE po.division_id = dv.id LIMIT 1) AS has_children,
             NULL::numeric AS latitude, NULL::numeric AS longitude
      FROM divisions dv WHERE dv.id = ${id}::uuid`;
    if (!r) throw new Error("Geo division not found");
    return withEffectiveBaseFees(level, id, base(r));
  }
  if (level === "post_office") {
    const [r] = await sql<ServiceFlagRow[]>`
      SELECT po.is_food_enabled, po.is_parcel_enabled, po.is_ride_enabled,
             po.food_override, po.parcel_override, po.ride_override,
             EXISTS (SELECT 1 FROM pincode_post_offices ppo WHERE ppo.post_office_id = po.id LIMIT 1) AS has_children,
             po.latitude::numeric AS latitude, po.longitude::numeric AS longitude
      FROM post_offices po WHERE po.id = ${id}::uuid`;
    if (!r) throw new Error("Geo post office not found");
    return withEffectiveBaseFees(level, id, base(r));
  }
  const [r] = await sql<ServiceFlagRow[]>`
    SELECT p.is_food_enabled, p.is_parcel_enabled, p.is_ride_enabled,
           p.food_override, p.parcel_override, p.ride_override,
           false AS has_children,
           NULL::numeric AS latitude, NULL::numeric AS longitude
    FROM pincodes p WHERE p.id = ${id}::uuid`;
  if (!r) throw new Error("Geo pincode not found");
  return withEffectiveBaseFees(level, id, base(r));
}

/** Full hierarchy root → hit with live service flags (for flat search detail panel). */
export async function geoGetAncestorChainAsChildRows(
  level: Exclude<GeoHierarchyLevel, "root">,
  refId: string
): Promise<GeoChildRow[]> {
  const chain = await geoGetAncestorChain(level, refId);
  const out: GeoChildRow[] = [];
  let pathAcc = "";
  for (const step of chain) {
    pathAcc = pathAcc ? `${pathAcc} / ${step.name}` : step.name;
    out.push(await geoFetchChildRowSnapshot(step.level, step.id, step.name, pathAcc));
  }
  return out;
}

export async function geoGetChildren(params: {
  parentLevel: GeoHierarchyLevel;
  parentId: string | null;
  limit?: number;
  afterName?: string | null;
  afterId?: string | null;
  stateId?: string | null;
  food?: boolean | null;
  parcel?: boolean | null;
  ride?: boolean | null;
}): Promise<GeoChildRow[]> {
  const sql = getSql();
  const limit = params.limit ?? 80;
  if (params.parentLevel !== "root" && !params.parentId) {
    return [];
  }
  const parentUuid = params.parentLevel === "root" ? null : params.parentId;
  const raw = await sql<Array<GeoChildRow & { rider_rate_summaries?: unknown }>>`
    WITH ch AS (
      SELECT * FROM geo_get_children(
        ${params.parentLevel},
        ${parentUuid}::uuid,
        ${limit},
        ${params.afterName ?? null},
        ${params.afterId ?? null}::uuid,
        ${params.stateId ?? null}::uuid,
        ${params.food ?? null},
        ${params.parcel ?? null},
        ${params.ride ?? null}
      )
    )
    SELECT
      ch.kind,
      ch.id,
      ch.name,
      ch.pincode,
      ch.path,
      ch.latitude::text,
      ch.longitude::text,
      ch.is_food_enabled,
      ch.is_parcel_enabled,
      ch.is_ride_enabled,
      ch.food_override,
      ch.parcel_override,
      ch.ride_override,
      ch.has_children,
      geo_effective_base_fee(ch.kind::geo_pricing_level, ch.id, 'food'::geo_service)::text AS effective_food_base_fee,
      geo_effective_base_fee(ch.kind::geo_pricing_level, ch.id, 'parcel'::geo_service)::text AS effective_parcel_base_fee,
      geo_effective_base_fee(ch.kind::geo_pricing_level, ch.id, 'ride'::geo_service)::text AS effective_ride_base_fee,
      geo_effective_rider_rate_summaries(ch.kind::geo_pricing_level, ch.id) AS rider_rate_summaries
    FROM ch
  `;
  return raw.map((r) => ({
    ...r,
    rider_rate_summaries: parseRiderRateSummaries(r.rider_rate_summaries),
  }));
}

export async function geoSearchLocations(params: {
  query: string;
  types?: string[];
  limit?: number;
  afterSort?: string | null;
  afterId?: string | null;
  stateId?: string | null;
  food?: boolean | null;
  parcel?: boolean | null;
  ride?: boolean | null;
}): Promise<GeoSearchRow[]> {
  const sql = getSql();
  const types = params.types?.length ? params.types : ["state", "region", "district", "division", "post_office", "pincode"];
  const limit = params.limit ?? 60;
  const raw = await sql<Array<GeoSearchRow & { rider_rate_summaries?: unknown }>>`
    WITH h AS (
      SELECT * FROM geo_search_locations(
        ${params.query.trim()},
        ${sql.array(types)}::text[],
        ${limit},
        ${params.afterSort ?? null},
        ${params.afterId ?? null}::uuid,
        ${params.stateId ?? null}::uuid,
        ${params.food ?? null},
        ${params.parcel ?? null},
        ${params.ride ?? null}
      )
    )
    SELECT
      h.kind,
      h.id,
      h.name,
      h.pincode,
      h.state_name,
      h.region_name,
      h.district_name,
      h.division_name,
      h.po_name,
      h.path,
      h.latitude::text,
      h.longitude::text,
      h.is_food_enabled,
      h.is_parcel_enabled,
      h.is_ride_enabled,
      h.food_override,
      h.parcel_override,
      h.ride_override,
      h.sort_key::text,
      geo_effective_base_fee(h.kind::geo_pricing_level, h.id, 'food'::geo_service)::text AS effective_food_base_fee,
      geo_effective_base_fee(h.kind::geo_pricing_level, h.id, 'parcel'::geo_service)::text AS effective_parcel_base_fee,
      geo_effective_base_fee(h.kind::geo_pricing_level, h.id, 'ride'::geo_service)::text AS effective_ride_base_fee,
      geo_effective_rider_rate_summaries(h.kind::geo_pricing_level, h.id) AS rider_rate_summaries
    FROM h
  `;
  return raw.map((r) => ({
    ...r,
    rider_rate_summaries: parseRiderRateSummaries(r.rider_rate_summaries),
  }));
}

export async function listRiderRateCardsByLevel(params: {
  level: string;
  refId: string;
  limit?: number;
  offset?: number;
}): Promise<RiderRateCardRow[]> {
  const sql = getSql();
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);
  return sql<RiderRateCardRow[]>`
    SELECT
      id::text AS id,
      level::text AS level,
      ref_id::text AS ref_id,
      service_type::text AS service_type,
      base_fare::text AS base_fare,
      per_km_rate::text AS per_km_rate,
      min_distance_km::text AS min_distance_km,
      max_distance_km::text AS max_distance_km,
      waiting_charge_per_min::text AS waiting_charge_per_min,
      surge_multiplier::text AS surge_multiplier,
      priority,
      is_active,
      override,
      created_at::text AS created_at,
      updated_at::text AS updated_at
    FROM rider_rate_cards
    WHERE level = ${params.level}::geo_pricing_level
      AND ref_id = ${params.refId}::uuid
    ORDER BY service_type ASC, priority DESC, updated_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
}

export async function upsertRiderRateCardDb(params: {
  level: string;
  refId: string;
  service: "food" | "parcel" | "ride";
  baseFare: number;
  perKmRate: number;
  minDistanceKm: number;
  maxDistanceKm: number | null;
  waitingChargePerMin: number;
  surgeMultiplier: number;
  priority: number;
  isActive: boolean;
  override: boolean;
}): Promise<RiderRateCardRow> {
  const sql = getSql();
  const sm = params.surgeMultiplier > 0 ? params.surgeMultiplier : 1;
  const [row] = await sql<RiderRateCardRow[]>`
    INSERT INTO rider_rate_cards (
      level, ref_id, service_type,
      base_fare, per_km_rate, min_distance_km, max_distance_km,
      waiting_charge_per_min, surge_multiplier,
      priority, is_active, override
    ) VALUES (
      ${params.level}::geo_pricing_level,
      ${params.refId}::uuid,
      ${params.service}::geo_service,
      ${params.baseFare},
      ${params.perKmRate},
      ${params.minDistanceKm},
      ${params.maxDistanceKm},
      ${params.waitingChargePerMin},
      ${sm},
      ${params.priority},
      ${params.isActive},
      ${params.override}
    )
    ON CONFLICT (level, ref_id, service_type) DO UPDATE SET
      base_fare = EXCLUDED.base_fare,
      per_km_rate = EXCLUDED.per_km_rate,
      min_distance_km = EXCLUDED.min_distance_km,
      max_distance_km = EXCLUDED.max_distance_km,
      waiting_charge_per_min = EXCLUDED.waiting_charge_per_min,
      surge_multiplier = EXCLUDED.surge_multiplier,
      priority = EXCLUDED.priority,
      is_active = EXCLUDED.is_active,
      override = EXCLUDED.override,
      updated_at = now()
    RETURNING
      id::text AS id,
      level::text AS level,
      ref_id::text AS ref_id,
      service_type::text AS service_type,
      base_fare::text AS base_fare,
      per_km_rate::text AS per_km_rate,
      min_distance_km::text AS min_distance_km,
      max_distance_km::text AS max_distance_km,
      waiting_charge_per_min::text AS waiting_charge_per_min,
      surge_multiplier::text AS surge_multiplier,
      priority,
      is_active,
      override,
      created_at::text AS created_at,
      updated_at::text AS updated_at
  `;
  if (!row) throw new Error("rider_rate_cards upsert returned no row");
  return row;
}

export async function resolveRiderPayoutDb(params: {
  pincode: string;
  service: "food" | "parcel" | "ride";
  distanceKm: number;
  waitingMin?: number;
}): Promise<unknown> {
  const sql = getSql();
  const [row] = await sql<[{ geo_resolve_rider_payout: unknown }]>`
    SELECT geo_resolve_rider_payout(
      ${params.pincode.trim()},
      ${params.service}::geo_service,
      ${params.distanceKm},
      ${params.waitingMin ?? 0}
    ) AS geo_resolve_rider_payout
  `;
  return row?.geo_resolve_rider_payout ?? null;
}

export async function geoToggleService(params: {
  level: Exclude<GeoHierarchyLevel, "root">;
  id: string;
  service: "food" | "parcel" | "ride";
  value: boolean;
}): Promise<void> {
  const sql = getSql();
  await sql`
    SELECT geo_toggle_service(
      ${params.level},
      ${params.id}::uuid,
      ${params.service},
      ${params.value}
    )
  `;
}

export async function geoUpsertLocation(params: {
  state: string;
  region: string;
  district: string;
  division: string;
  postOffice: string;
  pincode: string;
  branchType?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isFood?: boolean;
  isParcel?: boolean;
  isRide?: boolean;
}): Promise<unknown> {
  const sql = getSql();
  const [row] = await sql<[{ geo_upsert_location: unknown }]>`
    SELECT geo_upsert_location(
      ${params.state},
      ${params.region},
      ${params.district},
      ${params.division},
      ${params.postOffice},
      ${params.pincode},
      ${params.branchType ?? null},
      ${params.latitude ?? null},
      ${params.longitude ?? null},
      ${params.isFood ?? true},
      ${params.isParcel ?? true},
      ${params.isRide ?? true}
    ) AS geo_upsert_location
  `;
  return row?.geo_upsert_location;
}

export async function geoResolvePincode(params: {
  pincode: string;
  service: "food" | "parcel" | "ride";
  userLat?: number | null;
  userLng?: number | null;
}): Promise<unknown> {
  const sql = getSql();
  const [row] = await sql<[{ geo_resolve_pincode: unknown }]>`
    SELECT geo_resolve_pincode(
      ${params.pincode.trim()},
      ${params.service},
      ${params.userLat ?? null},
      ${params.userLng ?? null}
    ) AS geo_resolve_pincode
  `;
  return row?.geo_resolve_pincode;
}

export async function listGeoPricingRules(level: string, refId: string): Promise<GeoPricingRuleRow[]> {
  const sql = getSql();
  return sql<GeoPricingRuleRow[]>`
    SELECT id, level::text AS level, ref_id, service::text AS service, rule_type,
           value_numeric::text AS value_numeric, value_json, priority, is_active,
           created_at::text AS created_at, updated_at::text AS updated_at
    FROM geo_service_pricing_rules
    WHERE level = ${level}::geo_pricing_level
      AND ref_id = ${refId}::uuid
    ORDER BY priority DESC, created_at DESC
  `;
}

export async function insertGeoPricingRule(row: {
  level: string;
  refId: string;
  service: string;
  ruleType: string;
  valueNumeric?: number | null;
  valueJson?: unknown;
  priority?: number;
  isActive?: boolean;
}): Promise<GeoPricingRuleRow> {
  const sql = getSql();
  const [created] = await sql<GeoPricingRuleRow[]>`
    INSERT INTO geo_service_pricing_rules (
      level, ref_id, service, rule_type, value_numeric, value_json, priority, is_active
    ) VALUES (
      ${row.level}::geo_pricing_level,
      ${row.refId}::uuid,
      ${row.service}::geo_service,
      ${row.ruleType},
      ${row.valueNumeric ?? null},
      ${row.valueJson != null ? JSON.stringify(row.valueJson) : null}::jsonb,
      ${row.priority ?? 0},
      ${row.isActive ?? true}
    )
    RETURNING id, level::text AS level, ref_id, service::text AS service, rule_type,
      value_numeric::text AS value_numeric, value_json, priority, is_active,
      created_at::text AS created_at, updated_at::text AS updated_at
  `;
  if (!created) throw new Error("insert failed");
  return created;
}

export async function updateGeoPricingRule(
  id: string,
  row: {
    ruleType: string;
    valueNumeric: number | null;
    valueJson: unknown;
    priority: number;
    isActive: boolean;
  }
): Promise<GeoPricingRuleRow | null> {
  const sql = getSql();
  const j = row.valueJson != null ? JSON.stringify(row.valueJson) : null;
  const [updated] = await sql<GeoPricingRuleRow[]>`
    UPDATE geo_service_pricing_rules SET
      rule_type = ${row.ruleType},
      value_numeric = ${row.valueNumeric},
      value_json = ${j}::jsonb,
      priority = ${row.priority},
      is_active = ${row.isActive},
      updated_at = now()
    WHERE id = ${id}::uuid
    RETURNING id, level::text AS level, ref_id, service::text AS service, rule_type,
      value_numeric::text AS value_numeric, value_json, priority, is_active,
      created_at::text AS created_at, updated_at::text AS updated_at
  `;
  return updated ?? null;
}

export async function deleteGeoPricingRule(id: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    DELETE FROM geo_service_pricing_rules WHERE id = ${id}::uuid RETURNING id
  `;
  return rows.length > 0;
}

export async function geoSoftDelete(level: Exclude<GeoHierarchyLevel, "root">, id: string): Promise<void> {
  const sql = getSql();
  if (level === "state") await sql`UPDATE states SET is_active = false WHERE id = ${id}::uuid`;
  else if (level === "region") await sql`UPDATE regions SET is_active = false WHERE id = ${id}::uuid`;
  else if (level === "district") await sql`UPDATE districts SET is_active = false WHERE id = ${id}::uuid`;
  else if (level === "division") await sql`UPDATE divisions SET is_active = false WHERE id = ${id}::uuid`;
  else if (level === "post_office") await sql`UPDATE post_offices SET is_active = false WHERE id = ${id}::uuid`;
  else await sql`UPDATE pincodes SET is_active = false WHERE id = ${id}::uuid`;
}

export async function geoUpdateLocation(
  level: Exclude<GeoHierarchyLevel, "root">,
  id: string,
  patch: { name?: string; latitude?: number | null; longitude?: number | null; branchType?: string | null }
): Promise<void> {
  const sql = getSql();
  if (level === "state") {
    if (patch.name != null) await sql`UPDATE states SET name = ${patch.name} WHERE id = ${id}::uuid`;
    return;
  }
  if (level === "region") {
    if (patch.name != null) await sql`UPDATE regions SET name = ${patch.name} WHERE id = ${id}::uuid`;
    return;
  }
  if (level === "district") {
    if (patch.name != null) await sql`UPDATE districts SET name = ${patch.name} WHERE id = ${id}::uuid`;
    return;
  }
  if (level === "division") {
    if (patch.name != null) await sql`UPDATE divisions SET name = ${patch.name} WHERE id = ${id}::uuid`;
    return;
  }
  if (level === "post_office") {
    if (patch.name != null) await sql`UPDATE post_offices SET name = ${patch.name} WHERE id = ${id}::uuid`;
    if (patch.branchType !== undefined)
      await sql`UPDATE post_offices SET branch_type = ${patch.branchType} WHERE id = ${id}::uuid`;
    if (patch.latitude !== undefined)
      await sql`UPDATE post_offices SET latitude = ${patch.latitude} WHERE id = ${id}::uuid`;
    if (patch.longitude !== undefined)
      await sql`UPDATE post_offices SET longitude = ${patch.longitude} WHERE id = ${id}::uuid`;
    return;
  }
  if (level === "pincode") {
    if (patch.name != null) await sql`UPDATE pincodes SET pincode = ${patch.name} WHERE id = ${id}::uuid`;
  }
}
