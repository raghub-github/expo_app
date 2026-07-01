import { describe, expect, it } from "vitest";
import {
  BULK_ORDER_GRAND_TOTAL_THRESHOLD_INR,
  resolveBulkOrderPlacement,
} from "./bulk-order.js";

describe("resolveBulkOrderPlacement", () => {
  it("flags orders above threshold as bulk with group id", () => {
    const result = resolveBulkOrderPlacement(1201, "GM50001");
    expect(result.isBulkOrder).toBe(true);
    expect(result.bulkOrderGroupId).toBe("BULK-GM50001");
  });

  it("does not flag orders at or below threshold", () => {
    expect(resolveBulkOrderPlacement(1200, "GM50002").isBulkOrder).toBe(false);
    expect(resolveBulkOrderPlacement(1200, "GM50002").bulkOrderGroupId).toBeNull();
    expect(resolveBulkOrderPlacement(500, "GM50003").isBulkOrder).toBe(false);
  });

  it("uses configured threshold constant", () => {
    expect(BULK_ORDER_GRAND_TOTAL_THRESHOLD_INR).toBe(1200);
  });
});
