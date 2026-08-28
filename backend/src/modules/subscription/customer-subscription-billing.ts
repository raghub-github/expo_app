/**
 * Post-pipeline billing adjustments for customer subscriptions.
 * Backend is the source of truth for free delivery radius and subscription charges.
 */

import type { AppliedLine, BillingResult } from "../billing/types.js";
import type {
  SubscriptionDeliveryBenefit,
  SubscriptionDeliveryPricingContext,
} from "./subscriptionDeliveryPricing.js";
import { computeSubscriptionDeliveryBenefit } from "./subscriptionDeliveryPricing.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type SubscriptionBillingAdjustmentInput = {
  planId: number;
  planName: string;
  freeDeliveryEnabled: boolean;
  maxFreeDeliveryRadiusKm: number;
  distanceKm: number | null;
  deliveryPricing?: SubscriptionDeliveryPricingContext | null;
  /** When the customer opts into a new plan at checkout. */
  subscriptionCharge?: {
    subtotal: number;
    gstAmount: number;
    gstPercent: number;
    label: string;
  } | null;
};

function cloneBilling(billing: BillingResult): BillingResult {
  return {
    ...billing,
    charges: [...billing.charges],
    discounts: [...billing.discounts],
    taxes: [...billing.taxes],
    breakdown_steps: [...billing.breakdown_steps],
    gst_components: { ...billing.gst_components },
    gst_totals: { ...billing.gst_totals },
    taxes_by_group: { ...billing.taxes_by_group },
  };
}

function isGenericSubscriptionCharge(line: AppliedLine): boolean {
  if (line.meta?.source === "customer_subscription_checkout") return false;
  const lbl = (line.label || "").toLowerCase();
  return lbl.includes("subscription") || lbl.includes("gmitra") || lbl.includes(" plus");
}

function stripGenericSubscriptionCharges(billing: BillingResult): BillingResult {
  const removed = billing.charges.filter(isGenericSubscriptionCharge);
  if (removed.length === 0) return billing;

  const b = cloneBilling(billing);
  const removedSubtotal = round2(removed.reduce((s, c) => s + c.amount, 0));
  b.charges = b.charges.filter((c) => !isGenericSubscriptionCharge(c));
  b.breakdown_steps = b.breakdown_steps.filter((s) => {
    const lbl = s.step.toLowerCase();
    if (s.meta?.source === "customer_subscription_checkout") return true;
    return !(lbl.includes("subscription") || lbl.includes("gmitra"));
  });

  const removedTax = round2(
    b.taxes
      .filter((t) => {
        const lbl = (t.label || "").toLowerCase();
        return lbl.includes("subscription") && t.meta?.source !== "customer_subscription_checkout";
      })
      .reduce((s, t) => s + t.amount, 0)
  );
  b.taxes = b.taxes.filter((t) => {
    const lbl = (t.label || "").toLowerCase();
    return !(lbl.includes("subscription") && t.meta?.source !== "customer_subscription_checkout");
  });

  b.misc_fee = round2(Math.max(0, b.misc_fee - removedSubtotal));
  b.tax_total = round2(Math.max(0, b.tax_total - removedTax));
  b.final_amount = round2(Math.max(0, b.final_amount - removedSubtotal - removedTax));

  if (b.gst_components.subscription && b.gst_components.subscription.gst > 0 && removedTax > 0) {
    b.gst_components = {
      ...b.gst_components,
      subscription: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
    };
  }

  return b;
}

