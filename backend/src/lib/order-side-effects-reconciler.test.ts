import test from "node:test";
import assert from "node:assert/strict";
import { decideOrderSideEffects } from "./order-side-effects-reconciler.js";

test("both effects missing → heal both (delivery order)", () => {
  assert.deepEqual(
    decideOrderSideEffects({ hasDispatchSession: false, hasMerchantNotification: false, isSelfPickup: false }),
    { startDispatch: true, notifyMerchant: true }
  );
});

test("both effects already ran → heal nothing (steady state, no double work)", () => {
  assert.deepEqual(
    decideOrderSideEffects({ hasDispatchSession: true, hasMerchantNotification: true, isSelfPickup: false }),
    { startDispatch: false, notifyMerchant: false }
  );
});

test("dispatch started but merchant never notified → heal only the merchant alert", () => {
  assert.deepEqual(
    decideOrderSideEffects({ hasDispatchSession: true, hasMerchantNotification: false, isSelfPickup: false }),
    { startDispatch: false, notifyMerchant: true }
  );
});

test("merchant notified but dispatch never started → heal only dispatch", () => {
  assert.deepEqual(
    decideOrderSideEffects({ hasDispatchSession: false, hasMerchantNotification: true, isSelfPickup: false }),
    { startDispatch: true, notifyMerchant: false }
  );
});

test("self-pickup food NEVER starts dispatch, even with no session (no rider needed)", () => {
  assert.deepEqual(
    decideOrderSideEffects({ hasDispatchSession: false, hasMerchantNotification: false, isSelfPickup: true }),
    { startDispatch: false, notifyMerchant: true }
  );
  // self-pickup that already notified → nothing at all
  assert.deepEqual(
    decideOrderSideEffects({ hasDispatchSession: false, hasMerchantNotification: true, isSelfPickup: true }),
    { startDispatch: false, notifyMerchant: false }
  );
});
