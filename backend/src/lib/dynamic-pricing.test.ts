import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateDynamicSurcharges,
  applyDynamicSurchargesToBilling,
  computeDynamicSurchargeTotal,
  isDynamicRuleActiveNow,
  resolveOneDynamicSurcharge,
  splitDynamicByFunding,
  readDynamicRiderIncentiveFromSnapshot,
  type DynamicPricingRule,
} from "./dynamic-pricing.js";
import type { BillingResult } from "../modules/billing/types.js";

function rule(over: Partial<DynamicPricingRule>): DynamicPricingRule {
  return {
    id: 1, mode: "NIGHT", serviceType: "all", geoLevel: "state", geoRefId: "x", name: null,
    valueType: "FIXED", value: 0, maxAmount: null, funding: "customer", customerSharePct: 100,
    taxable: false, gstRate: 0, allDay: false, startTime: null, endTime: null, daysOfWeek: null,
    activeFrom: null, activeTo: null, manualActive: false, priority: 100, isActive: true, ...over,
  };
}

/** A Date whose IST wall-clock is the given hour:minute + ISO dow (server-tz independent).
 * 2026-01-04 is a Sunday, so day = 4 + dow lands on the intended weekday. */
function istDate(hour: number, minute = 0, dow = 1): Date {
  const base = Date.UTC(2026, 0, 4 + dow, hour, minute) - 330 * 60_000;
  return new Date(base);
}

describe("dynamic-pricing value math", () => {
  it("FIXED / PER_KM / PERCENTAGE / MULTIPLIER", () => {
    assert.equal(computeDynamicSurchargeTotal({ valueType: "FIXED", value: 20, maxAmount: null }, 200, 5), 20);
    assert.equal(computeDynamicSurchargeTotal({ valueType: "PER_KM", value: 4, maxAmount: null }, 200, 5), 20);
    assert.equal(computeDynamicSurchargeTotal({ valueType: "PERCENTAGE", value: 10, maxAmount: null }, 200, 5), 20);
    assert.equal(computeDynamicSurchargeTotal({ valueType: "MULTIPLIER", value: 1.1, maxAmount: null }, 200, 5), 20);
  });
  it("max caps the amount", () => {
    assert.equal(computeDynamicSurchargeTotal({ valueType: "PER_KM", value: 4, maxAmount: 15 }, 200, 5), 15);
  });
  it("multiplier <= 1 yields 0", () => {
    assert.equal(computeDynamicSurchargeTotal({ valueType: "MULTIPLIER", value: 1, maxAmount: null }, 200, 5), 0);
  });
});

describe("dynamic-pricing funding split", () => {
  it("customer / company / shared", () => {
    assert.deepEqual(splitDynamicByFunding(30, "customer", 100), { customerAmount: 30, companyAmount: 0 });
    assert.deepEqual(splitDynamicByFunding(30, "company", 100), { customerAmount: 0, companyAmount: 30 });
    assert.deepEqual(splitDynamicByFunding(30, "shared", 40), { customerAmount: 12, companyAmount: 18 });
  });
});

describe("dynamic-pricing time window (IST)", () => {
  it("cross-midnight night window 22:00–06:00", () => {
    const r = rule({ startTime: "22:00", endTime: "06:00" });
    assert.equal(isDynamicRuleActiveNow(r, istDate(23, 30)), true); // 23:30 in
    assert.equal(isDynamicRuleActiveNow(r, istDate(2, 0)), true);   // 02:00 in
    assert.equal(isDynamicRuleActiveNow(r, istDate(12, 0)), false); // noon out
  });
  it("same-day peak window 18:00–21:00", () => {
    const r = rule({ mode: "PEAK", startTime: "18:00", endTime: "21:00" });
    assert.equal(isDynamicRuleActiveNow(r, istDate(19, 0)), true);
    assert.equal(isDynamicRuleActiveNow(r, istDate(17, 59)), false);
    assert.equal(isDynamicRuleActiveNow(r, istDate(21, 0)), false); // end exclusive
  });
  it("days_of_week filter", () => {
    const r = rule({ allDay: true, daysOfWeek: [6, 0] }); // Sat, Sun
    assert.equal(isDynamicRuleActiveNow(r, istDate(12, 0, 6)), true);  // Sat
    assert.equal(isDynamicRuleActiveNow(r, istDate(12, 0, 3)), false); // Wed
  });
  it("manual override forces on regardless of time", () => {
    const r = rule({ mode: "MANUAL", manualActive: true, startTime: "18:00", endTime: "21:00" });
    assert.equal(isDynamicRuleActiveNow(r, istDate(3, 0)), true);
  });
  it("inactive rule never applies", () => {
    assert.equal(isDynamicRuleActiveNow(rule({ allDay: true, isActive: false }), istDate(12)), false);
  });
});

