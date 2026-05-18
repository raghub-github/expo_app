import { applyDiscountRule, applyRule, resolveDiscountAppliesOn } from "./applyRule.js";
import { round2 } from "./money.js";
import { ruleConditionsPass } from "./conditions.js";
import { applyMerchantStoreOffers } from "./merchantOffersApply.js";
import {
  applyPlatformCartOffers,
  applyPlatformDeliveryOffers,
  applyPlatformFeeBucketOffers,
} from "./platformOffersApply.js";
import type {
  AppliedLine,
  BillContext,
  BillingDataset,
  BillingResult,
  DiscountRow,
  FeeRem,
  GstComponentLine,
  GstComponentsBreakdown,
  MutableBillState,
  RuleRow,
  TaxConfigRow,
} from "./types.js";

function discountRuleSortKey(rule: RuleRow): [number, number, number] {
  const tier =
    rule.appliesTo === "ITEM"
      ? 0
      : (() => {
          const on = resolveDiscountAppliesOn(rule);
          if (on === "DELIVERY_FEE" || on === "PLATFORM_FEE" || on === "PACKAGING_FEE") return 1;
          return 2;
        })();
  const calcTier = rule.calculationType === "PERCENTAGE" ? 0 : 1;
  return [tier, calcTier, rule.priority];
}

function gstByApplicableBase(taxes: AppliedLine[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const t of taxes) {
    const ab = t.meta?.applicableBase;
    if (typeof ab === "string" && ab.length) {
      m[ab] = round2((m[ab] ?? 0) + t.amount);
    }
  }
  return m;
}

function gstComponentLine(original: number, taxable: number, gmap: Record<string, number>, bases: string[]): GstComponentLine {
  const o = round2(original);
  const tv = Math.max(0, round2(taxable));
  const g = round2(bases.reduce((s, b) => s + (gmap[b] ?? 0), 0));
  return {
    original: o,
    discount: round2(o - tv),
    taxable_value: tv,
    gst: g,
  };
}

function buildGstComponents(remAfter: FeeRem, remBefore: FeeRem, gmap: Record<string, number>): GstComponentsBreakdown {
  return {
    items: gstComponentLine(remAfter.items, remBefore.items, gmap, ["ITEM_SUBTOTAL", "ITEM_AFTER_DISCOUNT"]),
    delivery: gstComponentLine(remAfter.delivery, remBefore.delivery, gmap, ["DELIVERY_FEE"]),
    platform: gstComponentLine(remAfter.platform, remBefore.platform, gmap, ["PLATFORM_FEE"]),
    surge: gstComponentLine(remAfter.surge, remBefore.surge, gmap, ["SURGE_FEE"]),
    packaging: gstComponentLine(remAfter.packaging, remBefore.packaging, gmap, ["PACKAGING_FEE"]),
    small_order: gstComponentLine(remAfter.smallOrder, remBefore.smallOrder, gmap, ["SMALL_ORDER_FEE"]),
    convenience: gstComponentLine(remAfter.convenience, remBefore.convenience, gmap, ["CONVENIENCE_FEE"]),
    // Subscription tax (applicable_base = SUBSCRIPTION_FEE) goes against the
    // misc bucket. We mirror the per-fee shape so the customer app can render
    // a "GST on subscription" row exactly like the others.
    subscription: gstComponentLine(remAfter.misc, remBefore.misc, gmap, ["SUBSCRIPTION_FEE"]),
  };
}

function disabledRuleIds(overrides: Record<string, unknown> | null): Set<number> {
  const raw = overrides?.disabledRuleIds;
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0));
}

function sumFeesRem(rem: FeeRem): number {
  return (
    rem.delivery +
    rem.platform +
    rem.packaging +
    rem.surge +
    rem.smallOrder +
    rem.convenience +
    rem.misc
  );
}

function grandBeforeTaxFromRem(rem: FeeRem): number {
  return Math.max(0, rem.items) + sumFeesRem(rem);
}

