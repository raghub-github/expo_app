/**
 * Dynamic pricing engine (Night / Rain / Peak / Festival / Holiday / High-demand / Manual).
 *
 * Pure, testable math + a thin DB resolver. Rules come from `dynamic_pricing_rules`
 * (geo closest-ancestor-wins per mode). The CUSTOMER-borne portion is added to the bill;
 * the COMPANY-borne portion is returned for rider incentive / settlement. All money logic
 * lives in the backend — the single source of truth.
 */

import { getSql } from "../db/client.js";
import { resolveDropGeoRefsFromPincode } from "../modules/billing/geoRefFromPincode.js";
import type { BillingResult, DropGeoRefByLevel } from "../modules/billing/types.js";
import type { RideVehiclePricingType } from "../modules/rider-payout-pricing/types.js";

export type DynamicPricingMode =
  | "NIGHT" | "RAIN" | "PEAK" | "FESTIVAL" | "HOLIDAY" | "HIGH_DEMAND" | "LOW_SUPPLY" | "MANUAL";
export type DynamicValueType = "FIXED" | "PER_KM" | "PERCENTAGE" | "MULTIPLIER";
export type DynamicFunding = "customer" | "company" | "shared";
export type DynamicPricingServiceType = "food" | "parcel" | "person_ride" | "all";

export type DynamicPricingRule = {
  id: number;
  mode: DynamicPricingMode;
  serviceType: DynamicPricingServiceType;
  /** NULL = applies to all vehicles; overrides the all-vehicles row for this mode when set. */
  vehicleType: RideVehiclePricingType | null;
  geoLevel: string;
  geoRefId: string;
  name: string | null;
  valueType: DynamicValueType;
  value: number;
  maxAmount: number | null;
  funding: DynamicFunding;
  customerSharePct: number;
  taxable: boolean;
  gstRate: number;
  allDay: boolean;
  startTime: string | null; // "HH:MM" or "HH:MM:SS"
  endTime: string | null;
  daysOfWeek: number[] | null; // 0=Sun .. 6=Sat
  activeFrom: string | null;
  activeTo: string | null;
  manualActive: boolean;
  priority: number;
  isActive: boolean;
};

export type ResolvedDynamicSurcharge = {
  ruleId: number;
  mode: DynamicPricingMode;
  name: string;
  valueType: DynamicValueType;
  funding: DynamicFunding;
  /** Total surcharge before funding split (₹). */
  total: number;
  /** Customer-borne (added to the bill). */
  customerAmount: number;
  /** Company-borne (absorbed / rider incentive; NOT on the customer bill). */
  companyAmount: number;
  taxable: boolean;
  gstRate: number;
  /** GST on the customer-borne portion (₹). */
  customerGst: number;
};

const IST_OFFSET_MIN = 330; // Asia/Kolkata, no DST

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Minutes-since-midnight + ISO day-of-week (0=Sun) for `now` in IST.
 * getTime() is already the UTC epoch, so we only add the fixed IST offset (no DST). */
export function istClock(now: Date): { minutes: number; dow: number } {
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  return { minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes(), dow: ist.getUTCDay() };
}

function parseTimeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

/**
 * Is the rule active at `now` (IST)? Considers manual override, day-of-week, and the
 * time-of-day window (cross-midnight aware). The DB already filters is_active + date range,
 * but this re-checks so the pure function is correct standalone.
 */
export function isDynamicRuleActiveNow(rule: DynamicPricingRule, now: Date): boolean {
  if (!rule.isActive) return false;
  if (rule.activeFrom && now < new Date(rule.activeFrom)) return false;
  if (rule.activeTo && now >= new Date(rule.activeTo)) return false;
  // Manual override forces the rule on (within its active window) regardless of time/day.
  if (rule.manualActive || rule.mode === "MANUAL") return true;

  const { minutes, dow } = istClock(now);

  if (rule.daysOfWeek && rule.daysOfWeek.length > 0 && !rule.daysOfWeek.includes(dow)) {
    return false;
  }

  if (rule.allDay) return true;
  const start = parseTimeToMinutes(rule.startTime);
  const end = parseTimeToMinutes(rule.endTime);
  if (start == null || end == null) return true; // no time bounds -> all-day
  if (start === end) return true; // full-day window
  if (start < end) return minutes >= start && minutes < end; // same-day window
  // cross-midnight window (e.g. 22:00 -> 06:00)
  return minutes >= start || minutes < end;
}

/**
 * Total surcharge (₹) before funding split, capped by max_amount.
 * base = the fare/subtotal the % / multiplier applies to.
 */