describe("dynamic-pricing apply to billing", () => {
  function baseBilling(): BillingResult {
    return {
      item_total: 200, addon_total: 0, discount_total: 0, delivery_fee: 0, delivery_fee_gross: 0,
      delivery_subsidy: 0, platform_fee: 0, packaging_fee: 0, surge_fee: 0, small_order_fee: 0,
      convenience_fee: 0, misc_fee: 0, tax_total: 0, tip_amount: 0, donation_amount: 0,
      final_amount: 200, items_net_after_discounts: 200, taxes_by_group: {},
      gst_components: {
        items: { original: 200, discount: 0, taxable_value: 200, gst: 0 },
        delivery: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
        platform: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
        surge: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
        packaging: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
        small_order: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
        convenience: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
        subscription: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
      },
      gst_totals: { total_discount: 0, total_tax: 0, final_payable: 200 },
      charges: [], discounts: [], taxes: [], breakdown_steps: [], ruleset_version: 1,
      eligible_subtotal: 200, order_line_eligibility: [], order_line_pricing: [],
    } as unknown as BillingResult;
  }

  it("customer-funded surcharge adds to surge_fee + final_amount", () => {
    const s = resolveOneDynamicSurcharge(rule({ valueType: "FIXED", value: 30, funding: "customer" }), 200, 5);
    const app = aggregateDynamicSurcharges([s]);
    const b = baseBilling();
    const { billing, companySubsidy } = applyDynamicSurchargesToBilling(b, app);
    assert.equal(billing.surge_fee, 30);
    assert.equal(billing.final_amount, 230);
    assert.equal(companySubsidy, 0);
    assert.equal(billing.charges.length, 1);
  });

  it("company-funded surcharge does NOT change the customer bill", () => {
    const s = resolveOneDynamicSurcharge(rule({ valueType: "FIXED", value: 30, funding: "company" }), 200, 5);
    const app = aggregateDynamicSurcharges([s]);
    const b = baseBilling();
    const { billing, companySubsidy } = applyDynamicSurchargesToBilling(b, app);
    assert.equal(billing.final_amount, 200); // unchanged
    assert.equal(companySubsidy, 30);
  });

  it("shared + taxable surcharge splits and taxes only the customer portion", () => {
    const s = resolveOneDynamicSurcharge(
      rule({ valueType: "FIXED", value: 40, funding: "shared", customerSharePct: 50, taxable: true, gstRate: 0.18 }),
      200, 5
    );
    // customer 20, company 20, gst 20*0.18=3.6
    assert.equal(s.customerAmount, 20);
    assert.equal(s.companyAmount, 20);
    assert.equal(s.customerGst, 3.6);
    const b = baseBilling();
    const { billing, companySubsidy } = applyDynamicSurchargesToBilling(b, aggregateDynamicSurcharges([s]));
    assert.equal(billing.surge_fee, 20);
    assert.equal(billing.tax_total, 3.6);
    assert.equal(billing.final_amount, 223.6);
    assert.equal(companySubsidy, 20);
    assert.equal(billing.taxes_by_group.surge, 3.6);
  });
});

describe("readDynamicRiderIncentiveFromSnapshot (rider offer/credit bridge)", () => {
  it("extracts company-funded subsidy + per-mode lines", () => {
    const snap = {
      company_dynamic_subsidy: 30,
      dynamic_surcharges: [
        { mode: "NIGHT", name: "Night", companyAmount: 20, customerAmount: 0 },
        { mode: "RAIN", name: "Rain", companyAmount: 10, customerAmount: 5 },
      ],
    };
    const r = readDynamicRiderIncentiveFromSnapshot(snap);
    assert.equal(r.amount, 30);
    assert.equal(r.lines.length, 2);
    assert.deepEqual(r.lines[0], { mode: "NIGHT", name: "Night", amount: 20 });
  });

  it("skips customer-only surcharges (companyAmount 0) and tolerates junk", () => {
    const snap = { company_dynamic_subsidy: 0, dynamic_surcharges: [{ mode: "PEAK", name: "Peak", companyAmount: 0, customerAmount: 15 }] };
    const r = readDynamicRiderIncentiveFromSnapshot(snap);
    assert.equal(r.amount, 0);
    assert.equal(r.lines.length, 0);
    assert.deepEqual(readDynamicRiderIncentiveFromSnapshot(null), { amount: 0, lines: [] });
    assert.deepEqual(readDynamicRiderIncentiveFromSnapshot("x"), { amount: 0, lines: [] });
  });
});
