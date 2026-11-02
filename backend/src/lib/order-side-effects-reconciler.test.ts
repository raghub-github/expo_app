import test from "node:test";
import assert from "node:assert/strict";
import { decideOrderSideEffects } from "./order-side-effects-reconciler.js";
import { shouldClearOrderNotifications } from "./clear-merchant-order-notifications.js";

/** Default for the pre-existing cases: an order still waiting on the merchant. */
const PENDING = { awaitingMerchantAcceptance: true };

test("both effects missing → heal both (delivery order)", () => {
  assert.deepEqual(
    decideOrderSideEffects({ hasDispatchSession: false, hasMerchantNotification: false, isSelfPickup: false, ...PENDING }),
    { startDispatch: true, notifyMerchant: true }
  );
});

test("both effects already ran → heal nothing (steady state, no double work)", () => {
  assert.deepEqual(
    decideOrderSideEffects({ hasDispatchSession: true, hasMerchantNotification: true, isSelfPickup: false, ...PENDING }),
    { startDispatch: false, notifyMerchant: false }
  );
});

test("dispatch started but merchant never notified → heal only the merchant alert", () => {
  assert.deepEqual(
    decideOrderSideEffects({ hasDispatchSession: true, hasMerchantNotification: false, isSelfPickup: false, ...PENDING }),
    { startDispatch: false, notifyMerchant: true }
  );
});

test("merchant notified but dispatch never started → heal only dispatch", () => {
  assert.deepEqual(
    decideOrderSideEffects({ hasDispatchSession: false, hasMerchantNotification: true, isSelfPickup: false, ...PENDING }),
    { startDispatch: true, notifyMerchant: false }
  );
});

test("self-pickup food NEVER starts dispatch, even with no session (no rider needed)", () => {
  assert.deepEqual(
    decideOrderSideEffects({ hasDispatchSession: false, hasMerchantNotification: false, isSelfPickup: true, ...PENDING }),
    { startDispatch: false, notifyMerchant: true }
  );
  // self-pickup that already notified → nothing at all
  assert.deepEqual(
    decideOrderSideEffects({ hasDispatchSession: false, hasMerchantNotification: true, isSelfPickup: true, ...PENDING }),
    { startDispatch: false, notifyMerchant: false }
  );
});

/**
 * The regression this gate exists for.
 *
 * Accepting an order DELETES its merchant_store_notifications row, and
 * ACCEPTED / PREPARING / READY_FOR_PICKUP are all in the rider-dispatchable
 * status list the candidate query filters on. So without the gate the
 * reconciler saw "no merchant notification" on an accepted order and re-sent
 * the NEW ORDER alert — gmAlertAction:"start" — ringing the buzzer again, every
 * tick, until a rider was assigned or the order aged out.
 */
test("accepted order with its notification cleared is NEVER re-notified", () => {
  assert.deepEqual(
    decideOrderSideEffects({
      hasDispatchSession: true,
      hasMerchantNotification: false, // deleted by the accept
      isSelfPickup: false,
      awaitingMerchantAcceptance: false,
    }),
    { startDispatch: false, notifyMerchant: false }
  );
});

test("a decided order still gets dispatch healed — only the merchant alert is suppressed", () => {
  // A rider is legitimately dispatched for ACCEPTED/PREPARING orders, so
  // suppressing the alert must not suppress dispatch healing too.
  assert.deepEqual(
    decideOrderSideEffects({
      hasDispatchSession: false,
      hasMerchantNotification: false,
      isSelfPickup: false,
      awaitingMerchantAcceptance: false,
    }),
    { startDispatch: true, notifyMerchant: false }
  );
});

test("the gate is what suppresses it — the same input while pending DOES notify", () => {
  const decided = decideOrderSideEffects({
    hasDispatchSession: true,
    hasMerchantNotification: false,
    isSelfPickup: false,
    awaitingMerchantAcceptance: false,
  });
  const pending = decideOrderSideEffects({
    hasDispatchSession: true,
    hasMerchantNotification: false,
    isSelfPickup: false,
    awaitingMerchantAcceptance: true,
  });
  assert.equal(decided.notifyMerchant, false);
  assert.equal(pending.notifyMerchant, true);
});

test("self-pickup that was already decided heals nothing at all", () => {
  assert.deepEqual(
    decideOrderSideEffects({
      hasDispatchSession: false,
      hasMerchantNotification: false,
      isSelfPickup: true,
      awaitingMerchantAcceptance: false,
    }),
    { startDispatch: false, notifyMerchant: false }
  );
});

/**
 * The reconciler derives awaitingMerchantAcceptance from the negation of
 * shouldClearOrderNotifications. Pin that relationship here: if a status
 * clears merchant order notifications, the reconciler must never recreate
 * them. Letting these two drift reopens the bug.
 */
test("every status that clears notifications also blocks re-notifying", () => {
  const statuses = [
    "CREATED",
    "NEW",
    "ORDER_PLACED",
    "PENDING",
    "ACCEPTED",
    "PREPARING",
    "READY_FOR_PICKUP",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CANCELLED",
    "REJECTED",
  ];
  for (const status of statuses) {
    const clears = shouldClearOrderNotifications(status);
    const decision = decideOrderSideEffects({
      hasDispatchSession: true,
      hasMerchantNotification: false,
      isSelfPickup: false,
      awaitingMerchantAcceptance: !clears,
    });
    assert.equal(
      decision.notifyMerchant,
      !clears,
      `${status}: clears=${clears} must imply notifyMerchant=${!clears}`
    );
  }
});

test("the three statuses that caused the report are all suppressed", () => {
  // These are the rider-dispatchable statuses an accepted order sits in, which
  // is why they reached the reconciler at all.
  for (const status of ["ACCEPTED", "PREPARING", "READY_FOR_PICKUP"]) {
    assert.equal(shouldClearOrderNotifications(status), true, `${status} should clear`);
    assert.equal(
      decideOrderSideEffects({
        hasDispatchSession: true,
        hasMerchantNotification: false,
        isSelfPickup: false,
        awaitingMerchantAcceptance: !shouldClearOrderNotifications(status),
      }).notifyMerchant,
      false,
      `${status} must never re-notify`
    );
  }
});

test("a genuinely pending order is still healed — the fix must not break healing", () => {
  for (const status of ["CREATED", "NEW", "ORDER_PLACED", "PENDING"]) {
    assert.equal(shouldClearOrderNotifications(status), false, `${status} should NOT clear`);
    assert.equal(
      decideOrderSideEffects({
        hasDispatchSession: true,
        hasMerchantNotification: false,
        isSelfPickup: false,
        awaitingMerchantAcceptance: !shouldClearOrderNotifications(status),
      }).notifyMerchant,
      true,
      `${status} must still be healed`
    );
  }
});