function applyDeliveryBenefitToBilling(
  billing: BillingResult,
  input: SubscriptionBillingAdjustmentInput,
  benefit: SubscriptionDeliveryBenefit
): { billing: BillingResult; deliveryFeeWaivedInr: number } {
  const b = cloneBilling(billing);
  const oldDeliveryFee = b.delivery_fee;
  const newDeliveryFee = benefit.membershipDeliveryFeeInr;
  const waivedFee = benefit.waivedInr;

  const deliveryGstLine = b.gst_components.delivery ?? {
    original: oldDeliveryFee,
    discount: 0,
    taxable_value: oldDeliveryFee,
    gst: 0,
  };
  const oldDeliveryGst = round2(deliveryGstLine.gst ?? 0);
  const newDeliveryGst =
    oldDeliveryFee > 0.005
      ? round2(oldDeliveryGst * (newDeliveryFee / oldDeliveryFee))
      : 0;
  const gstReduction = round2(Math.max(0, oldDeliveryGst - newDeliveryGst));

  const discountLabel = benefit.isPartial
    ? `${input.planName} free delivery (${benefit.coveredRadiusKm} km covered)`
    : `${input.planName} free delivery`;

  const discountLine: AppliedLine = {
    kind: "discount",
    label: discountLabel,
    amount: waivedFee,
    meta: {
      source: "customer_subscription_free_delivery",
      planId: input.planId,
      maxFreeDeliveryRadiusKm: input.maxFreeDeliveryRadiusKm,
      distanceKm: input.distanceKm,
      partial: benefit.isPartial,
      excessDistanceKm: benefit.excessDistanceKm,
      membershipDeliveryFeeInr: newDeliveryFee,
    },
  };
  b.discounts.push(discountLine);
  b.breakdown_steps.push({
    step: discountLabel,
    amount: -waivedFee,
    meta: discountLine.meta,
  });
  b.discount_total = round2(b.discount_total + waivedFee);
  b.delivery_fee = newDeliveryFee;

  for (const charge of b.charges) {
    if (
      charge.kind === "charge" &&
      !charge.hidden &&
      charge.meta?.source !== "customer_subscription_delivery_waived_marker" &&
      charge.meta?.source !== "customer_subscription_checkout" &&
      charge.meta?.source !== "checkout_tipAmount" &&
      charge.meta?.source !== "checkout_donationAmount" &&
      /delivery/i.test(charge.label) &&
      Math.abs(charge.amount - oldDeliveryFee) < 0.05
    ) {
      charge.amount = newDeliveryFee;
      break;
    }
  }

  b.tax_total = round2(Math.max(0, b.tax_total - gstReduction));
  b.gst_components = {
    ...b.gst_components,
    delivery: {
      original: deliveryGstLine.original ?? oldDeliveryFee,
      discount: round2((deliveryGstLine.discount ?? 0) + waivedFee),
      taxable_value: newDeliveryFee,
      gst: newDeliveryGst,
    },
  };

  const finalDelta = round2(-(waivedFee + gstReduction));
  if (Math.abs(finalDelta) > 0.005) {
    b.final_amount = round2(Math.max(0, b.final_amount + finalDelta));
    b.gst_totals = {
      ...b.gst_totals,
      total_discount: b.discount_total,
      total_tax: b.tax_total,
      final_payable: b.final_amount,
    };
  }

  b.charges.push({
    kind: "charge",
    label: "__delivery_fee_waived_inr__",
    amount: waivedFee,
    hidden: true,
    meta: { source: "customer_subscription_delivery_waived_marker" },
  });

  return { billing: b, deliveryFeeWaivedInr: waivedFee };
}

export function applyCustomerSubscriptionToBilling(
  billing: BillingResult,
  input: SubscriptionBillingAdjustmentInput
): BillingResult {
  let b = cloneBilling(billing);

  if (input.subscriptionCharge && input.subscriptionCharge.subtotal > 0.005) {
    b = stripGenericSubscriptionCharges(b);
  }

  let finalDelta = 0;
  let deliveryFeeWaivedInr = 0;

  if (
    input.freeDeliveryEnabled &&
    input.distanceKm != null &&
    Number.isFinite(input.distanceKm) &&
    b.delivery_fee > 0.005
  ) {
    const benefit = computeSubscriptionDeliveryBenefit({
      distanceKm: input.distanceKm,
      coveredRadiusKm: input.maxFreeDeliveryRadiusKm,
      fullDeliveryFeeInr: b.delivery_fee,
      pricing: input.deliveryPricing,
    });
    if (benefit && benefit.waivedInr > 0.005) {
      const applied = applyDeliveryBenefitToBilling(b, input, benefit);
      b = applied.billing;
      deliveryFeeWaivedInr = applied.deliveryFeeWaivedInr;
    }
  }

  const charge = input.subscriptionCharge;
  if (charge && charge.subtotal > 0.005) {
    const subtotal = round2(charge.subtotal);
    const gstAmount = round2(charge.gstAmount);
    const total = round2(subtotal + gstAmount);

    b.charges.push({
      kind: "charge",
      label: charge.label,
      amount: subtotal,
      meta: {
        source: "customer_subscription_checkout",
        planId: input.planId,
        gstPercent: charge.gstPercent,
      },
    });
    b.breakdown_steps.push({
      step: charge.label,
      amount: subtotal,
      meta: { source: "customer_subscription_checkout", planId: input.planId },
    });
    b.misc_fee = round2(b.misc_fee + subtotal);
    finalDelta += subtotal;

    if (gstAmount > 0.005) {
      const taxLabel = `GST on ${charge.label}`;
      b.taxes.push({
        kind: "tax",
        label: taxLabel,
        amount: gstAmount,
        meta: {
          source: "customer_subscription_checkout",
          planId: input.planId,
          gstPercent: charge.gstPercent,
        },
      });
      b.breakdown_steps.push({ step: taxLabel, amount: gstAmount, meta: { planId: input.planId } });
      b.tax_total = round2(b.tax_total + gstAmount);
      finalDelta += gstAmount;
    }

    b.gst_components = {
      ...b.gst_components,
      subscription: {
        original: subtotal,
        discount: 0,
        taxable_value: subtotal,
        gst: gstAmount,
      },
    };
  }

  if (Math.abs(finalDelta) > 0.005) {
    b.final_amount = round2(Math.max(0, b.final_amount + finalDelta));
    b.gst_totals = {
      ...b.gst_totals,
      total_discount: b.discount_total,
      total_tax: b.tax_total,
      final_payable: b.final_amount,
    };
  }

  if (deliveryFeeWaivedInr > 0.005 && !b.charges.some((c) => c.meta?.source === "customer_subscription_delivery_waived_marker")) {
    b.charges.push({
      kind: "charge",
      label: "__delivery_fee_waived_inr__",
      amount: deliveryFeeWaivedInr,
      hidden: true,
      meta: { source: "customer_subscription_delivery_waived_marker" },
    });
  }

  return b;
}

export type { SubscriptionDeliveryBenefit };
