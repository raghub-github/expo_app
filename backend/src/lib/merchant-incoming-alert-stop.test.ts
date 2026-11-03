import test from "node:test";
import assert from "node:assert/strict";

import {
  MERCHANT_ALERT_STOP_DEADLINE_MS,
  awaitAlertStopWithin,
} from "./merchant-incoming-alert-stop.js";

/**
 * The accept/reject routes await the cross-device stop so the acting phone's
 * HTTP success cannot beat the FCM stop to the other phones. `sendFcmV1` has no
 * timeout of its own, so that await is only safe while it is bounded - these
 * tests are what keep the bound honest.
 */
test("awaitAlertStopWithin", async (t) => {
  await t.test("returns settled as soon as the stop finishes", async () => {
    const started = Date.now();
    const outcome = await awaitAlertStopWithin(Promise.resolve(), 5_000);
    assert.equal(outcome, "settled");
    assert.ok(
      Date.now() - started < 1_000,
      "a stop that already resolved must not wait for the deadline"
    );
  });

  await t.test("gives up on a stop that never settles", async () => {
    const outcome = await awaitAlertStopWithin(new Promise(() => {}), 20);
    assert.equal(outcome, "timed-out");
  });

  await t.test("a failing stop is reported as settled, not thrown", async () => {
    // The caller's job is to answer the merchant, not to surface FCM errors:
    // a rejection here must never turn an accepted order into a 500.
    const outcome = await awaitAlertStopWithin(
      Promise.reject(new Error("fcm unreachable")),
      5_000
    );
    assert.equal(outcome, "settled");
  });

  await t.test(
    "a stop that rejects AFTER the deadline does not become an unhandled rejection",
    async () => {
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      process.on("unhandledRejection", onUnhandled);
      try {
        const slow = new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error("late fcm failure")), 30);
        });
        assert.equal(await awaitAlertStopWithin(slow, 5), "timed-out");
        // Past the rejection, and past the turn it would surface on.
        await new Promise((resolve) => setTimeout(resolve, 80));
        assert.deepEqual(unhandled, []);
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }
    }
  );

  await t.test("the default deadline is long enough to be useful", () => {
    // Short enough that a merchant never notices, long enough that a healthy
    // FCM round trip is never abandoned.
    assert.ok(MERCHANT_ALERT_STOP_DEADLINE_MS >= 1_000);
    assert.ok(MERCHANT_ALERT_STOP_DEADLINE_MS <= 5_000);
  });

  await t.test("a zero or negative deadline still resolves", async () => {
    assert.equal(await awaitAlertStopWithin(new Promise(() => {}), 0), "timed-out");
    assert.equal(await awaitAlertStopWithin(new Promise(() => {}), -5), "timed-out");
  });
});
