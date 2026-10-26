import test from "node:test";
import assert from "node:assert/strict";
import { resolveCheckoutFulfillmentAddress } from "./fulfillment-address.js";

test("delivery orders require a customer address", () => {
  const missing = resolveCheckoutFulfillmentAddress({ deliveryType: "delivery" });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "INVALID_ADDRESS_DATA");

  const omitted = resolveCheckoutFulfillmentAddress({ addressId: "12" });
  assert.equal(omitted.ok, true);
  if (omitted.ok) {
    assert.equal(omitted.selfPickup, false);
    assert.equal(omitted.addressId, 12);
  }
});

test("a takeaway flag does not waive the address on a delivery order", () => {
  for (const deliveryType of ["delivery", "takeaway", "pickup", "", null, undefined]) {
    const result = resolveCheckoutFulfillmentAddress({ deliveryType, addressId: null });
    if (deliveryType === "self_pickup") continue;
    assert.equal(result.ok, false, String(deliveryType));
  }
});

test("self_pickup does not require a customer address and does not keep one", () => {
  const bare = resolveCheckoutFulfillmentAddress({ deliveryType: "self_pickup" });
  assert.deepEqual(bare, { ok: true, selfPickup: true, addressId: null });

  const withAddress = resolveCheckoutFulfillmentAddress({
    deliveryType: "self_pickup",
    addressId: "99",
  });
  assert.deepEqual(withAddress, { ok: true, selfPickup: true, addressId: null });
});

test("invalid delivery address ids are rejected", () => {
  const bad = resolveCheckoutFulfillmentAddress({ deliveryType: "delivery", addressId: "abc" });
  assert.equal(bad.ok, false);
});
