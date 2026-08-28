/**
 * Platform checkout coupon config — billing_discounts.coupon_config only.
 * Store Offer Engine is untouched.
 */

export const COUPON_USAGE_MODES = [
  "FIRST_ORDER_ONLY",
  "FIRST_N_ORDERS",
  "EVERY_ORDER",
  "MAX_N_PER_CUSTOMER",
  "ONCE_PER_DAY",
  "ONCE_PER_WEEK",
  "ONCE_PER_MONTH",
  "ONCE_PER_YEAR",
  "UNLIMITED",
  "LIFETIME_N",
  "ONE_TIME_EVER",
] as const;

export type CouponUsageMode = (typeof COUPON_USAGE_MODES)[number];

export const COUPON_SERVICES = ["FOOD", "GROCERY", "PARCEL", "RIDE"] as const;
export type CouponServiceType = (typeof COUPON_SERVICES)[number];

export type CheckoutCouponConfig = {
  usage_mode?: CouponUsageMode;
  usage_n?: number | null;
  service_types?: CouponServiceType[];
  coupon_type?: string | null;
  auto_apply?: boolean;
  manual_entry?: boolean;
  public?: boolean;
  stackable?: boolean;
  exclusive?: boolean;
  priority?: number;
  restore_on_cancel?: boolean;
  restore_on_refund?: boolean;
  consume_on?: "PLACED" | "DELIVERED";
  min_order_value?: number | null;
  max_discount?: number | null;
  max_ride_distance_km?: number | null;
  max_parcel_distance_km?: number | null;
  max_weight_kg?: number | null;
  vehicle_types?: string[];
  payment_modes?: string[];
  customer_segment?: "ALL" | "NEW" | "EXISTING" | "REFERRAL" | "SUBSCRIPTION";
  weekdays?: number[];
  time_slots?: Array<{ start: string; end: string }>;
  cities?: string[];
  states?: string[];
};

export type CouponUsageSnapshot = {
  lifetime: number;
  day: number;
  week: number;
  month: number;
  year: number;
};

export function emptyCheckoutCouponConfig(): CheckoutCouponConfig {
  return {
    usage_mode: "MAX_N_PER_CUSTOMER",
    usage_n: 1,
    service_types: ["FOOD"],
    coupon_type: "PERCENT",
    auto_apply: false,
    manual_entry: true,
    public: true,
    stackable: false,
    exclusive: true,
    priority: 100,
    restore_on_cancel: true,
    restore_on_refund: true,
    consume_on: "PLACED",
    customer_segment: "ALL",
  };
}

