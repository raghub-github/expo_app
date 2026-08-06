/**
 * Shared checkout-coupon eligibility — list visibility and apply-time gates stay in sync.
 * Hard failures (segment, usage, first-order, expiry, …) hide the coupon from the app.
 * Soft failures (min order only) keep the row listable so locked Apply / unlock UX can work.
 */

import type { DiscountRow } from "./types.js";
import {
  checkoutCouponRestrictionsPass,
  checkoutCouponUsagePasses,
  couponCoversService,
  sanitizeCheckoutCouponConfig,
  type CheckoutCouponConfig,
  type CouponUsageSnapshot,
} from "./checkoutCouponConfig.js";

export type CouponEligibilityContext = {
  serviceType: string;
  userSegment: string;
  checkoutAudience?: string | null;
  customerCompletedOrderCount?: number | null;
  cartSubtotal: number;
  distanceKm?: number | null;
  weightKg?: number | null;
  vehicleType?: string | null;
  paymentMode?: string | null;
  cityName?: string | null;
  stateName?: string | null;
  now?: Date;
  /** When true, skip payment_mode (unknown at offer-list time). */
  skipPaymentMode?: boolean;
};

export type CouponEligibilityResult = {
  /** Customer/history gates — false → never show in the app. */
  hardEligible: boolean;
  /** All gates including min order — false → cannot apply yet. */
  fullyEligible: boolean;
  reason: string | null;
  config: CheckoutCouponConfig;
};

function segmentPasses(
  cfg: CheckoutCouponConfig,
  meta: Record<string, unknown> | null | undefined,
  userSegment: string
): boolean {
  const seg = String(userSegment ?? "ALL").toUpperCase();
  if (cfg.customer_segment && cfg.customer_segment !== "ALL") {
    if (cfg.customer_segment === "NEW" && seg !== "NEW") return false;
    if (cfg.customer_segment === "EXISTING" && seg === "NEW") return false;
    if (cfg.customer_segment === "REFERRAL" && seg !== "REFERRAL") return false;
    if (cfg.customer_segment === "SUBSCRIPTION" && seg !== "SUBSCRIPTION") return false;
    return true;
  }
  const couponSeg = String(meta?.customer_segment ?? "ALL").toUpperCase();
  if (couponSeg === "NEW" && seg !== "NEW") return false;
  if (couponSeg === "EXISTING" && seg === "NEW") return false;
  return true;
}

/** Estimate cart discount for auto-apply winner selection (mirrors applyCouponDiscount math). */
export function estimateCheckoutCouponDiscountInr(
  coupon: Pick<DiscountRow, "discountType" | "valueNumeric" | "maxDiscountCap" | "couponConfig">,
  eligibleCartBase: number
): number {
  const cfg = sanitizeCheckoutCouponConfig(coupon.couponConfig ?? {});
  const base = Math.max(0, eligibleCartBase);
  if (base <= 0) return 0;
  let amt = 0;
  const dt = String(coupon.discountType).toUpperCase();
  if (dt === "FIXED") {
    amt = Math.max(0, coupon.valueNumeric ?? 0);
  } else if (dt === "PERCENTAGE") {
    amt = (base * (coupon.valueNumeric ?? 0)) / 100;
  }
  const cap =
    coupon.maxDiscountCap != null && coupon.maxDiscountCap > 0
      ? coupon.maxDiscountCap
      : cfg.max_discount != null && cfg.max_discount > 0
        ? cfg.max_discount
        : null;
  if (cap != null && cap > 0) amt = Math.min(amt, cap);
  return Math.max(0, Math.min(amt, base));
}

function hardFail(cfg: CheckoutCouponConfig, reason: string): CouponEligibilityResult {
  return { hardEligible: false, fullyEligible: false, reason, config: cfg };
}

/**
 * Evaluate whether a discount row may be listed / applied for this customer + cart.
 */
export function evaluateCheckoutCouponEligibility(
  coupon: DiscountRow,
  usage: CouponUsageSnapshot | null | undefined,
  ctx: CouponEligibilityContext
): CouponEligibilityResult {
  const now = ctx.now ?? new Date();
  const cfg = sanitizeCheckoutCouponConfig(coupon.couponConfig ?? {});

  if (!coupon.isActive) return hardFail(cfg, "inactive");
  if (coupon.validFrom && now < coupon.validFrom) return hardFail(cfg, "not_started");
  if (coupon.validUntil && now > coupon.validUntil) return hardFail(cfg, "expired");
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    return hardFail(cfg, "global_usage_limit");
  }

  const rowAud = String(coupon.offerAudience ?? "CUSTOMER").toUpperCase();
  const checkoutAud = String(ctx.checkoutAudience ?? "CUSTOMER").toUpperCase();
  if (rowAud !== checkoutAud) return hardFail(cfg, "audience");

  if (!couponCoversService(coupon.serviceType, cfg, ctx.serviceType)) {
    return hardFail(cfg, "service");
  }

  if (!segmentPasses(cfg, coupon.metadata, ctx.userSegment)) {
    return hardFail(cfg, "segment");
  }

  if (!checkoutCouponUsagePasses(cfg, usage, ctx.customerCompletedOrderCount)) {
    return hardFail(cfg, "usage");
  }

  const perUser = coupon.perUserUsageLimit;
  const lifetime = usage?.lifetime ?? 0;
  if (perUser != null && perUser > 0 && lifetime >= perUser) {
    return hardFail(cfg, "per_user_limit");
  }

  const minOrder = cfg.min_order_value != null && cfg.min_order_value > 0 ? cfg.min_order_value : null;
  const minOrderOk = minOrder == null || ctx.cartSubtotal >= minOrder;

  // Evaluate non-min-order restrictions with a cart that clears min_order when needed.
  const cfgForRestrictions: CheckoutCouponConfig =
    ctx.skipPaymentMode && cfg.payment_modes?.length
      ? { ...cfg, payment_modes: undefined, min_order_value: null }
      : { ...cfg, min_order_value: null };

  if (
    !checkoutCouponRestrictionsPass(cfgForRestrictions, {
      serviceType: ctx.serviceType,
      cartSubtotal: ctx.cartSubtotal,
      distanceKm: ctx.distanceKm,
      weightKg: ctx.weightKg,
      vehicleType: ctx.vehicleType,
      paymentMode: ctx.skipPaymentMode ? null : ctx.paymentMode,
      userSegment: ctx.userSegment,
      now,
      cityName: ctx.cityName,
      stateName: ctx.stateName,
    })
  ) {
    return hardFail(cfg, "restrictions");
  }

  if (!minOrderOk) {
    return {
      hardEligible: true,
      fullyEligible: false,
      reason: "min_order",
      config: cfg,
    };
  }

  return {
    hardEligible: true,
    fullyEligible: true,
    reason: null,
    config: cfg,
  };
}
