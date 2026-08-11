import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldAutoCancelNow } from "./rider-tracking-watchdog.service.js";

const MIN = 60_000;

describe("watchdog shouldAutoCancelNow (6b)", () => {
  it("off unless explicitly opted in", () => {
    const state = { acFirstBreachAtMs: 0, acLastWarnedAtMs: 0 };
    assert.equal(shouldAutoCancelNow({ autoCancelEnabled: false, graceMinutes: 0 }, state, 10 * MIN), false);
  });

  it("requires a prior warning (rider gets a chance first)", () => {
    const state = { acFirstBreachAtMs: 0, acLastWarnedAtMs: undefined };
    assert.equal(shouldAutoCancelNow({ autoCancelEnabled: true, graceMinutes: 0 }, state, 10 * MIN), false);
  });

  it("fires once breach persists past grace (after a warning)", () => {
    const state = { acFirstBreachAtMs: 0, acLastWarnedAtMs: 1 };
    // grace 5 min: not yet at 4 min, yes at 5 min
    assert.equal(shouldAutoCancelNow({ autoCancelEnabled: true, graceMinutes: 5 }, state, 4 * MIN), false);
    assert.equal(shouldAutoCancelNow({ autoCancelEnabled: true, graceMinutes: 5 }, state, 5 * MIN), true);
  });

  it("does not repeat once auto-cancelled", () => {
    const state = { acFirstBreachAtMs: 0, acLastWarnedAtMs: 1, acAutoCancelledAtMs: 3 * MIN };
    assert.equal(shouldAutoCancelNow({ autoCancelEnabled: true, graceMinutes: 0 }, state, 10 * MIN), false);
  });

  it("needs a first-breach timestamp", () => {
    assert.equal(
      shouldAutoCancelNow({ autoCancelEnabled: true, graceMinutes: 0 }, { acLastWarnedAtMs: 1 }, 10 * MIN),
      false
    );
  });
});
