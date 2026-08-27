/**
 * Ride fare COMPONENT catalog.
 *
 * The billing pipeline (`executeBillingPipeline.ts`) is generic — it doesn't
 * know that a `type=OTHER, charge_subtype='RIDE_NIGHT'` row means "night
 * surcharge on a ride". This module is the SINGLE registry that maps between:
 *
 *   1. The `billing_pricing_rules.charge_subtype` slug written to the DB /
 *      seeded in `0464_ride_fare_components_seed.sql`
 *   2. The typed component field on `RideBillComponents` used by the
 *      settlement engine + snapshots
 *   3. The customer-facing label & UI kind (charge / discount)
 *
 * Every consumer (settlement mapper, quote breakdown, admin UI, reports) must
 * import from here so that adding / renaming a component is a one-line change.
 */

export const RIDE_FARE_CHARGE_SUBTYPES = {
  WAITING: "RIDE_WAITING",
  NIGHT: "RIDE_NIGHT",
  PEAK: "RIDE_PEAK",
  FESTIVAL: "RIDE_FESTIVAL",
  AIRPORT: "RIDE_AIRPORT",
  TOLL: "RIDE_TOLL",
  EXTRA_STOPS: "RIDE_EXTRA_STOPS",
} as const;

export const RIDE_FARE_DISCOUNT_SUBTYPES = {
  BIKE_LITE: "RIDE_BIKE_LITE_DISCOUNT",
  EV_AUTO: "RIDE_EV_AUTO_DISCOUNT",
} as const;

export type RideFareChargeSubtype =
  (typeof RIDE_FARE_CHARGE_SUBTYPES)[keyof typeof RIDE_FARE_CHARGE_SUBTYPES];

export type RideFareDiscountSubtype =
  (typeof RIDE_FARE_DISCOUNT_SUBTYPES)[keyof typeof RIDE_FARE_DISCOUNT_SUBTYPES];

/** Canonical component key on `RideBillComponents` for each charge subtype. */
export const CHARGE_SUBTYPE_TO_COMPONENT_KEY: Record<
  RideFareChargeSubtype,
  keyof RideChargeComponentBag
> = {
  [RIDE_FARE_CHARGE_SUBTYPES.WAITING]: "waitingCharge",
  [RIDE_FARE_CHARGE_SUBTYPES.NIGHT]: "nightCharge",
  [RIDE_FARE_CHARGE_SUBTYPES.PEAK]: "peakHourCharge",
  [RIDE_FARE_CHARGE_SUBTYPES.FESTIVAL]: "festivalCharge",
  [RIDE_FARE_CHARGE_SUBTYPES.AIRPORT]: "airportCharge",
  [RIDE_FARE_CHARGE_SUBTYPES.TOLL]: "tollCharge",
  [RIDE_FARE_CHARGE_SUBTYPES.EXTRA_STOPS]: "extraStopsCharge",
};

/**
 * Bag of Phase 2 charge components with numeric ₹ amounts. Kept as a plain
 * object so callers can spread it into `RideBillComponents` without importing
 * the settlement math types.
 */
export type RideChargeComponentBag = {
  waitingCharge: number;
  nightCharge: number;
  peakHourCharge: number;
  festivalCharge: number;
  airportCharge: number;
  tollCharge: number;
  extraStopsCharge: number;
};

export function emptyRideChargeComponentBag(): RideChargeComponentBag {
  return {
    waitingCharge: 0,
    nightCharge: 0,
    peakHourCharge: 0,
    festivalCharge: 0,
    airportCharge: 0,
    tollCharge: 0,
    extraStopsCharge: 0,
  };
}

export type RideComponentBreakdownLine = {
  subtype: RideFareChargeSubtype | RideFareDiscountSubtype;
  label: string;
  amount: number;
  kind: "charge" | "discount";
};

type AppliedLineLike = {
  label?: string;
  amount?: number | string | null;
  meta?: Record<string, unknown> | null;
};

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(num(n) * 100) / 100;
}

