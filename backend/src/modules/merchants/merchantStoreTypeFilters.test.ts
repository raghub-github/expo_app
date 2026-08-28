import { describe, expect, it } from "vitest";
import {
  CUSTOMER_FOOD_PAGE_STORE_TYPES,
  matchesCustomerMerchantListStoreType,
} from "./merchantStoreTypeFilters.js";

describe("matchesCustomerMerchantListStoreType", () => {
  it("FOOD request includes restaurant verticals", () => {
    for (const st of ["RESTAURANT", "CLOUD_KITCHEN", "BAKERY", "CAFE", "FOOD"]) {
      expect(matchesCustomerMerchantListStoreType(st, "FOOD")).toBe(true);
    }
    expect(matchesCustomerMerchantListStoreType("GROCERY", "FOOD")).toBe(false);
  });

  it("GROCERY request is exact", () => {
    expect(matchesCustomerMerchantListStoreType("GROCERY", "GROCERY")).toBe(true);
    expect(matchesCustomerMerchantListStoreType("RESTAURANT", "GROCERY")).toBe(false);
  });

  it("exports food page set", () => {
    expect(CUSTOMER_FOOD_PAGE_STORE_TYPES.has("RESTAURANT")).toBe(true);
    expect(CUSTOMER_FOOD_PAGE_STORE_TYPES.has("GROCERY")).toBe(false);
  });
});