export function sanitizeCheckoutCouponConfig(raw: unknown): CheckoutCouponConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyCheckoutCouponConfig();
  }
  const o = raw as Record<string, unknown>;
  const usageModeRaw = String(o.usage_mode ?? "MAX_N_PER_CUSTOMER").toUpperCase();
  const usage_mode = (COUPON_USAGE_MODES as readonly string[]).includes(usageModeRaw)
    ? (usageModeRaw as CouponUsageMode)
    : "MAX_N_PER_CUSTOMER";

  let usage_n: number | null = null;
  if (o.usage_n != null && o.usage_n !== "") {
    const n = Number(o.usage_n);
    if (Number.isFinite(n) && n >= 1 && n <= 999) usage_n = Math.floor(n);
  }

  const service_types = Array.isArray(o.service_types)
    ? o.service_types
        .map((s) => String(s).toUpperCase())
        .filter((s): s is CouponServiceType => (COUPON_SERVICES as readonly string[]).includes(s))
    : undefined;

  const segmentRaw = String(o.customer_segment ?? "ALL").toUpperCase();
  const customer_segment = (
    ["ALL", "NEW", "EXISTING", "REFERRAL", "SUBSCRIPTION"] as const
  ).includes(segmentRaw as never)
    ? (segmentRaw as CheckoutCouponConfig["customer_segment"])
    : "ALL";

  const consumeRaw = String(o.consume_on ?? "PLACED").toUpperCase();
  const consume_on = consumeRaw === "DELIVERED" ? "DELIVERED" : "PLACED";

  const numOrNull = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  return {
    usage_mode,
    usage_n,
    service_types: service_types?.length ? service_types : undefined,
    coupon_type: o.coupon_type != null ? String(o.coupon_type) : null,
    auto_apply: o.auto_apply === true,
    manual_entry: o.manual_entry !== false,
    public: o.public !== false,
    stackable: o.stackable === true,
    exclusive: o.exclusive !== false,
    priority: (() => {
      const n = Number(o.priority ?? 100);
      return Number.isFinite(n) ? Math.floor(n) : 100;
    })(),
    restore_on_cancel: o.restore_on_cancel !== false,
    restore_on_refund: o.restore_on_refund !== false,
    consume_on,
    min_order_value: numOrNull(o.min_order_value),
    max_discount: numOrNull(o.max_discount),
    max_ride_distance_km: numOrNull(o.max_ride_distance_km),
    max_parcel_distance_km: numOrNull(o.max_parcel_distance_km),
    max_weight_kg: numOrNull(o.max_weight_kg),
    vehicle_types: Array.isArray(o.vehicle_types)
      ? o.vehicle_types.map((x) => String(x)).filter(Boolean)
      : undefined,
    payment_modes: Array.isArray(o.payment_modes)
      ? o.payment_modes.map((x) => String(x)).filter(Boolean)
      : undefined,
    customer_segment,
    weekdays: Array.isArray(o.weekdays)
      ? o.weekdays.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
      : undefined,
    time_slots: Array.isArray(o.time_slots)
      ? (o.time_slots as Array<{ start?: string; end?: string }>)
          .filter((s) => s && typeof s.start === "string" && typeof s.end === "string")
          .map((s) => ({ start: String(s.start), end: String(s.end) }))
      : undefined,
    cities: Array.isArray(o.cities) ? o.cities.map((x) => String(x)).filter(Boolean) : undefined,
    states: Array.isArray(o.states) ? o.states.map((x) => String(x)).filter(Boolean) : undefined,
  };
}

export function couponServiceTypes(
  serviceTypeColumn: string | null | undefined,
  config: CheckoutCouponConfig | null | undefined
): CouponServiceType[] {
  if (config?.service_types?.length) return config.service_types;
  const st = String(serviceTypeColumn ?? "FOOD").toUpperCase();
  if (st === "ALL") return [...COUPON_SERVICES];
  if ((COUPON_SERVICES as readonly string[]).includes(st)) return [st as CouponServiceType];
  return ["FOOD"];
}

export function couponCoversService(
  serviceTypeColumn: string | null | undefined,
  config: CheckoutCouponConfig | null | undefined,
  service: string
): boolean {
  const want = service.trim().toUpperCase();
  if (want === "ALL") return true;
  return couponServiceTypes(serviceTypeColumn, config).includes(want as CouponServiceType);
}

/** Geo visibility: coupon must be in effective binding set for the drop location. */
export function checkoutCouponGeoMatches(
  couponId: number,
  geoBoundCouponIds: ReadonlySet<number> | null | undefined
): boolean {
  if (!geoBoundCouponIds) return false;
  return geoBoundCouponIds.has(couponId);
}