function readSubtype(line: AppliedLineLike): string | null {
  const meta = line.meta ?? {};
  const s = (meta as { chargeSubtype?: unknown }).chargeSubtype;
  return typeof s === "string" && s.length > 0 ? s : null;
}

/**
 * Sum charge lines produced by the billing pipeline into the Phase 2
 * component bag. Multiple rules with the same subtype (e.g. weekend night +
 * festival stacked as separate rows) accumulate into the same bucket.
 */
export function extractRideChargeComponents(
  charges: AppliedLineLike[]
): RideChargeComponentBag {
  const bag = emptyRideChargeComponentBag();
  for (const line of charges) {
    const subtype = readSubtype(line);
    if (!subtype) continue;
    const key = CHARGE_SUBTYPE_TO_COMPONENT_KEY[subtype as RideFareChargeSubtype];
    if (!key) continue;
    bag[key] = round2(bag[key] + num(line.amount));
  }
  return bag;
}

/**
 * Return the total discount attributable to a specific ride-side discount
 * subtype (e.g. Bike Lite). Returns 0 if no such discount was applied.
 */
export function extractRideDiscountAmount(
  discounts: AppliedLineLike[],
  subtype: RideFareDiscountSubtype
): number {
  let total = 0;
  for (const line of discounts) {
    if (readSubtype(line) === subtype) total += num(line.amount);
  }
  return round2(total);
}

/**
 * Human-friendly labels used when the admin has not customised a rule name.
 */
export const RIDE_COMPONENT_DEFAULT_LABEL: Record<
  RideFareChargeSubtype | RideFareDiscountSubtype,
  string
> = {
  [RIDE_FARE_CHARGE_SUBTYPES.WAITING]: "Waiting charge",
  [RIDE_FARE_CHARGE_SUBTYPES.NIGHT]: "Night surcharge",
  [RIDE_FARE_CHARGE_SUBTYPES.PEAK]: "Peak hour surcharge",
  [RIDE_FARE_CHARGE_SUBTYPES.FESTIVAL]: "Festival surcharge",
  [RIDE_FARE_CHARGE_SUBTYPES.AIRPORT]: "Airport pickup / drop",
  [RIDE_FARE_CHARGE_SUBTYPES.TOLL]: "Toll charges",
  [RIDE_FARE_CHARGE_SUBTYPES.EXTRA_STOPS]: "Extra stops",
  [RIDE_FARE_DISCOUNT_SUBTYPES.BIKE_LITE]: "Bike Lite discount",
  [RIDE_FARE_DISCOUNT_SUBTYPES.EV_AUTO]: "EV Auto discount",
};

/**
 * Build the customer-facing component breakdown that the ride quote /
 * confirmation screens render. Filters out zero amounts.
 */
export function buildRideComponentBreakdown(
  charges: AppliedLineLike[],
  discounts: AppliedLineLike[]
): RideComponentBreakdownLine[] {
  const lines: RideComponentBreakdownLine[] = [];
  for (const line of charges) {
    const subtype = readSubtype(line) as RideFareChargeSubtype | null;
    if (!subtype || !(subtype in CHARGE_SUBTYPE_TO_COMPONENT_KEY)) continue;
    const amount = round2(num(line.amount));
    if (amount <= 0) continue;
    lines.push({
      subtype,
      label: line.label || RIDE_COMPONENT_DEFAULT_LABEL[subtype] || subtype,
      amount,
      kind: "charge",
    });
  }
  for (const line of discounts) {
    const subtype = readSubtype(line) as RideFareDiscountSubtype | null;
    if (
      !subtype ||
      !(Object.values(RIDE_FARE_DISCOUNT_SUBTYPES) as string[]).includes(subtype)
    ) {
      continue;
    }
    const amount = round2(num(line.amount));
    if (amount <= 0) continue;
    lines.push({
      subtype,
      label: line.label || RIDE_COMPONENT_DEFAULT_LABEL[subtype] || subtype,
      amount,
      kind: "discount",
    });
  }
  return lines;
}