function baseForTax(
  cfg: TaxConfigRow,
  ctx: BillContext,
  _state: MutableBillState,
  itemPlusAddon: number,
  rem: FeeRem
): number {
  switch (cfg.applicableBase) {
    case "ITEM_SUBTOTAL":
      return ctx.itemSubtotal + ctx.addonSubtotal;
    case "AFTER_DISCOUNTS":
      return grandBeforeTaxFromRem(rem);
    case "ITEM_AFTER_DISCOUNT":
      return Math.max(0, rem.items);
    case "DELIVERY_FEE":
      return rem.delivery;
    case "PLATFORM_FEE":
      return rem.platform;
    case "PACKAGING_FEE":
      return rem.packaging;
    case "SURGE_FEE":
      return rem.surge;
    case "SMALL_ORDER_FEE":
      return rem.smallOrder;
    case "CONVENIENCE_FEE":
      return rem.convenience;
    case "SUBSCRIPTION_FEE":
      // Subscription rules (e.g. GMitra Plus) land in the misc bucket. We tax
      // that bucket directly so the rate (seeded at 18% in 0231) applies only
      // to subscription/misc charges and not to other unrelated items.
      return rem.misc;
    case "GRAND_BEFORE_TAX":
      return grandBeforeTaxFromRem(rem);
    default:
      return Math.max(0, rem.items);
  }
}

function applyCouponDiscount(
  ctx: BillContext,
  coupon: DiscountRow,
  itemPlusAddon: number,
  state: MutableBillState,
  rem: FeeRem
): void {
  const now = new Date();
  if (!coupon.isActive) return;
  if (coupon.validFrom && now < coupon.validFrom) return;
  if (coupon.validUntil && now > coupon.validUntil) return;
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) return;

  const rowAud = String(coupon.offerAudience ?? "CUSTOMER").toUpperCase();
  const checkoutAud = String(ctx.checkoutAudience ?? "CUSTOMER").toUpperCase();
  if (rowAud !== checkoutAud) return;

  const meta = (coupon.metadata ?? {}) as Record<string, unknown>;
  const couponSeg = String(meta.customer_segment ?? "ALL").toUpperCase();
  if (couponSeg === "NEW" && ctx.userSegment !== "NEW") return;
  if (couponSeg === "EXISTING" && ctx.userSegment === "NEW") return;

  const perUser = coupon.perUserUsageLimit;
  if (perUser != null && perUser > 0) {
    const usedByUser = ctx.couponRedemptionsByUser ?? 0;
    if (usedByUser >= perUser) return;
  }

  let amt = 0;
  if (coupon.discountType === "FIXED") {
    amt = Math.max(0, coupon.valueNumeric ?? 0);
  } else if (coupon.discountType === "PERCENTAGE") {
    const base = Math.max(0, rem.items);
    amt = (base * (coupon.valueNumeric ?? 0)) / 100;
  }
  const cap = coupon.maxDiscountCap;
  if (cap != null && cap > 0) amt = Math.min(amt, cap);
  const take = Math.min(Math.max(0, amt), rem.items);
  if (take <= 0) return;

  rem.items -= take;
  state.discountTotal += take;
  const line: AppliedLine = {
    kind: "discount",
    label: `Coupon ${coupon.code}`,
    amount: take,
    hidden: coupon.isHidden,
    meta: { couponId: coupon.id, code: coupon.code },
  };
  state.discounts.push(line);
  state.breakdown_steps.push({ step: line.label, amount: -take, meta: { couponId: coupon.id } });
}

function initialState(): MutableBillState {
  return {
    discountTotal: 0,
    deliveryFee: 0,
    platformFee: 0,
    packagingFee: 0,
    surgeFee: 0,
    smallOrderFee: 0,
    convenienceFee: 0,
    miscFee: 0,
    taxTotal: 0,
    appliedNonStackableDiscount: false,
    charges: [],
    discounts: [],
    taxes: [],
    breakdown_steps: [],
  };
}

const CHARGE_RULE_TYPES = new Set([
  "DELIVERY",
  "PLATFORM_FEE",
  "PACKAGING",
  "SURGE",
  "FEE",
  "SUBSCRIPTION",
  "SMALL_ORDER_FEE",
  "CONVENIENCE_FEE",
  "OTHER",
]);

