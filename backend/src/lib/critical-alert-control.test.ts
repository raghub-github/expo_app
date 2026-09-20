import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { riderDispatchAlertSessionId } from "./critical-alert-control.js";

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
