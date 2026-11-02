import {
  decideOverlayRemount,
  OVERLAY_FAILURE_FORGET_MS,
  OVERLAY_MAX_REMOUNTS,
  OVERLAY_REMOUNT_DELAY_MS,
} from "@/src/lib/overlayRemountPolicy";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("decideOverlayRemount", () => {
  it("remounts after a first crash so the rider is not left blind to orders", () => {
    const d = decideOverlayRemount({ failureCount: 1, msSincePreviousFailure: null });
    assert.deepEqual(d, { remount: true, delayMs: OVERLAY_REMOUNT_DELAY_MS });
  });

  it("backs off further on each repeat", () => {
    const a = decideOverlayRemount({ failureCount: 2, msSincePreviousFailure: 100 });
    const b = decideOverlayRemount({ failureCount: 3, msSincePreviousFailure: 100 });
    assert.ok(a.remount && b.remount);
    assert.ok(b.delayMs > a.delayMs, "delay should grow");
  });

  it("gives up once the retry budget is spent, rather than crash-looping", () => {
    const d = decideOverlayRemount({
      failureCount: OVERLAY_MAX_REMOUNTS + 1,
      msSincePreviousFailure: 100,
    });
    assert.deepEqual(d, { remount: false, reason: "exhausted" });
  });

  it("forgives a crash that happened long ago", () => {
    // The overlay worked fine for minutes in between, so this is a new
    // incident, not a loop — it must get a full retry budget again.
    const d = decideOverlayRemount({
      failureCount: 99,
      msSincePreviousFailure: OVERLAY_FAILURE_FORGET_MS + 1,
    });
    assert.deepEqual(d, { remount: true, delayMs: OVERLAY_REMOUNT_DELAY_MS });
  });

  it("does not forgive a crash just inside the window", () => {
    const d = decideOverlayRemount({
      failureCount: OVERLAY_MAX_REMOUNTS + 1,
      msSincePreviousFailure: OVERLAY_FAILURE_FORGET_MS - 1,
    });
    assert.equal(d.remount, false);
  });

  it("treats a nonsensical zero/negative count as a first failure", () => {
    assert.deepEqual(decideOverlayRemount({ failureCount: 0, msSincePreviousFailure: null }), {
      remount: true,
      delayMs: OVERLAY_REMOUNT_DELAY_MS,
    });
  });

  it("always waits before remounting — never a synchronous retry", () => {
    for (let i = 1; i <= OVERLAY_MAX_REMOUNTS; i += 1) {
      const d = decideOverlayRemount({ failureCount: i, msSincePreviousFailure: 10 });
      assert.ok(d.remount && d.delayMs > 0, `attempt ${i} must delay`);
    }
  });
});

describe("decideOverlayRemount: the cap is what stops a crash loop", () => {
  it("stops remounting once the attempts are exhausted", () => {
    // Without a cap a deterministic crash remounts forever, burning battery
    // and flooding the logs while the rider sees nothing.
    const d = decideOverlayRemount({
      failureCount: OVERLAY_MAX_REMOUNTS + 1,
      msSincePreviousFailure: 100,
    });
    assert.equal(d.remount, false);
    assert.equal(d.remount === false && d.reason, "exhausted");
  });

  it("remounts up to the cap and refuses beyond it", () => {
    for (let n = 1; n <= OVERLAY_MAX_REMOUNTS; n += 1) {
      const d = decideOverlayRemount({ failureCount: n, msSincePreviousFailure: 100 });
      assert.equal(d.remount, true, `attempt ${n} of ${OVERLAY_MAX_REMOUNTS} must still retry`);
    }
    for (const n of [OVERLAY_MAX_REMOUNTS + 1, OVERLAY_MAX_REMOUNTS + 10, 1000]) {
      const d = decideOverlayRemount({ failureCount: n, msSincePreviousFailure: 100 });
      assert.equal(d.remount, false, `attempt ${n} is past the cap and must give up`);
    }
  });

  it("backs off further on each successive failure", () => {
    const delays: number[] = [];
    for (let n = 1; n <= OVERLAY_MAX_REMOUNTS; n += 1) {
      const d = decideOverlayRemount({ failureCount: n, msSincePreviousFailure: 100 });
      assert.equal(d.remount, true);
      if (d.remount) delays.push(d.delayMs);
    }
    for (let i = 1; i < delays.length; i += 1) {
      assert.ok(delays[i] > delays[i - 1], "each retry must wait longer than the last");
    }
  });

  it("forgives an old failure, so a crash long ago does not exhaust the budget", () => {
    const d = decideOverlayRemount({
      failureCount: OVERLAY_MAX_REMOUNTS + 50,
      msSincePreviousFailure: OVERLAY_FAILURE_FORGET_MS + 1,
    });
    assert.equal(d.remount, true, "a fresh incident must get a full budget again");
    assert.equal(d.remount === true && d.delayMs, OVERLAY_REMOUNT_DELAY_MS);
  });
});
