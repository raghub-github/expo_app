import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  merchantDeliveredSettlementIdempotencyKey,
  shouldCreditMerchantOnDelivered,
} from "./payment-settlement.js";

describe("DELIVERED settlement idempotency (TEST 13–14)", () => {
  it("TEST 13 — webhook retry uses the same settle:order:{coreId} key", () => {
    const a = merchantDeliveredSettlementIdempotencyKey(42);
    const b = merchantDeliveredSettlementIdempotencyKey(42);
    assert.equal(a, "settle:order:42");
    assert.equal(a, b);
  });

  it("TEST 14 — order retry does not credit twice: already DELIVERED is a no-op", () => {
    assert.equal(shouldCreditMerchantOnDelivered("DELIVERED", "OUT_FOR_DELIVERY"), true);
    assert.equal(shouldCreditMerchantOnDelivered("DELIVERED", "DELIVERED"), false);
    assert.equal(shouldCreditMerchantOnDelivered("PREPARING", "CONFIRMED"), false);
  });
});
