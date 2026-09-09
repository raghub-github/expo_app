import test from "node:test";
import assert from "node:assert/strict";
import { isSelfPickupFulfillment } from "./self-pickup.js";

test("detects self-pickup from delivery_type variants", () => {
  for (const v of ["self_pickup", "takeaway", "take_away", "pickup", "SELF_PICKUP", " Takeaway "]) {
    assert.equal(isSelfPickupFulfillment(v), true, v);
  }
});

test("delivery orders are not self-pickup", () => {
  assert.equal(isSelfPickupFulfillment("delivery"), false);
  assert.equal(isSelfPickupFulfillment(null), false);
  assert.equal(isSelfPickupFulfillment(undefined), false);
  assert.equal(isSelfPickupFulfillment(""), false);
});

test("detects self-pickup from billing snapshot", () => {
  assert.equal(isSelfPickupFulfillment("delivery", { deliveryType: "self_pickup" }), true);
  assert.equal(isSelfPickupFulfillment("delivery", { delivery_type: "self_pickup" }), true);
  assert.equal(isSelfPickupFulfillment("delivery", { isSelfPickup: true }), true);
  assert.equal(isSelfPickupFulfillment("delivery", { isSelfPickup: false }), false);
});

test("detects self-pickup from checkout metadata", () => {
  assert.equal(isSelfPickupFulfillment("delivery", null, { deliveryType: "takeaway" }), true);
  assert.equal(isSelfPickupFulfillment("delivery", null, { delivery_type: "self_pickup" }), true);
  assert.equal(isSelfPickupFulfillment("delivery", null, { deliveryType: "delivery" }), false);
});
