import type {
  BillContext,
  BillingDataset,
  FeeRem,
  MutableBillState,
  PackagingSlabRow,
  RuleRow,
  SlabRow,
} from "./types.js";
import { round2 } from "./money.js";
import { cartPromoQualifyingSubtotal } from "./discountEligibility.js";
function clamp0(n: number): number {
  return Math.max(0, n);
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function pickSlab(slabs: SlabRow[], ctx: BillContext): SlabRow | null {
  const d = ctx.distanceKm;
  if (d == null || !Number.isFinite(d)) return null;

  const scoped = slabs.filter((s) => {
    if (s.scopeType === "global" || s.scopeType === "") return true;
    if (s.scopeType === "merchant_store" && s.scopeId === ctx.merchantStoreId) return true;
    if (s.scopeType === "merchant_parent" && s.scopeId != null && s.scopeId === ctx.merchantParentId)
      return true;
    return false;
  });

  const sorted = [...scoped].sort((a, b) => a.priority - b.priority);
  for (const s of sorted) {
    const min = s.minKm ?? 0;
    const max = s.maxKm ?? 1e9;
    if (d >= min && d <= max) return s;
  }
  return sorted[0] ?? null;
}

function pickPackagingSlab(
  slabs: PackagingSlabRow[],
  ctx: BillContext,
  cartSubtotal: number
): PackagingSlabRow | null {
  const scoped = slabs.filter((s) => {
    if (s.scopeType === "global" || s.scopeType === "") return true;
    if (s.scopeType === "merchant_store" && s.scopeId === ctx.merchantStoreId) return true;
    if (s.scopeType === "merchant_parent" && s.scopeId != null && s.scopeId === ctx.merchantParentId)
      return true;
    return false;
  });

  const sorted = [...scoped].sort((a, b) => a.priority - b.priority);
  for (const s of sorted) {
    const min = s.minCart ?? 0;
    const max = s.maxCart ?? 1e12;
    if (cartSubtotal >= min && cartSubtotal <= max) return s;
  }
  return sorted[0] ?? null;
}

export type ApplyRuleResult =
  | {
      applied: true;
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
  | { applied: false; reason: string };

/** Charge-phase rules only (DISCOUNT/OFFER run in applyDiscountRule). */
export function applyRule(
  rule: RuleRow,
  ctx: BillContext,
  state: MutableBillState,
  dataset: BillingDataset,
  itemPlusAddon: number
): ApplyRuleResult {
  const meta = rule.metadata ?? {};
  const vn = rule.valueNumeric ?? 0;

  switch (rule.type) {
    case "DELIVERY": {
      if (rule.calculationType === "FIXED") {
        return {
          applied: true,
          label: (rule.name as string) || `Delivery #${rule.id}`,
          amount: clamp0(vn),
          bucket: "delivery",
          meta: { ruleId: rule.id },
        };
      }
      if (rule.calculationType === "FORMULA_KEY") {
        const key = (rule.valueJson as { key?: string } | null)?.key ?? "";
        if (key === "DELIVERY_SLAB") {
          const slab = pickSlab(dataset.deliverySlabs, ctx);
          if (!slab) return { applied: false, reason: "no_slab" };
          const d = ctx.distanceKm ?? 0;
          const fee = num(slab.feeFixed) + num(slab.feePerKm) * d;
          return {
            applied: true,
            label: slab.name || `Delivery slab ${slab.id}`,
            amount: clamp0(fee),
            bucket: "delivery",
            meta: { ruleId: rule.id, slabId: slab.id },
          };
        }
        if (key === "DELIVERY_RATE_CARD") {
          const fee = ctx.deliveryFeeFromRateCard ?? 0;
          if (fee <= 0) return { applied: false, reason: "zero_rate_card" };
          return {
            applied: true,
            label: (rule.name as string) || "Delivery",
            amount: clamp0(fee),
            bucket: "delivery",
            meta: { ruleId: rule.id, source: "delivery_rate_card_engine" },
          };
        }
        if (key === "GEO_LOCATION_DELIVERY") {
          const geo = ctx.deliveryFeeFromGeo;
          const rate = ctx.deliveryFeeFromRateCard ?? 0;
          const amt = geo != null && geo > 0 ? geo : rate;
          if (amt <= 0) return { applied: false, reason: "zero_geo_delivery" };
          return {
            applied: true,
            label: (rule.name as string) || "Delivery (location)",
            amount: clamp0(amt),
            bucket: "delivery",
            meta: {
              ruleId: rule.id,
              source: geo != null && geo > 0 ? "geo_pricing_rules" : "rate_card_fallback",
            },
          };
        }
        if (key === "DELIVERY_SLABS_GEO_V2") {
          const fee = ctx.deliveryFeeFromSlabsGeoV2 ?? 0;
          if (fee <= 0) return { applied: false, reason: "zero_slab_v2" };
          return {
            applied: true,
            label: (rule.name as string) || "Delivery (slabs)",
            amount: clamp0(fee),
            bucket: "delivery",
            meta: {
              ruleId: rule.id,
              source: "delivery_slab_geo_v2",
              appliedGeo: ctx.deliverySlabsGeoV2AppliedGeo ?? undefined,
              quote: ctx.deliverySlabsGeoV2Quote ?? undefined,
            },
          };
        }
        if (key === "MERCHANT_PER_KM") {
          if (ctx.distanceKm == null) return { applied: false, reason: "distance_required" };
          const fee = ctx.deliveryChargePerKm * ctx.distanceKm + vn;
          return {
            applied: true,
            label: (rule.name as string) || "Delivery (per km)",
            amount: clamp0(fee),
            bucket: "delivery",
            meta: { ruleId: rule.id },
          };
        }
      }
      return { applied: false, reason: "unsupported_delivery" };
    }
    case "PLATFORM_FEE": {
      let amt = 0;
      if (rule.calculationType === "FIXED") amt = vn;
      else if (rule.calculationType === "PERCENTAGE") {
        const base = Math.max(0, itemPlusAddon);
        amt = (base * vn) / 100;
      } else return { applied: false, reason: "unsupported_platform" };
      return {
        applied: true,
        label: (rule.name as string) || `Platform fee #${rule.id}`,
        amount: clamp0(amt),
        bucket: "platform",
        meta: { ruleId: rule.id },
      };
    }
    case "PACKAGING": {
      if (rule.calculationType === "FORMULA_KEY") {
        const key = (rule.valueJson as { key?: string } | null)?.key ?? "";
        if (key === "PACKAGING_SLAB") {
          const slab = pickPackagingSlab(dataset.packagingSlabs, ctx, itemPlusAddon);
          if (!slab) return { applied: false, reason: "no_packaging_slab" };
          const addonQty = ctx.addonQtyTotal ?? 0;
          const fee = num(slab.feeFixed) + num(slab.feePerAddonQty) * addonQty;
          return {
            applied: true,
            label: slab.name || `Packaging slab ${slab.id}`,
            amount: clamp0(fee),
            bucket: "packaging",
            meta: { ruleId: rule.id, slabId: slab.id },
          };
        }
        if (key === "MERCHANT_PACKAGING") {
          const fromItems = ctx.itemPackagingTotal ?? 0;
          const fallback = ctx.packagingChargeAmount ?? 0;
          const amt = fromItems > 0 ? fromItems : fallback;
          if (amt <= 0) return { applied: false, reason: "no_item_packaging" };
          return {
            applied: true,
            label: (rule.name as string) || "Packaging",
            amount: clamp0(amt),
            bucket: "packaging",
            meta: { ruleId: rule.id, source: fromItems > 0 ? "item_lines" : "store_default" },
          };
        }
      }
      if (rule.calculationType === "FIXED") {
        return {
          applied: true,
          label: (rule.name as string) || "Packaging",
          amount: clamp0(vn),
          bucket: "packaging",
          meta: { ruleId: rule.id },
        };
      }
      return { applied: false, reason: "unsupported_packaging" };
    }
    case "DONATION":
      return { applied: false, reason: "donation_via_context" };
    case "RIDER_TIP":
      return { applied: false, reason: "rider_tip_via_context" };
    case "SURGE": {
      if (rule.calculationType !== "FIXED") return { applied: false, reason: "fee_requires_fixed" };
      return {
        applied: true,
        label: (rule.name as string) || `SURGE #${rule.id}`,
        amount: clamp0(vn),
        bucket: "surge",
        meta: { ruleId: rule.id, chargeSubtype: rule.chargeSubtype },
      };
    }
    case "SMALL_ORDER_FEE":
    case "CONVENIENCE_FEE": {
      let amt = 0;
      if (rule.calculationType === "FIXED") amt = vn;
      else if (rule.calculationType === "PERCENTAGE") {
        const base = Math.max(0, itemPlusAddon);
        amt = (base * vn) / 100;
      } else return { applied: false, reason: "unsupported_named_fee" };
      const bucket = rule.type === "SMALL_ORDER_FEE" ? "small_order" : "convenience";
      return {
        applied: true,
        label: (rule.name as string) || `${rule.type} #${rule.id}`,
        amount: clamp0(amt),
        bucket,
        meta: { ruleId: rule.id, chargeSubtype: rule.chargeSubtype },
      };
    }
    case "FEE":
    case "SUBSCRIPTION": {
      if (rule.calculationType !== "FIXED") return { applied: false, reason: "fee_requires_fixed" };
      const fallbackLabel =
        rule.type === "SUBSCRIPTION" ? `Subscription #${rule.id}` : `${rule.type} #${rule.id}`;
      return {
        applied: true,
        label: (rule.name as string) || fallbackLabel,
        amount: clamp0(vn),
        bucket: "misc",
        meta: { ruleId: rule.id, chargeSubtype: rule.chargeSubtype },
      };
    }
    case "OTHER": {
      let amt = 0;
      if (rule.calculationType === "FIXED") amt = vn;
      else if (rule.calculationType === "PERCENTAGE") {
        const base = Math.max(0, itemPlusAddon);
        amt = (base * vn) / 100;
      } else return { applied: false, reason: "unsupported_other" };
      return {
        applied: true,
        label: (rule.name as string) || `Other charge #${rule.id}`,
        amount: clamp0(amt),
        bucket: "misc",
        meta: { ruleId: rule.id, chargeSubtype: rule.chargeSubtype },
      };
    }
    case "TAX":
      return { applied: false, reason: "tax_via_configs" };
    case "DISCOUNT":
    case "OFFER":
      return { applied: false, reason: "discount_in_discount_phase" };
    default:
      return { applied: false, reason: "unknown_rule_type" };
  }
}

function sumRem(rem: FeeRem): number {
  return (
    rem.items +
    rem.delivery +
    rem.platform +
    rem.packaging +
    rem.surge +
    rem.smallOrder +
    rem.convenience +
    rem.misc
  );
}

function applySubtotalShare(rem: FeeRem, totalDiscount: number): void {
  const base = sumRem(rem);
  if (base <= 0 || totalDiscount <= 0) return;
  const take = Math.min(totalDiscount, base);
  const keys = ["items", "delivery", "platform", "packaging", "surge", "smallOrder", "convenience", "misc"] as const;
  const totalP = Math.round(take * 100);
  const baseP = keys.map((k) => Math.round(rem[k] * 100));
  const sumBaseP = baseP.reduce((a, b) => a + b, 0);
  if (sumBaseP <= 0) return;
  let used = 0;
  const allocP: number[] = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const p = Math.floor((totalP * baseP[i]) / sumBaseP);
    allocP.push(p);
    used += p;
  }
  allocP.push(totalP - used);
  for (let i = 0; i < keys.length; i++) {
    rem[keys[i]] = Math.max(0, round2(rem[keys[i]] - allocP[i] / 100));
  }
}

export function resolveDiscountAppliesOn(rule: RuleRow): string {
  const d = rule.discountAppliesOn?.trim();
  if (d) return d.toUpperCase();
  const meta = rule.metadata ?? {};
  const ma = meta.discount_applies_on as string | undefined;
  if (typeof ma === "string" && ma.trim()) return ma.trim().toUpperCase();
  const legacy = meta.discount_base as string | undefined;
  if (legacy === "AFTER_DISCOUNTS") return "ITEMS_TOTAL";
  return "ITEMS_TOTAL";
}

/**
 * DISCOUNT/OFFER rules after all charge rules; mutates `rem` (item + fee buckets).
 */
export function applyDiscountRule(
  rule: RuleRow,
  ctx: BillContext,
  state: MutableBillState,
  rem: FeeRem,
  itemPlusAddon: number
): ApplyRuleResult {
  if (rule.type !== "DISCOUNT" && rule.type !== "OFFER") {
    return { applied: false, reason: "not_discount_rule" };
  }
  if (!rule.stackable && state.appliedNonStackableDiscount) {
    return { applied: false, reason: "non_stackable_conflict" };
  }
  const meta = rule.metadata ?? {};
  const vn = rule.valueNumeric ?? 0;
  const capDiscount = (raw: number): number => {
    const cap = num(meta.max_discount_cap);
    if (cap > 0) return Math.min(raw, cap);
    return raw;
  };
  const appliesOn = resolveDiscountAppliesOn(rule);
  const eligibleItems = Math.min(
    Math.max(0, rem.items),
    cartPromoQualifyingSubtotal(ctx, itemPlusAddon)
  );

  let rawAmt = 0;
  if (rule.calculationType === "FIXED") {
    rawAmt = clamp0(vn);
  } else if (rule.calculationType === "PERCENTAGE") {
    if (appliesOn === "ITEMS_TOTAL") {
      rawAmt = clamp0((eligibleItems * vn) / 100);
    } else if (appliesOn === "SUBTOTAL") {
      const base = sumRem(rem);
      rawAmt = clamp0((base * vn) / 100);
    } else if (appliesOn === "DELIVERY_FEE") {
      rawAmt = clamp0((Math.max(0, rem.delivery) * vn) / 100);
    } else if (appliesOn === "PLATFORM_FEE") {
      rawAmt = clamp0((Math.max(0, rem.platform) * vn) / 100);
    } else if (appliesOn === "PACKAGING_FEE") {
      rawAmt = clamp0((Math.max(0, rem.packaging) * vn) / 100);
    } else {
      rawAmt = clamp0((eligibleItems * vn) / 100);
    }
  } else {
    return { applied: false, reason: "unsupported_discount_calc" };
  }

  let amt = capDiscount(rawAmt);
  if (amt <= 0) return { applied: false, reason: "zero_discount" };

  if (appliesOn === "ITEMS_TOTAL") {
    const take = Math.min(amt, eligibleItems, rem.items);
    rem.items -= take;
    amt = take;
  } else if (appliesOn === "SUBTOTAL") {
    const base = sumRem(rem);
    if (base <= 0) return { applied: false, reason: "zero_subtotal" };
    const take = Math.min(amt, base);
    applySubtotalShare(rem, take);
    amt = take;
  } else if (appliesOn === "DELIVERY_FEE") {
    const take = Math.min(amt, rem.delivery);
    rem.delivery -= take;
    amt = take;
  } else if (appliesOn === "PLATFORM_FEE") {
    const take = Math.min(amt, rem.platform);
    rem.platform -= take;
    amt = take;
  } else if (appliesOn === "PACKAGING_FEE") {
    const take = Math.min(amt, rem.packaging);
    rem.packaging -= take;
    amt = take;
  } else {
    return { applied: false, reason: "unknown_applies_on" };
  }

  if (amt <= 0) return { applied: false, reason: "zero_discount" };

  return {
    applied: true,
    label: (rule.name as string) || (rule.type === "OFFER" ? `Offer #${rule.id}` : `Discount #${rule.id}`),
    amount: amt,
    bucket: "discount",
    meta: {
      ruleId: rule.id,
      discountAppliesOn: appliesOn,
      eligibleBase: eligibleItems,
      chargeSubtype: rule.chargeSubtype,
      ...(rule.type === "OFFER" ? { offerOwner: rule.offerOwner } : {}),
    },
  };
}
