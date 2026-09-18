import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRiderElectronicVerifyRateLimitFromAttempts,
  checkRiderElectronicVerifyRateLimit,
  riderElectronicVerifyRateLimitKey,
  riderVerifyRateLimitPayload,
  tryConsumeRiderElectronicVerifyAttempt,
} from "./rider-electronic-verify-rate-limit.js";

describe("rider electronic verify rate limit — removed (always allow)", () => {
  it("never invents a cooldown from attempt history", () => {
    const limit = buildRiderElectronicVerifyRateLimitFromAttempts({
      attemptsUsed: 99,
      oldest: new Date(Date.now() - 60_000),
      newest: new Date(),
    });
    assert.equal(limit.allowed, true);
    assert.equal(limit.rateLimitedUntil, null);
    assert.equal(limit.resetsAt, null);
    assert.equal(limit.retryAfterSec, 0);
  });

  it("per-doc keys remain distinct (diagnostics only)", () => {
    const rc = riderElectronicVerifyRateLimitKey(42, "vehicle_rc");
    const dl = riderElectronicVerifyRateLimitKey(42, "driving_licence");
    assert.notEqual(rc, dl);
  });

  it("payload never signals rateLimited / forceManual", () => {
    const payload = riderVerifyRateLimitPayload(
      buildRiderElectronicVerifyRateLimitFromAttempts({ attemptsUsed: 2 }),
      "aadhaar",
    );
    assert.equal(payload.rateLimited, false);
    assert.equal(payload.forceManual, false);
    assert.equal(payload.rateLimitedUntil, null);
    assert.equal(payload.error, null);
  });

  it("check + consume always allow (no DB required)", async () => {
    const checked = await checkRiderElectronicVerifyRateLimit(1, "pan");
    assert.equal(checked.allowed, true);
    const consumed = await tryConsumeRiderElectronicVerifyAttempt(1, "vehicle_rc");
    assert.equal(consumed.consumed, true);
    assert.equal(consumed.allowed, true);
  });
});
