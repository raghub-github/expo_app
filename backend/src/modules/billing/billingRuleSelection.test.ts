import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dedupeSingletonChargeRules,
  narrowBillingRulesForService,
  narrowTaxConfigsForService,
  preferServiceSpecificBillingRules,
} from "./billingRuleSelection.js";
import type { TaxConfigRow } from "./types.js";
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

  it("GROCERY inherits FOOD charge rules and GST slabs", () => {
    const rules = [
      rule({ id: 1, type: "PLATFORM_FEE", serviceType: "FOOD", chargeOrderKey: 10 }),
      rule({ id: 2, type: "DELIVERY", serviceType: "FOOD", chargeOrderKey: 20 }),
      rule({ id: 3, type: "PLATFORM_FEE", serviceType: "GROCERY", chargeOrderKey: 99 }),
    ];
    const narrowed = narrowBillingRulesForService(rules, "GROCERY");
    assert.deepEqual(
      narrowed.map((r) => r.id).sort(),
      [1, 2]
    );

    const taxes: TaxConfigRow[] = [
      {
        id: 10,
        name: "GST items",
        rate: 0.05,
        applicableBase: "ITEM_AFTER_DISCOUNT",
        taxGroup: "item",
        priority: 1,
        chargeOrderKey: 1,
        isHidden: false,
        serviceType: "FOOD",
      },
      {
        id: 11,
        name: "GROCERY-only",
        rate: 0.12,
        applicableBase: "ITEM_AFTER_DISCOUNT",
        taxGroup: "item",
        priority: 2,
        chargeOrderKey: 2,
        isHidden: false,
        serviceType: "GROCERY",
      },
    ];
    const taxOut = narrowTaxConfigsForService(taxes, "GROCERY");
    assert.equal(taxOut.length, 1);
    assert.equal(taxOut[0]?.id, 10);
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