export function computeDynamicSurchargeTotal(
  rule: Pick<DynamicPricingRule, "valueType" | "value" | "maxAmount">,
  base: number,
  distanceKm: number
): number {
  const v = Number.isFinite(rule.value) && rule.value > 0 ? rule.value : 0;
  const safeBase = Number.isFinite(base) && base > 0 ? base : 0;
  const km = Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 0;
  let amt = 0;
  switch (rule.valueType) {
    case "FIXED": amt = v; break;
    case "PER_KM": amt = v * km; break;
    case "PERCENTAGE": amt = (safeBase * v) / 100; break;
    case "MULTIPLIER": amt = v > 1 ? safeBase * (v - 1) : 0; break;
  }
  if (rule.maxAmount != null && Number.isFinite(rule.maxAmount) && rule.maxAmount >= 0) {
    amt = Math.min(amt, rule.maxAmount);
  }
  return round2(Math.max(0, amt));
}

/** Split a total by funding into {customer, company} portions. */
export function splitDynamicByFunding(
  total: number,
  funding: DynamicFunding,
  customerSharePct: number
): { customerAmount: number; companyAmount: number } {
  const t = round2(Math.max(0, total));
  if (funding === "customer") return { customerAmount: t, companyAmount: 0 };
  if (funding === "company") return { customerAmount: 0, companyAmount: t };
  // shared
  const pct = Math.min(100, Math.max(0, Number(customerSharePct) || 0));
  const customerAmount = round2((t * pct) / 100);
  return { customerAmount, companyAmount: round2(t - customerAmount) };
}

/** Build a resolved surcharge (amounts + GST) for one rule at the given base/distance. */
export function resolveOneDynamicSurcharge(
  rule: DynamicPricingRule,
  base: number,
  distanceKm: number
): ResolvedDynamicSurcharge {
  const total = computeDynamicSurchargeTotal(rule, base, distanceKm);
  const { customerAmount, companyAmount } = splitDynamicByFunding(
    total,
    rule.funding,
    rule.customerSharePct
  );
  const customerGst =
    rule.taxable && rule.gstRate > 0 ? round2(customerAmount * rule.gstRate) : 0;
  return {
    ruleId: rule.id,
    mode: rule.mode,
    name: rule.name?.trim() || rule.mode,
    valueType: rule.valueType,
    funding: rule.funding,
    total,
    customerAmount,
    companyAmount,
    taxable: rule.taxable,
    gstRate: rule.gstRate,
    customerGst,
  };
}

/** Prefer a service-specific rule over an 'all' rule for the same mode. */
export function preferServiceSpecificDynamicRules(
  rules: DynamicPricingRule[],
  service: DynamicPricingServiceType
): DynamicPricingRule[] {
  const specificModes = new Set(
    rules.filter((r) => r.serviceType === service).map((r) => r.mode)
  );
  return rules.filter((r) => !(r.serviceType === "all" && specificModes.has(r.mode)));
}

/**
 * Prefer a vehicle-specific rule over an all-vehicles (vehicleType=null) rule for the same
 * mode — same pattern as preferServiceSpecificDynamicRules, one dimension over. Only takes
 * effect when the caller supplied a vehicle (ride/parcel); food has no vehicle dimension.
 */
export function preferVehicleSpecificDynamicRules(
  rules: DynamicPricingRule[],
  vehicleType: RideVehiclePricingType | null | undefined
): DynamicPricingRule[] {
  if (!vehicleType) return rules.filter((r) => r.vehicleType == null);
  const specificModes = new Set(
    rules.filter((r) => r.vehicleType === vehicleType).map((r) => r.mode)
  );
  return rules.filter((r) => !(r.vehicleType == null && specificModes.has(r.mode)));
}

export type DynamicSurchargeApplication = {
  surcharges: ResolvedDynamicSurcharge[];
  customerTotal: number;
  customerGstTotal: number;
  companyTotal: number;
};

/** Aggregate resolved surcharges into customer/company/GST totals. */
export function aggregateDynamicSurcharges(
  resolved: ResolvedDynamicSurcharge[]
): DynamicSurchargeApplication {
  let customerTotal = 0;
  let customerGstTotal = 0;
  let companyTotal = 0;
  for (const s of resolved) {
    customerTotal += s.customerAmount;
    customerGstTotal += s.customerGst;
    companyTotal += s.companyAmount;
  }
  return {
    surcharges: resolved,
    customerTotal: round2(customerTotal),
    customerGstTotal: round2(customerGstTotal),
    companyTotal: round2(companyTotal),
  };
}

/**
 * Apply the CUSTOMER-borne dynamic surcharges (+ their GST) to a computed BillingResult,
 * post-pipeline. Returns the same object (mutated) plus the company-borne subsidy total for
 * the caller to persist in the billing snapshot. Never touches the core pipeline (so the
 * pipeline's 100+ tests stay valid); surcharges land in the `surge` bucket + charge lines.
 */
