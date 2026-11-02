import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { criticalAlertCollapseKey, riderDispatchAlertSessionId } from "./critical-alert-control.js";

describe("critical-alert-control session ids", () => {
  it("builds a stable rider session without realert suffix", () => {
    assert.equal(
      riderDispatchAlertSessionId({ orderId: "OFFER123", riderId: 9, waveNumber: 2 }),
      "RIDER_NEW_ORDER:OFFER123:9:2"
    );
    assert.equal(
      riderDispatchAlertSessionId({ orderId: "OFFER123", riderId: 9 }),
      "RIDER_NEW_ORDER:OFFER123:9"
    );
  });
});

/**
 * The collapse key is the only thing standing between an offline device and a
 * stale "start" being delivered after the "stop" that was meant to cancel it.
 * A merchant reported exactly that: accepting an order, powering the phone off
 * and on, and being rung again by the order they had already accepted.
 */
describe("criticalAlertCollapseKey", () => {
  const merchantSession = "MERCHANT_NEW_ORDER:100058:12";

  it("gives start and stop of one session the SAME key so the stop replaces a queued start", () => {
    // Both actions call it with the session id alone - that is the invariant.
    assert.equal(
      criticalAlertCollapseKey(merchantSession),
      criticalAlertCollapseKey(merchantSession)
    );
  });

  it("does not encode the action, which is what let both messages survive the queue", () => {
    const key = criticalAlertCollapseKey(merchantSession);
    assert.ok(!key.includes("start"), `collapse key must not mention the action: ${key}`);
    assert.ok(!key.includes("stop"), `collapse key must not mention the action: ${key}`);
  });

  it("keeps different orders apart", () => {
    assert.notEqual(
      criticalAlertCollapseKey("MERCHANT_NEW_ORDER:100058:12"),
      criticalAlertCollapseKey("MERCHANT_NEW_ORDER:100059:12")
    );
  });

  it("keeps the same order at different stores apart", () => {
    assert.notEqual(
      criticalAlertCollapseKey("MERCHANT_NEW_ORDER:100058:12"),
      criticalAlertCollapseKey("MERCHANT_NEW_ORDER:100058:13")
    );
  });

  it("gives a rider's next wave its own key, so an earlier stop cannot collapse it away", () => {
    const wave1 = riderDispatchAlertSessionId({ orderId: "ORD9", riderId: 4, waveNumber: 1 });
    const wave2 = riderDispatchAlertSessionId({ orderId: "ORD9", riderId: 4, waveNumber: 2 });
    assert.notEqual(wave1, wave2);
    assert.notEqual(criticalAlertCollapseKey(wave1), criticalAlertCollapseKey(wave2));
  });

  it("separates two riders offered the same order", () => {
    assert.notEqual(
      criticalAlertCollapseKey(riderDispatchAlertSessionId({ orderId: "ORD9", riderId: 4 })),
      criticalAlertCollapseKey(riderDispatchAlertSessionId({ orderId: "ORD9", riderId: 5 }))
    );
  });

  it("is stable against surrounding whitespace", () => {
    assert.equal(
      criticalAlertCollapseKey(`  ${merchantSession} `),
      criticalAlertCollapseKey(merchantSession)
    );
  });

  it("is prefixed so it cannot collide with another feature's collapse keys", () => {
    assert.ok(criticalAlertCollapseKey(merchantSession).startsWith("gm_alert_"));
  });
});
