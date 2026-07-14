import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dedupeSingletonChargeRules,
  narrowBillingRulesForService,
  preferServiceSpecificBillingRules,
} from "./billingRuleSelection.js";
import type { RuleRow } from "./types.js";

function rule(
  partial: Partial<RuleRow> & Pick<RuleRow, "id" | "type" | "serviceType">
): RuleRow {
  return {
    name: null,
    calculationType: "FIXED",
    valueNumeric: 5,
    valueJson: null,
    priority: partial.priority ?? 10,
    chargeOrderKey: partial.chargeOrderKey ?? partial.priority ?? 10,
    stackable: true,
    appliesTo: "ORDER",
    offerOwner: "GATIMITRA",
    isHidden: false,
    metadata: null,
    conditions: [],
    discountAppliesOn: "ITEMS_TOTAL",
    chargeSubtype: null,
    ...partial,
  };
}

describe("billingRuleSelection", () => {
  it("prefers RIDE-specific rules over ALL for the same charge type", () => {
    const rules = [
      rule({ id: 1, type: "PLATFORM_FEE", serviceType: "ALL", chargeOrderKey: 10 }),
      rule({ id: 2, type: "PLATFORM_FEE", serviceType: "RIDE", chargeOrderKey: 50 }),
    ];
    const out = preferServiceSpecificBillingRules(rules, "RIDE");
    assert.equal(out.length, 1);
    assert.equal(out[0]?.id, 2);
  });

  it("keeps only the first singleton charge rule per service line", () => {
    const rules = [
      rule({ id: 1, type: "PLATFORM_FEE", serviceType: "RIDE", chargeOrderKey: 50 }),
      rule({ id: 2, type: "PLATFORM_FEE", serviceType: "RIDE", chargeOrderKey: 30 }),
      rule({ id: 3, type: "CONVENIENCE_FEE", serviceType: "RIDE", chargeOrderKey: 40 }),
    ];
    const out = dedupeSingletonChargeRules(rules);
    assert.deepEqual(
      out.map((r) => r.id).sort(),
      [2, 3]
    );
  });

  it("narrows active RIDE billing rules for checkout", () => {
    const rules = [
      rule({ id: 1, type: "PLATFORM_FEE", serviceType: "ALL", chargeOrderKey: 10 }),
      rule({ id: 2, type: "PLATFORM_FEE", serviceType: "RIDE", chargeOrderKey: 50 }),
      rule({ id: 3, type: "PLATFORM_FEE", serviceType: "RIDE", chargeOrderKey: 30 }),
      rule({ id: 4, type: "DISCOUNT", serviceType: "RIDE", chargeOrderKey: 60 }),
    ];
    const out = narrowBillingRulesForService(rules, "RIDE");
    assert.deepEqual(
      out.map((r) => r.id).sort(),
      [3, 4]
    );
  });
});
