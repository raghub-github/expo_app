import { getSql } from "../client";

export type GeoHierarchyLevel = "state" | "region" | "district" | "division" | "post_office" | "pincode";
/** DB service_type is order_type: food | parcel | person_ride. UI uses food | parcel | ride. */
export type PrePickupServiceType = "food" | "parcel" | "person_ride";
export type PrePickupFunding = "company" | "customer" | "shared";

export type GeoPrePickupRow = {
  id: number;
  serviceType: PrePickupServiceType;
  geoLevel: GeoHierarchyLevel;
  geoRefId: string;
  ratePerKm: number;
  funding: PrePickupFunding;
  customerSharePct: number;
  minAmount: number | null;
  maxAmount: number | null;
  priority: number;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
};

function normFunding(raw: unknown): PrePickupFunding {
  const s = String(raw ?? "company").toLowerCase();
  return s === "customer" || s === "shared" ? (s as PrePickupFunding) : "company";
}

function mapRow(r: Record<string, unknown>): GeoPrePickupRow {
  return {
    id: Number(r.id),
    serviceType: String(r.service_type) as PrePickupServiceType,
    geoLevel: String(r.geo_level) as GeoHierarchyLevel,
    geoRefId: String(r.geo_ref_id),
    ratePerKm: Number(r.rate_per_km),
    funding: normFunding(r.funding),
    customerSharePct: Number(r.customer_share_pct ?? 0),
    minAmount: r.min_amount == null ? null : Number(r.min_amount),
    maxAmount: r.max_amount == null ? null : Number(r.max_amount),
    priority: Number(r.priority ?? 100),
    isActive: r.is_active === true,
    effectiveFrom: r.effective_from == null ? null : String(r.effective_from),
    effectiveTo: r.effective_to == null ? null : String(r.effective_to),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

/** The override defined directly at this exact node (no inheritance), or null. */
export async function getGeoPrePickupOverride(args: {
  level: GeoHierarchyLevel;
  refId: string;
  service: PrePickupServiceType;
}): Promise<GeoPrePickupRow | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM geo_pre_pickup_compensation
    WHERE geo_level = ${args.level}::geo_pricing_level AND geo_ref_id = ${args.refId}::uuid
      AND service_type = ${args.service}::order_type
    LIMIT 1
  `;
  const row = (Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export async function getGeoPrePickupById(id: number): Promise<GeoPrePickupRow | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM geo_pre_pickup_compensation WHERE id = ${id} LIMIT 1`;
  const row = (Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

/** Nearest-ancestor effective override (active + in-window), matching runtime resolution. */
export async function getEffectiveGeoPrePickup(args: {
  level: GeoHierarchyLevel;
  refId: string;
  service: PrePickupServiceType;
}): Promise<{ applied: { level: string; refId: string } | null; row: GeoPrePickupRow | null }> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM geo_pre_pickup_comp_effective(
      ${args.level}::geo_pricing_level, ${args.refId}::uuid, ${args.service}::order_type
    ) LIMIT 1
  `;
  const row = (Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | undefined;
  if (!row) return { applied: null, row: null };
  const mapped = mapRow(row);
  return { applied: { level: mapped.geoLevel, refId: mapped.geoRefId }, row: mapped };
}

export type GeoPrePickupInput = {
  level: GeoHierarchyLevel;
  refId: string;
  service: PrePickupServiceType;
  ratePerKm: number;
  funding: PrePickupFunding;
  customerSharePct: number;
  minAmount: number | null;
  maxAmount: number | null;
  priority: number;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

/** Upsert the single override for (node, service) — one row per the table's unique key. */
export async function upsertGeoPrePickupOverride(args: GeoPrePickupInput): Promise<GeoPrePickupRow> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO geo_pre_pickup_compensation (
      service_type, geo_level, geo_ref_id, rate_per_km, funding, customer_share_pct,
      min_amount, max_amount, priority, is_active, effective_from, effective_to
    ) VALUES (
      ${args.service}::order_type, ${args.level}::geo_pricing_level, ${args.refId}::uuid,
      ${args.ratePerKm}, ${args.funding}, ${args.customerSharePct},
      ${args.minAmount}, ${args.maxAmount}, ${args.priority}, ${args.isActive},
      ${args.effectiveFrom}, ${args.effectiveTo}
    )
    ON CONFLICT (geo_level, geo_ref_id, service_type) DO UPDATE SET
      rate_per_km = EXCLUDED.rate_per_km,
      funding = EXCLUDED.funding,
      customer_share_pct = EXCLUDED.customer_share_pct,
      min_amount = EXCLUDED.min_amount,
      max_amount = EXCLUDED.max_amount,
      priority = EXCLUDED.priority,
      is_active = EXCLUDED.is_active,
      effective_from = EXCLUDED.effective_from,
      effective_to = EXCLUDED.effective_to,
      updated_at = now()
    RETURNING *
  `;
  return mapRow((Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown>);
}

/** Remove the override at this node → the location falls back to an ancestor or the global default. */
export async function deleteGeoPrePickupOverride(args: {
  level: GeoHierarchyLevel;
  refId: string;
  service: PrePickupServiceType;
}): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    DELETE FROM geo_pre_pickup_compensation
    WHERE geo_level = ${args.level}::geo_pricing_level AND geo_ref_id = ${args.refId}::uuid
      AND service_type = ${args.service}::order_type
    RETURNING id
  `;
  return (Array.isArray(rows) ? rows : []).length > 0;
}