function commitApply(
  state: MutableBillState,
  rule: RuleRow,
  r: {
    label: string;
    amount: number;
    bucket:
      | "discount"
      | "delivery"
      | "platform"
      | "packaging"
      | "surge"
      | "misc"
      | "small_order"
      | "convenience";
    meta?: Record<string, unknown>;
  }
): void {
  const { label, amount, bucket, meta } = r;
  if (bucket === "discount") {
    state.discountTotal += amount;
    if (!rule.stackable) state.appliedNonStackableDiscount = true;
    const line: AppliedLine = { kind: "discount", ruleId: rule.id, label, amount, hidden: rule.isHidden, meta };
    state.discounts.push(line);
    state.breakdown_steps.push({ step: label, amount: -amount, meta: { ...meta, ruleId: rule.id } });
    return;
  }

  const line: AppliedLine = { kind: "charge", ruleId: rule.id, label, amount, hidden: rule.isHidden, meta };
  state.charges.push(line);
  state.breakdown_steps.push({ step: label, amount, meta: { ...meta, ruleId: rule.id } });

  if (bucket === "delivery") state.deliveryFee += amount;
  else if (bucket === "platform") state.platformFee += amount;
  else if (bucket === "packaging") state.packagingFee += amount;
  else if (bucket === "surge") state.surgeFee += amount;
  else if (bucket === "small_order") state.smallOrderFee += amount;
  else if (bucket === "convenience") state.convenienceFee += amount;
  else state.miscFee += amount;
}

function commitDiscountFromRule(state: MutableBillState, rule: RuleRow, res: Extract<ReturnType<typeof applyDiscountRule>, { applied: true }>): void {
  state.discountTotal += res.amount;
  if (!rule.stackable) state.appliedNonStackableDiscount = true;
  const line: AppliedLine = {
    kind: "discount",
    ruleId: rule.id,
    label: res.label,
    amount: res.amount,
    hidden: rule.isHidden,
    meta: res.meta,
  };
  state.discounts.push(line);
  state.breakdown_steps.push({ step: res.label, amount: -res.amount, meta: { ...res.meta, ruleId: rule.id } });
}

function remFromState(state: MutableBillState, itemPlusAddon: number): FeeRem {
  return {
    items: itemPlusAddon,
    delivery: state.deliveryFee,
    platform: state.platformFee,
    packaging: state.packagingFee,
    surge: state.surgeFee,
    smallOrder: state.smallOrderFee,
    convenience: state.convenienceFee,
    misc: state.miscFee,
  };
}

function syncStateFeesFromRem(state: MutableBillState, rem: FeeRem): void {
  state.deliveryFee = rem.delivery;
  state.platformFee = rem.platform;
  state.packagingFee = rem.packaging;
  state.surgeFee = rem.surge;
  state.smallOrderFee = rem.smallOrder;
  state.convenienceFee = rem.convenience;
  state.miscFee = rem.misc;
}