export function applyDynamicSurchargesToBilling(
  billing: BillingResult,
  app: DynamicSurchargeApplication
): { billing: BillingResult; companySubsidy: number } {
  if (app.surcharges.length === 0 || (app.customerTotal <= 0 && app.customerGstTotal <= 0)) {
    return { billing, companySubsidy: app.companyTotal };
  }

  const customer = app.customerTotal;
  const gst = app.customerGstTotal;

  billing.surge_fee = round2(billing.surge_fee + customer);
  if (gst > 0) {
    billing.tax_total = round2(billing.tax_total + gst);
    billing.taxes_by_group = {
      ...billing.taxes_by_group,
      surge: round2((billing.taxes_by_group?.surge ?? 0) + gst),
    };
    if (billing.gst_components?.surge) {
      const s = billing.gst_components.surge;
      s.original = round2(s.original + customer);
      s.taxable_value = round2(s.taxable_value + customer);
      s.gst = round2(s.gst + gst);
    }
  }
  billing.final_amount = round2(billing.final_amount + customer + gst);
  if (billing.gst_totals) {
    billing.gst_totals.total_tax = round2(billing.gst_totals.total_tax + gst);
    billing.gst_totals.final_payable = billing.final_amount;
  }

  for (const s of app.surcharges) {
    if (s.customerAmount <= 0) continue;
    const label = `${s.name} surcharge`;
    billing.charges.push({
      kind: "charge",
      label,
      amount: s.customerAmount,
      hidden: false,
      meta: {
        dynamicPricingRuleId: s.ruleId,
        mode: s.mode,
        funding: s.funding,
        valueType: s.valueType,
        companyContribution: s.companyAmount,
        gst: s.customerGst,
      },
    });
    billing.breakdown_steps.push({
      step: label,
      amount: s.customerAmount,
      meta: { dynamicPricingRuleId: s.ruleId, mode: s.mode },
    });
    if (s.customerGst > 0) {
      billing.taxes.push({
        kind: "tax",
        label: `GST on ${s.name}`,
        amount: s.customerGst,
        hidden: false,
        meta: { dynamicPricingRuleId: s.ruleId, taxGroup: "surge", rate: s.gstRate },
      });
    }
  }

  return { billing, companySubsidy: app.companyTotal };
}

/* -------------------------------------------------------------------------- */
/* Rider incentive from a persisted billing snapshot                          */
/* -------------------------------------------------------------------------- */

export type DynamicRiderIncentive = {
  /** Company-funded dynamic total to pay the rider (night/rain/peak/…). */
  amount: number;
  /** Per-mode company-funded lines for the rider offer display. */
  lines: { mode: string; name: string; amount: number }[];
};

/**
 * Extract the COMPANY-funded dynamic surcharge that should be paid to / shown to the rider,
 * from a persisted billing snapshot (computeBillForFood/Ride/Parcel wrote
 * `company_dynamic_subsidy` + `dynamic_surcharges`). The customer-borne portion stays on the
 * customer bill; only the company-funded portion is a rider incentive.
 */
export function readDynamicRiderIncentiveFromSnapshot(snapshot: unknown): DynamicRiderIncentive {
  const empty: DynamicRiderIncentive = { amount: 0, lines: [] };
  if (!snapshot || typeof snapshot !== "object") return empty;
  const s = snapshot as Record<string, unknown>;
  const amount = round2(Math.max(0, Number(s.company_dynamic_subsidy ?? 0)));
  const lines: { mode: string; name: string; amount: number }[] = [];
  const raw = s.dynamic_surcharges;
  if (Array.isArray(raw)) {
    for (const x of raw) {
      if (!x || typeof x !== "object") continue;
      const o = x as Record<string, unknown>;
      const companyAmount = round2(Math.max(0, Number(o.companyAmount ?? 0)));
      if (companyAmount <= 0) continue;
      lines.push({
        mode: String(o.mode ?? ""),
        name: String(o.name ?? o.mode ?? "Surcharge"),
        amount: companyAmount,
      });
    }
  }
  return { amount, lines };
}

/* -------------------------------------------------------------------------- */
/* DB resolver                                                                */
/* -------------------------------------------------------------------------- */

const LOOKUP_LEVELS: (keyof DropGeoRefByLevel)[] = [
  "pincode", "post_office", "division", "district", "region", "state",
];