export function checkoutCouponUsagePasses(
  config: CheckoutCouponConfig,
  usage: CouponUsageSnapshot | null | undefined,
  /** Total completed orders for this customer (for FIRST_ORDER / FIRST_N). */
  customerOrderCount?: number | null
): boolean {
  const mode = config.usage_mode ?? "MAX_N_PER_CUSTOMER";
  const n = config.usage_n != null && config.usage_n >= 1 ? config.usage_n : 1;
  const u = usage ?? { lifetime: 0, day: 0, week: 0, month: 0, year: 0 };
  const orders = customerOrderCount ?? null;

  switch (mode) {
    case "UNLIMITED":
    case "EVERY_ORDER":
      return true;
    case "FIRST_ORDER_ONLY":
      if (orders != null && orders > 0) return false;
      return u.lifetime < 1;
    case "FIRST_N_ORDERS":
      if (orders != null && orders >= n) return false;
      return u.lifetime < n;
    case "ONE_TIME_EVER":
      return u.lifetime < 1;
    case "MAX_N_PER_CUSTOMER":
    case "LIFETIME_N":
      return u.lifetime < n;
    case "ONCE_PER_DAY":
      return u.day < 1;
    case "ONCE_PER_WEEK":
      return u.week < 1;
    case "ONCE_PER_MONTH":
      return u.month < 1;
    case "ONCE_PER_YEAR":
      return u.year < 1;
    default:
      return u.lifetime < n;
  }
}

export function checkoutCouponRestrictionsPass(
  config: CheckoutCouponConfig,
  opts: {
    serviceType: string;
    cartSubtotal: number;
    distanceKm?: number | null;
    weightKg?: number | null;
    vehicleType?: string | null;
    paymentMode?: string | null;
    userSegment?: string | null;
    now?: Date;
    cityName?: string | null;
    stateName?: string | null;
  }
): boolean {
  const st = opts.serviceType.trim().toUpperCase();
  if (config.min_order_value != null && config.min_order_value > 0 && opts.cartSubtotal < config.min_order_value) {
    return false;
  }
  if (config.customer_segment && config.customer_segment !== "ALL") {
    const seg = String(opts.userSegment ?? "ALL").toUpperCase();
    if (config.customer_segment === "NEW" && seg !== "NEW") return false;
    if (config.customer_segment === "EXISTING" && seg === "NEW") return false;
    if (config.customer_segment === "REFERRAL" && seg !== "REFERRAL") return false;
    if (config.customer_segment === "SUBSCRIPTION" && seg !== "SUBSCRIPTION") return false;
  }
  const dist = opts.distanceKm;
  if (dist != null && Number.isFinite(dist)) {
    if (st === "RIDE" && config.max_ride_distance_km != null && dist > config.max_ride_distance_km) {
      return false;
    }
    if (st === "PARCEL" && config.max_parcel_distance_km != null && dist > config.max_parcel_distance_km) {
      return false;
    }
  }
  if (
    config.max_weight_kg != null &&
    opts.weightKg != null &&
    Number.isFinite(opts.weightKg) &&
    opts.weightKg > config.max_weight_kg
  ) {
    return false;
  }
  if (config.vehicle_types?.length) {
    const v = String(opts.vehicleType ?? "").trim().toUpperCase();
    if (!v || !config.vehicle_types.map((x) => x.toUpperCase()).includes(v)) return false;
  }
  if (config.payment_modes?.length) {
    const allowed = config.payment_modes.map((x) => String(x).trim().toUpperCase()).filter(Boolean);
    // Dashboard often stores ["All"] to mean unrestricted — not a literal payment mode.
    if (allowed.length > 0 && !allowed.includes("ALL") && !allowed.includes("ANY")) {
      const p = String(opts.paymentMode ?? "").trim().toUpperCase();
      if (!p || !allowed.includes(p)) return false;
    }
  }
  if (config.cities?.length) {
    const city = String(opts.cityName ?? "").trim().toLowerCase();
    if (!city || !config.cities.map((x) => x.toLowerCase()).includes(city)) return false;
  }
  if (config.states?.length) {
    const state = String(opts.stateName ?? "").trim().toLowerCase();
    if (!state || !config.states.map((x) => x.toLowerCase()).includes(state)) return false;
  }
  const now = opts.now ?? new Date();
  if (config.weekdays?.length) {
    if (!config.weekdays.includes(now.getDay())) return false;
  }
  if (config.time_slots?.length) {
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const cur = `${hh}:${mm}`;
    const inSlot = config.time_slots.some((s) => s.start <= cur && cur <= s.end);
    if (!inSlot) return false;
  }
  return true;
}
