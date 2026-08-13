import { getSql } from "../client";

export type GeoHierarchyLevel = "state" | "region" | "district" | "division" | "post_office" | "pincode";
/** DB service_type: food | parcel | person_ride | all. UI uses ride ↔ person_ride. */
export type DynServiceDb = "food" | "parcel" | "person_ride" | "all";
export type DynMode =
  | "NIGHT" | "RAIN" | "PEAK" | "FESTIVAL" | "HOLIDAY" | "HIGH_DEMAND" | "LOW_SUPPLY" | "MANUAL";
export type DynValueType = "FIXED" | "PER_KM" | "PERCENTAGE" | "MULTIPLIER";
export type DynFunding = "customer" | "company" | "shared";
export type DynVehicleType = "2_wheeler" | "3_wheeler" | "4_wheeler_non_ac" | "4_wheeler_ac";

export type DynamicPricingRuleRow = {
  id: number;
  mode: DynMode;
  serviceType: DynServiceDb;
  /** NULL = applies to all vehicles; overrides the all-vehicles row for this mode when set. */
  vehicleType: DynVehicleType | null;
  geoLevel: GeoHierarchyLevel;
  geoRefId: string;
  name: string | null;
  valueType: DynValueType;
  value: number;
  maxAmount: number | null;
  funding: DynFunding;
  customerSharePct: number;
  taxable: boolean;
  gstRate: number;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  daysOfWeek: number[] | null;
  activeFrom: string | null;
  activeTo: string | null;
  manualActive: boolean;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

function mapRow(r: Record<string, unknown>): DynamicPricingRuleRow {
  return {
    id: Number(r.id),
    mode: String(r.mode) as DynMode,
    serviceType: String(r.service_type) as DynServiceDb,
    vehicleType: r.vehicle_type == null ? null : (String(r.vehicle_type) as DynVehicleType),
    geoLevel: String(r.geo_level) as GeoHierarchyLevel,
    geoRefId: String(r.geo_ref_id),
    name: r.name == null ? null : String(r.name),
    valueType: String(r.value_type) as DynValueType,
    value: Number(r.value),
    maxAmount: r.max_amount == null ? null : Number(r.max_amount),
    funding: String(r.funding) as DynFunding,
    customerSharePct: Number(r.customer_share_pct ?? 100),
    taxable: r.taxable === true,
    gstRate: Number(r.gst_rate ?? 0),
    allDay: r.all_day === true,
    startTime: r.start_time == null ? null : String(r.start_time),
    endTime: r.end_time == null ? null : String(r.end_time),
    daysOfWeek: Array.isArray(r.days_of_week) ? (r.days_of_week as unknown[]).map(Number) : null,
    activeFrom: r.active_from == null ? null : String(r.active_from),
    activeTo: r.active_to == null ? null : String(r.active_to),
    manualActive: r.manual_active === true,
    priority: Number(r.priority ?? 100),
    isActive: r.is_active === true,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

/** Rules defined directly at this node (no inheritance) — the admin editor list. */
export async function listDynamicPricingRules(args: {
  level: GeoHierarchyLevel;
  refId: string;
  service: DynServiceDb;
}): Promise<DynamicPricingRuleRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM dynamic_pricing_rules
    WHERE geo_level = ${args.level}::geo_pricing_level AND geo_ref_id = ${args.refId}::uuid
      AND (service_type = ${args.service} OR ${args.service} = 'all')
    ORDER BY mode ASC, id ASC
  `;
  return (Array.isArray(rows) ? rows : []).map((r) => mapRow(r as Record<string, unknown>));
}

export async function getDynamicPricingRuleById(id: number): Promise<DynamicPricingRuleRow | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM dynamic_pricing_rules WHERE id = ${id} LIMIT 1`;
  const row = (Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export type DynamicPricingInput = {
  level: GeoHierarchyLevel;
  refId: string;
  service: DynServiceDb;
  mode: DynMode;
  /** NULL = applies to all vehicles (food always NULL). */
  vehicleType: DynVehicleType | null;
  name: string | null;
  valueType: DynValueType;
  value: number;
  maxAmount: number | null;
  funding: DynFunding;
  customerSharePct: number;
  taxable: boolean;
  gstRate: number;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  daysOfWeek: number[] | null;
  activeFrom: string | null;
  activeTo: string | null;
  manualActive: boolean;
  priority: number;
  isActive: boolean;
};

/**
 * Upsert the rule for (node, service, mode, vehicle) — one row per the unique key.
 *
 * Two PARTIAL unique indexes back this (see migration 0527): one for the "all vehicles"
 * case (vehicle_type IS NULL), one for vehicle-specific overrides (vehicle_type IS NOT
 * NULL) — NOT a single COALESCE expression index, because casting the vehicle_type ENUM to
 * text for that expression would go through enum_out(), which Postgres marks STABLE (not
 * IMMUTABLE), and index expressions require IMMUTABLE-only functions (error 42P17). Each
 * partial index needs its own matching ON CONFLICT (columns) WHERE predicate, so this
 * branches on whether a vehicle was selected rather than using one conflict target for both.
 */
export async function upsertDynamicPricingRule(a: DynamicPricingInput): Promise<DynamicPricingRuleRow> {
  const sql = getSql();
  const dow = a.daysOfWeek && a.daysOfWeek.length > 0 ? a.daysOfWeek : null;

  if (a.vehicleType == null) {
    const rows = await sql`
      INSERT INTO dynamic_pricing_rules (
        mode, service_type, vehicle_type, geo_level, geo_ref_id, name, value_type, value, max_amount,
        funding, customer_share_pct, taxable, gst_rate, all_day, start_time, end_time,
        days_of_week, active_from, active_to, manual_active, priority, is_active
      ) VALUES (
        ${a.mode}, ${a.service}, ${a.vehicleType}::ride_vehicle_pricing_type,
        ${a.level}::geo_pricing_level, ${a.refId}::uuid, ${a.name},
        ${a.valueType}, ${a.value}, ${a.maxAmount}, ${a.funding}, ${a.customerSharePct},
        ${a.taxable}, ${a.gstRate}, ${a.allDay}, ${a.startTime}, ${a.endTime},
        ${dow as unknown as number[]}, ${a.activeFrom}, ${a.activeTo}, ${a.manualActive},
        ${a.priority}, ${a.isActive}
      )
      ON CONFLICT (geo_level, geo_ref_id, service_type, mode) WHERE vehicle_type IS NULL
      DO UPDATE SET
        name = EXCLUDED.name, value_type = EXCLUDED.value_type, value = EXCLUDED.value,
        max_amount = EXCLUDED.max_amount, funding = EXCLUDED.funding,
        customer_share_pct = EXCLUDED.customer_share_pct, taxable = EXCLUDED.taxable,
        gst_rate = EXCLUDED.gst_rate, all_day = EXCLUDED.all_day, start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time, days_of_week = EXCLUDED.days_of_week,
        active_from = EXCLUDED.active_from, active_to = EXCLUDED.active_to,
        manual_active = EXCLUDED.manual_active, priority = EXCLUDED.priority,
        is_active = EXCLUDED.is_active, updated_at = now()
      RETURNING *
    `;
    return mapRow((Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown>);
  }

  const rows = await sql`
    INSERT INTO dynamic_pricing_rules (
      mode, service_type, vehicle_type, geo_level, geo_ref_id, name, value_type, value, max_amount,
      funding, customer_share_pct, taxable, gst_rate, all_day, start_time, end_time,
      days_of_week, active_from, active_to, manual_active, priority, is_active
    ) VALUES (
      ${a.mode}, ${a.service}, ${a.vehicleType}::ride_vehicle_pricing_type,
      ${a.level}::geo_pricing_level, ${a.refId}::uuid, ${a.name},
      ${a.valueType}, ${a.value}, ${a.maxAmount}, ${a.funding}, ${a.customerSharePct},
      ${a.taxable}, ${a.gstRate}, ${a.allDay}, ${a.startTime}, ${a.endTime},
      ${dow as unknown as number[]}, ${a.activeFrom}, ${a.activeTo}, ${a.manualActive},
      ${a.priority}, ${a.isActive}
    )
    ON CONFLICT (geo_level, geo_ref_id, service_type, mode, vehicle_type) WHERE vehicle_type IS NOT NULL
    DO UPDATE SET
      name = EXCLUDED.name, value_type = EXCLUDED.value_type, value = EXCLUDED.value,
      max_amount = EXCLUDED.max_amount, funding = EXCLUDED.funding,
      customer_share_pct = EXCLUDED.customer_share_pct, taxable = EXCLUDED.taxable,
      gst_rate = EXCLUDED.gst_rate, all_day = EXCLUDED.all_day, start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time, days_of_week = EXCLUDED.days_of_week,
      active_from = EXCLUDED.active_from, active_to = EXCLUDED.active_to,
      manual_active = EXCLUDED.manual_active, priority = EXCLUDED.priority,
      is_active = EXCLUDED.is_active, updated_at = now()
    RETURNING *
  `;
  return mapRow((Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown>);
}

export async function updateDynamicPricingRule(
  id: number,
  patch: Omit<DynamicPricingInput, "level" | "refId" | "service" | "mode">
): Promise<DynamicPricingRuleRow | null> {
  const sql = getSql();
  const dow = patch.daysOfWeek && patch.daysOfWeek.length > 0 ? patch.daysOfWeek : null;
  const rows = await sql`
    UPDATE dynamic_pricing_rules SET
      vehicle_type = ${patch.vehicleType}::ride_vehicle_pricing_type,
      name = ${patch.name}, value_type = ${patch.valueType}, value = ${patch.value},
      max_amount = ${patch.maxAmount}, funding = ${patch.funding},
      customer_share_pct = ${patch.customerSharePct}, taxable = ${patch.taxable},
      gst_rate = ${patch.gstRate}, all_day = ${patch.allDay}, start_time = ${patch.startTime},
      end_time = ${patch.endTime}, days_of_week = ${dow as unknown as number[]},
      active_from = ${patch.activeFrom}, active_to = ${patch.activeTo},
      manual_active = ${patch.manualActive}, priority = ${patch.priority},
      is_active = ${patch.isActive}, updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  const row = (Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export async function deleteDynamicPricingRule(id: number): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`DELETE FROM dynamic_pricing_rules WHERE id = ${id} RETURNING id`;
  return (Array.isArray(rows) ? rows : []).length > 0;
}