export function executeBillingPipeline(ctx: BillContext, dataset: BillingDataset): BillingResult {
  const itemPlusAddon = ctx.itemSubtotal + ctx.addonSubtotal;
  const disabled = disabledRuleIds(dataset.merchantOverrides);

  const state = initialState();

  const rulesOrdered = [...dataset.rules].sort(
    (a, b) => a.chargeOrderKey - b.chargeOrderKey || a.priority - b.priority || a.id - b.id
  );
  const engineRules = rulesOrdered.filter((r) => r.type !== "TAX");
  const chargeRules = engineRules.filter((r) => CHARGE_RULE_TYPES.has(r.type));
  const discountRules = engineRules.filter((r) => r.type === "DISCOUNT" || r.type === "OFFER");
  discountRules.sort((a, b) => {
    const ka = discountRuleSortKey(a);
    const kb = discountRuleSortKey(b);
    for (let i = 0; i < 3; i++) {
      if (ka[i] !== kb[i]) return ka[i] - kb[i];
    }
    return a.id - b.id;
  });

  function runChargeBatch(batch: RuleRow[]): void {
    for (const rule of batch) {
      // Self-pickup waives ALL delivery-class charges (rule-driven or fallback).
      if (rule.type === "DELIVERY" && ctx.isSelfPickup) continue;
      if (rule.type === "DELIVERY" && state.deliveryFee > 0) continue;
      if (rule.type === "DONATION") continue;
      if (rule.type === "RIDER_TIP") continue;
      if (rule.type === "SUBSCRIPTION" && !ctx.subscriptionOptIn) continue;
      if (disabled.has(rule.id)) continue;
      if (!ruleConditionsPass(rule.conditions, ctx, state, itemPlusAddon)) continue;

      const applies = rule.appliesTo;
      if (applies !== "ORDER" && applies !== "DELIVERY" && applies !== "ITEM") continue;

      const res = applyRule(rule, ctx, state, dataset, itemPlusAddon);
      if (!res.applied) continue;
      commitApply(state, rule, res);
    }
  }

  runChargeBatch(chargeRules);

  /**
   * When delivery_fee is still zero:
   * slabs-v2 → geo → rate card → legacy per-km → env default max(base, per_km×km).
   * Runs even if a DELIVERY rule "applied" with ₹0 so we never silently skip delivery.
   * For self-pickup we short-circuit: the customer is collecting from the store,
   * so the delivery cost has to be exactly ₹0 regardless of fallback sources.
   */
  if (state.deliveryFee <= 0 && !ctx.isSelfPickup) {
    const fromSlabsRaw = ctx.deliveryFeeFromSlabsGeoV2;
    const fromSlabs =
      fromSlabsRaw != null && Number.isFinite(fromSlabsRaw) && fromSlabsRaw > 0 ? round2(fromSlabsRaw) : 0;
    const fromGeoRaw = ctx.deliveryFeeFromGeo;
    const fromGeo =
      fromGeoRaw != null && Number.isFinite(fromGeoRaw) && fromGeoRaw > 0 ? round2(fromGeoRaw) : 0;
    const fromCard =
      ctx.deliveryFeeFromRateCard != null &&
      Number.isFinite(ctx.deliveryFeeFromRateCard) &&
      ctx.deliveryFeeFromRateCard > 0
        ? round2(ctx.deliveryFeeFromRateCard)
        : 0;
    const dist = ctx.distanceKm;
    const legacyPerKm =
      ctx.deliveryChargePerKm > 0 && dist != null && Number.isFinite(dist) && dist > 0
        ? round2(ctx.deliveryChargePerKm * dist)
        : 0;
    const baseD = ctx.deliveryDefaultBaseInr ?? 0;
    const perKmD = ctx.deliveryDefaultPerKmInr ?? 0;
    // Env default delivery formula (last resort):
    // Use base + per_km × distance (monotonic), not max(base, per_km × distance).
    // `max()` caused flat fees (e.g. ₹25 for 3.2km) whenever perKm×km < base.
    const defaultFormula =
      dist != null && Number.isFinite(dist) && dist > 0 && (baseD > 0 || perKmD > 0)
        ? round2(baseD + perKmD * dist)
        : 0;
    const fallbackFee =
      fromSlabs > 0
        ? fromSlabs
        : fromGeo > 0
          ? fromGeo
          : fromCard > 0
            ? fromCard
            : legacyPerKm > 0
              ? legacyPerKm
              : defaultFormula;
    if (fallbackFee > 0) {
      state.deliveryFee = fallbackFee;
      // Distinguish a genuine slab fee from an env-default fallback that came
      // through the slab path because slab validation failed. The fromSlabs
      // value is set by storeQuote regardless of engine; here we only show
      // "(slabs)" when the engine ACTUALLY computed it from rate-card slabs.
      const slabsAuthoritative =
        fromSlabs > 0 && ctx.deliveryPricingEngine === "slab_geo";
      const label =
        slabsAuthoritative
          ? "Delivery fee (slabs)"
          : fromGeo > 0
            ? "Delivery fee (location)"
            : fromCard > 0
              ? "Delivery fee"
              : legacyPerKm > 0
                ? "Delivery fee (distance)"
                : ctx.deliveryPricingEngine === "slab_invalid"
                  ? "Delivery fee (default — slab config invalid)"
                  : "Delivery fee (default)";
      const sourceMeta =
        fromSlabs > 0
          ? ({
              source: "delivery_slab_geo_v2_fallback" as const,
              appliedGeo: ctx.deliverySlabsGeoV2AppliedGeo ?? undefined,
              quote: ctx.deliverySlabsGeoV2Quote ?? undefined,
            } as const)
          : fromGeo > 0
            ? ({ source: "geo_pricing_rules_fallback" as const } as const)
            : fromCard > 0
              ? ({ source: "delivery_rate_card_fallback" as const } as const)
              : legacyPerKm > 0
                ? ({ source: "legacy_per_km_fallback" as const } as const)
                : ({ source: "env_default_delivery_formula" as const } as const);
      state.charges.push({
        kind: "charge",
        label,
        amount: fallbackFee,
        hidden: false,
        meta: sourceMeta,
      });
      state.breakdown_steps.push({
        step: label,
        amount: fallbackFee,
        meta: { engineFallback: true, ...sourceMeta },
      });
    }
  }

  const minDel = ctx.deliveryMinimumInr;
  if (
    minDel != null &&
    minDel > 0 &&
    ctx.distanceKm != null &&
    Number.isFinite(ctx.distanceKm) &&
    ctx.distanceKm > 0
  ) {
    const prev = round2(state.deliveryFee);
    const next = round2(Math.max(prev, minDel));
    if (next > prev) {
      const delta = round2(next - prev);
      state.deliveryFee = next;
      state.charges.push({
        kind: "charge",
        label: delta > 0 && prev <= 0 ? "Delivery fee (minimum)" : "Delivery minimum adjustment",
        amount: delta,
        hidden: false,
        meta: { source: "delivery_minimum_floor", floorInr: minDel, previousDeliveryInr: prev },
      });
      state.breakdown_steps.push({
        step: "Delivery minimum",
        amount: delta,
        meta: { source: "delivery_minimum_floor", floorInr: minDel },
      });
    }
  }

  const rem = remFromState(state, itemPlusAddon);
  const remAfterCharges: FeeRem = { ...rem };

  function runDiscountBatch(batch: RuleRow[]): void {
    for (const rule of batch) {
      if (!rule.stackable && state.appliedNonStackableDiscount) continue;
      if (disabled.has(rule.id)) continue;
      if (!ruleConditionsPass(rule.conditions, ctx, state, itemPlusAddon)) continue;

      const applies = rule.appliesTo;
      if (applies !== "ORDER" && applies !== "DELIVERY" && applies !== "ITEM") continue;

      const res = applyDiscountRule(rule, ctx, state, rem, itemPlusAddon);
      if (!res.applied) continue;
      commitDiscountFromRule(state, rule, res);
    }
  }

  runDiscountBatch(discountRules);

  syncStateFeesFromRem(state, rem);

  applyMerchantStoreOffers(ctx, dataset, state, itemPlusAddon, rem);
  applyPlatformCartOffers(ctx, dataset, state, itemPlusAddon, rem);
  syncStateFeesFromRem(state, rem);
  applyPlatformDeliveryOffers(ctx, dataset, state, itemPlusAddon, rem);
  syncStateFeesFromRem(state, rem);
  applyPlatformFeeBucketOffers(ctx, dataset, state, itemPlusAddon, rem);
  syncStateFeesFromRem(state, rem);

  if (dataset.coupon) {
    applyCouponDiscount(ctx, dataset.coupon, itemPlusAddon, state, rem);
  }
  syncStateFeesFromRem(state, rem);

  const remBeforeTax: FeeRem = { ...rem };

  const taxSorted = [...dataset.taxConfigs].sort(
    (a, b) => a.chargeOrderKey - b.chargeOrderKey || a.priority - b.priority || a.id - b.id
  );
  const taxesByGroup: Record<string, number> = {};
  state.taxTotal = 0;
  for (const cfg of taxSorted) {
    const base = baseForTax(cfg, ctx, state, itemPlusAddon, rem);
    const t = round2(Math.max(0, base * cfg.rate));
    if (t <= 0) continue;
    state.taxTotal = round2(state.taxTotal + t);
    const g = cfg.taxGroup?.trim() || "other";
    taxesByGroup[g] = round2((taxesByGroup[g] ?? 0) + t);
    const line: AppliedLine = {
      kind: "tax",
      label: cfg.name,
      amount: t,
      hidden: cfg.isHidden,
      meta: {
        taxConfigId: cfg.id,
        base,
        rate: cfg.rate,
        applicableBase: cfg.applicableBase,
        taxGroup: cfg.taxGroup,
      },
    };
    state.taxes.push(line);
    state.breakdown_steps.push({
      step: cfg.name,
      amount: t,
      meta: { taxConfigId: cfg.id, applicableBase: cfg.applicableBase, taxGroup: cfg.taxGroup },
    });
  }

  const gmap = gstByApplicableBase(state.taxes);
  const gst_components = buildGstComponents(remAfterCharges, remBeforeTax, gmap);

  const preFinal = round2(
    Math.max(0, rem.items) +
      rem.delivery +
      rem.platform +
      rem.packaging +
      rem.surge +
      rem.smallOrder +
      rem.convenience +
      rem.misc +
      state.taxTotal
  );

  const finalAmount = round2(preFinal + ctx.tipAmount + ctx.donationAmount);

  function firstMatchingRuleByType(ruleType: string): RuleRow | null {
    const candidates = [...dataset.rules]
      .filter((r) => r.type === ruleType)
      .sort((a, b) => a.chargeOrderKey - b.chargeOrderKey || a.priority - b.priority || a.id - b.id);
    for (const r of candidates) {
      if (disabled.has(r.id)) continue;
      if (!ruleConditionsPass(r.conditions, ctx, state, itemPlusAddon)) continue;
      return r;
    }
    return null;
  }

  if (ctx.tipAmount > 0) {
    const tipRule = firstMatchingRuleByType("RIDER_TIP");
    const tipLabel = tipRule?.name?.trim() || "Rider tip (non-taxable)";
    const tipAmt = round2(ctx.tipAmount);
    state.charges.push({
      kind: "charge",
      ruleId: tipRule?.id,
      label: tipLabel,
      amount: tipAmt,
      hidden: tipRule?.isHidden ?? false,
      meta: { source: "checkout_tipAmount", nonTaxable: true },
    });
    state.breakdown_steps.push({
      step: tipLabel,
      amount: tipAmt,
      meta: { source: "checkout_tipAmount", nonTaxable: true, ruleId: tipRule?.id },
    });
  }
  if (ctx.donationAmount > 0) {
    const donRule = firstMatchingRuleByType("DONATION");
    const donLabel = donRule?.name?.trim() || "Donation";
    const donAmt = round2(ctx.donationAmount);
    state.charges.push({
      kind: "charge",
      ruleId: donRule?.id,
      label: donLabel,
      amount: donAmt,
      hidden: donRule?.isHidden ?? false,
      meta: { source: "checkout_donationAmount", nonTaxable: true },
    });
    state.breakdown_steps.push({
      step: donLabel,
      amount: donAmt,
      meta: { source: "checkout_donationAmount", nonTaxable: true, ruleId: donRule?.id },
    });
  }

  return {
    item_total: round2(ctx.itemSubtotal),
    addon_total: round2(ctx.addonSubtotal),
    discount_total: round2(state.discountTotal),
    delivery_fee: round2(rem.delivery),
    platform_fee: round2(rem.platform),
    packaging_fee: round2(rem.packaging),
    surge_fee: round2(rem.surge),
    small_order_fee: round2(rem.smallOrder),
    convenience_fee: round2(rem.convenience),
    misc_fee: round2(rem.misc),
    tax_total: state.taxTotal,
    tip_amount: round2(ctx.tipAmount),
    donation_amount: round2(ctx.donationAmount),
    final_amount: Math.max(0, finalAmount),
    items_net_after_discounts: round2(Math.max(0, rem.items)),
    taxes_by_group: taxesByGroup,
    gst_components,
    gst_totals: {
      total_discount: round2(state.discountTotal),
      total_tax: state.taxTotal,
      final_payable: Math.max(0, finalAmount),
    },
    charges: state.charges,
    discounts: state.discounts,
    taxes: state.taxes,
    breakdown_steps: state.breakdown_steps,
    ruleset_version: dataset.rulesetVersion,
  };
}
