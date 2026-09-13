import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateCompletedRepeats } from "./newOrderAlertManager";

test("estimateCompletedRepeats credits wall-clock passes", () => {
  const startedAt = 1_000_000;
  assert.equal(
    estimateCompletedRepeats({
      startedAt,
      now: startedAt + 100,
      configuredRepeats: 3,
      clipMs: 2500,
    }),
    0
  );
  assert.equal(
    estimateCompletedRepeats({
      startedAt,
      now: startedAt + 2600,
      configuredRepeats: 3,
      clipMs: 2500,
    }),
    1
  );
});

test("assumeOsPlayedOnce never forces completion beyond configured repeats", () => {
  const startedAt = 1_000_000;
  assert.equal(
    estimateCompletedRepeats({
      startedAt,
      now: startedAt,
      configuredRepeats: 1,
      clipMs: 2500,
      assumeOsPlayedOnce: true,
    }),
    1
  );
  assert.equal(
    estimateCompletedRepeats({
      startedAt,
      now: startedAt + 10_000,
      configuredRepeats: 2,
      clipMs: 2500,
      assumeOsPlayedOnce: true,
    }),
    2
  );
});
