/**
 * Platform checkout coupon config — stored in billing_discounts.coupon_config (jsonb).
 * Store Offer Engine is untouched; this only governs billing_discounts (admin checkout coupons).
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

export const COUPON_SERVICES = ["FOOD", "PARCEL", "RIDE"] as const;
export type CouponServiceType = (typeof COUPON_SERVICES)[number];

export const FOOD_COUPON_TYPES = [
  "FLAT",
  "PERCENT",
  "PERCENT_UP_TO",
  "FREE_DELIVERY",
  "CATEGORY",
  "ITEM",
  "BUY_X_GET_Y",
  "COMBO",
  "CASHBACK",
  "WALLET_CREDIT",
] as const;

export const RIDE_COUPON_TYPES = [
  "FREE_RIDE_UP_TO_KM",
  "FREE_RIDE_UP_TO_AMOUNT",
  "FLAT_OFF",
  "FLAT_OFF_UP_TO",
  "PERCENT_OFF",
  "PERCENT_OFF_UP_TO",
  "FARE_CAP",
  "OFF_PER_KM",
  "AIRPORT",
  "ROUND_TRIP",
  "PICKUP",
  "DROP",
] as const;

export const PARCEL_COUPON_TYPES = [
  "FLAT",
  "PERCENT",
  "PERCENT_UP_TO",
  "FREE_DELIVERY",
  "WEIGHT_BASED",
  "DISTANCE_BASED",
  "DELIVERY_FEE_WAIVER",
  "FARE_CAP",
] as const;

export type CheckoutCouponConfig = {
  /** Usage / redemption rule. */
  usage_mode?: CouponUsageMode;
  /** N for FIRST_N_ORDERS / MAX_N_PER_CUSTOMER / LIFETIME_N (1–999). */
  usage_n?: number | null;
  /** Multi-service eligibility. Empty / omit → fall back to billing_discounts.service_type. */
  service_types?: CouponServiceType[];
  /** Service-specific coupon flavour (display + apply hints). */
  coupon_type?: string | null;
  /** Behaviour flags. */
  auto_apply?: boolean;
  manual_entry?: boolean;
  public?: boolean;
  stackable?: boolean;
  exclusive?: boolean;
  priority?: number;
  restore_on_cancel?: boolean;
  restore_on_refund?: boolean;
  consume_on?: "PLACED" | "DELIVERED";
  /** Restrictions (server-enforced when present). */
  min_order_value?: number | null;
  max_discount?: number | null;
  max_ride_distance_km?: number | null;
  max_parcel_distance_km?: number | null;
  max_weight_kg?: number | null;
  vehicle_types?: string[];
  payment_modes?: string[];
  customer_segment?: "ALL" | "NEW" | "EXISTING" | "REFERRAL" | "SUBSCRIPTION";
  weekdays?: number[]; // 0=Sun … 6=Sat
  time_slots?: Array<{ start: string; end: string }>;
  /** Free-text cities/states (legacy soft filter). Prefer geo bindings. */
  cities?: string[];
  states?: string[];
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
        .filter((s): s is CouponServiceType =>
          (COUPON_SERVICES as readonly string[]).includes(s)
        )
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

/** Resolve which services this coupon covers. */
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
  return couponServiceTypes(serviceTypeColumn, config).some((s) => s === want || want === "ALL");
}
