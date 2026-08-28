import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CUSTOMER_FOOD_PAGE_STORE_TYPES,
  matchesCustomerMerchantListStoreType,
} from "./merchantStoreTypeFilters.js";

describe("matchesCustomerMerchantListStoreType", () => {
  it("FOOD request includes restaurant verticals", () => {
    for (const st of ["RESTAURANT", "CLOUD_KITCHEN", "BAKERY", "CAFE", "FOOD"]) {
      assert.equal(matchesCustomerMerchantListStoreType(st, "FOOD"), true);
    }
    assert.equal(matchesCustomerMerchantListStoreType("GROCERY", "FOOD"), false);
  });

  it("GROCERY request is exact", () => {
    assert.equal(matchesCustomerMerchantListStoreType("GROCERY", "GROCERY"), true);
    assert.equal(matchesCustomerMerchantListStoreType("RESTAURANT", "GROCERY"), false);
  });

  it("exports food page set", () => {
    assert.equal(CUSTOMER_FOOD_PAGE_STORE_TYPES.has("RESTAURANT"), true);
    assert.equal(CUSTOMER_FOOD_PAGE_STORE_TYPES.has("GROCERY"), false);
  });
});