function mapRow(r: Record<string, unknown>): DynamicPricingRule {
  return {
    id: Number(r.id),
    mode: String(r.mode) as DynamicPricingMode,
    serviceType: String(r.service_type) as DynamicPricingServiceType,
    vehicleType: r.vehicle_type == null ? null : (String(r.vehicle_type) as RideVehiclePricingType),
    geoLevel: String(r.geo_level),
    geoRefId: String(r.geo_ref_id),
    name: r.name == null ? null : String(r.name),
    valueType: String(r.value_type) as DynamicValueType,
    value: Number(r.value),
    maxAmount: r.max_amount == null ? null : Number(r.max_amount),
    funding: String(r.funding) as DynamicFunding,
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
  };
}

const EMPTY_APPLICATION: DynamicSurchargeApplication = {
  surcharges: [], customerTotal: 0, customerGstTotal: 0, companyTotal: 0,
};

/**
 * Resolve dynamic surcharges from already-resolved geo refs (UUIDs) — the fast path used by
 * the billing services, which have `calcGeo.refs` in hand. Queries the effective function per
 * resolved level (closest-first), dedupes to the closest row per mode, prefers service-specific
 * over 'all', filters by the time window, and computes amounts.
 */
export async function resolveActiveDynamicSurchargesFromRefs(args: {
  refs: DropGeoRefByLevel | null;
  service: "food" | "parcel" | "person_ride";
  /** Vehicle for this order (ride/parcel only). NULL/omitted -> only all-vehicle rules apply. */
  vehicleType?: RideVehiclePricingType | null;
  base: number;
  distanceKm: number;
  now?: Date;
}): Promise<DynamicSurchargeApplication> {
  const refs = args.refs;
  if (!refs) return EMPTY_APPLICATION;

  const targets: { level: keyof DropGeoRefByLevel; id: string }[] = [];
  for (const level of LOOKUP_LEVELS) {
    const id = refs[level];
    if (id && String(id).trim()) targets.push({ level, id: String(id).trim() });
  }
  if (targets.length === 0) return EMPTY_APPLICATION;

  const sql = getSql();
  const now = args.now ?? new Date();
  const vehicleType = args.vehicleType ?? null;
  let rows: DynamicPricingRule[] = [];
  try {
    const results = await Promise.all(
      targets.map(
        (t) =>
          sql<Record<string, unknown>[]>`
            SELECT * FROM dynamic_pricing_rules_effective(${t.level}::geo_pricing_level, ${t.id}::uuid, ${args.service}, ${vehicleType}::ride_vehicle_pricing_type)
          `
      )
    );
    // Closest-first dedupe per (mode, serviceType, vehicleType): the first level that returns
    // a row wins. Vehicle kept in the key so both a vehicle-specific AND an all-vehicle row
    // for the same mode can survive this pass — preferVehicleSpecificDynamicRules picks below.
    const seen = new Set<string>();
    for (const levelRows of results) {
      for (const raw of levelRows) {
        const rule = mapRow(raw);
        const key = `${rule.mode}:${rule.serviceType}:${rule.vehicleType ?? "_all"}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(rule);
      }
    }
  } catch {
    return EMPTY_APPLICATION;
  }

  rows = preferServiceSpecificDynamicRules(rows, args.service);
  rows = preferVehicleSpecificDynamicRules(rows, vehicleType);
  const active = rows.filter((r) => isDynamicRuleActiveNow(r, now));
  const resolved = active.map((r) => resolveOneDynamicSurcharge(r, args.base, args.distanceKm));
  return aggregateDynamicSurcharges(resolved.filter((s) => s.customerAmount > 0 || s.companyAmount > 0));
}

/**
 * Text-input convenience: resolve pincode/state text -> geo UUIDs (billing geo resolver),
 * then delegate to resolveActiveDynamicSurchargesFromRefs. For callers that don't already
 * hold resolved refs.
 */
export async function resolveActiveDynamicSurcharges(args: {
  pincode?: string | null;
  state?: string | null;
  service: "food" | "parcel" | "person_ride";
  vehicleType?: RideVehiclePricingType | null;
  base: number;
  distanceKm: number;
  now?: Date;
}): Promise<DynamicSurchargeApplication> {
  const pincode = args.pincode ? String(args.pincode).trim() : null;
  const state = args.state ? String(args.state).trim() : null;
  if (!pincode && !state) return EMPTY_APPLICATION;
  let refs: DropGeoRefByLevel | null = null;
  try {
    refs = await resolveDropGeoRefsFromPincode(pincode, state);
  } catch {
    return EMPTY_APPLICATION;
  }
  return resolveActiveDynamicSurchargesFromRefs({
    refs,
    service: args.service,
    vehicleType: args.vehicleType,
    base: args.base,
    distanceKm: args.distanceKm,
    now: args.now,
  });
}
