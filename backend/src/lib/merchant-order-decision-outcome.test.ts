import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyMerchantDecisionFailure,
  normalizeOrderStatusForTransition,
} from "./merchant-order-decision-outcome.js";

describe("merchant decision failure", () => {
  it("treats a loss to another device's accept as a conflict", () => {
    // Two counters tap at once: one accepts, the other's reject is refused.
    const out = classifyMerchantDecisionFailure("invalid_transition:ACCEPTED:CANCELLED");
    assert.equal(out.status, 409);
    assert.equal(out.code, "order_already_decided");
    assert.equal(out.message, "This order was already accepted on another device.");
    assert.equal(out.actualStatus, "ACCEPTED");
  });

  it("treats a loss to another device's reject as a conflict", () => {
    const out = classifyMerchantDecisionFailure("invalid_transition:CANCELLED:ACCEPTED");
    assert.equal(out.status, 409);
    assert.equal(out.code, "order_already_decided");
    assert.equal(out.message, "This order was already cancelled on another device.");
  });

  it("names the stage the order actually reached", () => {
    assert.match(
      classifyMerchantDecisionFailure("invalid_transition:OUT_FOR_DELIVERY:CANCELLED").message,
      /out for delivery/
    );
    assert.match(
      classifyMerchantDecisionFailure("invalid_transition:DELIVERED:CANCELLED").message,
      /delivered/
    );
  });

  it("still reports a genuinely illegal move from a pending order as a bad request", () => {
    // Nobody raced here — the order is pending and DELIVERED is simply not
    // reachable from it. That is the client's mistake, not a conflict.
    const out = classifyMerchantDecisionFailure("invalid_transition:CREATED:DELIVERED");
    assert.equal(out.status, 400);
    assert.equal(out.code, "invalid_transition");
    assert.equal(out.actualStatus, "CREATED");
  });

  it("counts every pending spelling as still-undecided", () => {
    for (const pending of ["CREATED", "NEW", "PLACED", "ORDER_RECEIVED", "ORDER_PLACED"]) {
      const out = classifyMerchantDecisionFailure(`invalid_transition:${pending}:DELIVERED`);
      assert.equal(out.code, "invalid_transition", `${pending} should not read as decided`);
    }
  });

  it("never leaks the raw transition string to staff", () => {
    for (const raw of [
      "invalid_transition:ACCEPTED:CANCELLED",
      "invalid_transition:CREATED:DELIVERED",
      "invalid_transition::",
    ]) {
      const out = classifyMerchantDecisionFailure(raw);
      assert.ok(!out.message.includes("invalid_transition"), raw);
      assert.ok(!out.message.includes("_"), `underscores left in: ${out.message}`);
    }
  });

  it("degrades to a readable sentence on a malformed input", () => {
    const out = classifyMerchantDecisionFailure("invalid_transition::");
    assert.equal(out.status, 400);
    assert.equal(out.actualStatus, "CREATED");
    assert.ok(out.message.length > 0);
  });
});

describe("order status normalisation", () => {
  it("folds every pending spelling to CREATED", () => {
    for (const raw of ["CREATED", "NEW", "PLACED", "ORDER_RECEIVED", "ORDER_PLACED"]) {
      assert.equal(normalizeOrderStatusForTransition(raw), "CREATED");
    }
  });

  it("folds lowercase and padded spellings too", () => {
    // The regression: REPLACE("NEW","CREATED") ran before UPPER in SQL, so a row
    // stored as "new" could be neither accepted nor rejected by the store.
    for (const raw of ["new", "created", "  new  ", "Placed", "order_placed"]) {
      assert.equal(normalizeOrderStatusForTransition(raw), "CREATED", raw);
    }
  });

  it("treats a missing status as pending", () => {
    assert.equal(normalizeOrderStatusForTransition(null), "CREATED");
    assert.equal(normalizeOrderStatusForTransition(undefined), "CREATED");
    assert.equal(normalizeOrderStatusForTransition("   "), "CREATED");
  });

  it("matches whole words, so a status merely containing NEW is untouched", () => {
    // The substring swap turned this into "RECREATEDED".
    assert.equal(normalizeOrderStatusForTransition("RENEWED"), "RENEWED");
  });

  it("leaves decided statuses alone", () => {
    for (const raw of ["ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "DELIVERED", "CANCELLED", "RTO"]) {
      assert.equal(normalizeOrderStatusForTransition(raw), raw);
    }
    assert.equal(normalizeOrderStatusForTransition("accepted"), "ACCEPTED");
  });
});
