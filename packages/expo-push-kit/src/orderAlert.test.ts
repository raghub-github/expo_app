import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractAlertSessionId,
  merchantAlertSessionId,
  riderAlertSessionId,
  riderSoundTypeForService,
} from "./orderAlertIds";

describe("orderAlert session ids", () => {
  it("builds stable merchant session ids from order + store", () => {
    assert.equal(merchantAlertSessionId("100046", 12), "MERCHANT_NEW_ORDER:100046:12");
    assert.equal(merchantAlertSessionId("GMF100046"), "merchant-order-GMF100046");
  });

  it("builds stable rider session ids without realert suffix", () => {
    assert.equal(
      riderAlertSessionId({ orderId: "OFFER123", riderId: 9, waveNumber: 2 }),
      "RIDER_NEW_ORDER:OFFER123:9:2"
    );
    assert.equal(riderAlertSessionId({ orderId: "OFFER123" }), "rider-offer-OFFER123");
  });

  it("maps rider service to bundled wav names", () => {
    assert.equal(riderSoundTypeForService("food"), "food_order");
    assert.equal(riderSoundTypeForService("parcel"), "parcel_order");
    assert.equal(riderSoundTypeForService("person_ride"), "ride_order");
    assert.equal(riderSoundTypeForService("unknown"), "notification");
  });

  it("reads alertSessionId from push data", () => {
    assert.equal(
      extractAlertSessionId({ alertSessionId: "MERCHANT_NEW_ORDER:1:2" }),
      "MERCHANT_NEW_ORDER:1:2"
    );
    assert.equal(extractAlertSessionId({ foo: 1 }), null);
  });
});
