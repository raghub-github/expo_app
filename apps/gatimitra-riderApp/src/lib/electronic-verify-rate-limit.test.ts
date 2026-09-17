import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseElectronicVerifyRateLimitFromLimitsMap,
  parseElectronicVerifyRateLimitFromResponse,
  readElectronicVerifyRateLimitPayload,
} from "./electronic-verify-rate-limit-parse.ts";
import {
  isElectronicVerifyRateLimitMessage,
  normalizeAppliedElectronicVerifyRateLimit,
} from "./electronic-verify-rate-limit-normalize.ts";

describe("electronic verify rate limit — permanently disabled", () => {
  it("parsers always return null (never create a timed lock)", () => {
    const until = new Date(Date.now() + 19 * 3600_000).toISOString();
    const cappedPayload = {
      forceManual: true,
      rateLimited: true,
      allowed: false,
      attemptsUsed: 2,
      maxAttempts: 2,
      retryAfterSec: 86400,
      resetsAt: until,
      rateLimitedUntil: until,
      error: "verify_rate_limited",
      docKind: "vehicle_rc",
    };
    assert.equal(readElectronicVerifyRateLimitPayload(cappedPayload, "vehicle_rc"), null);
    assert.equal(parseElectronicVerifyRateLimitFromResponse(cappedPayload, "vehicle_rc"), null);
    assert.equal(
      parseElectronicVerifyRateLimitFromLimitsMap({ vehicle_rc: cappedPayload }, "vehicle_rc"),
      null,
    );
  });

  it("normalize never locks / never invents 23h59m from relative retry", () => {
    assert.equal(
      normalizeAppliedElectronicVerifyRateLimit(
        {
          limited: true,
          retryAfterSec: 24 * 3600,
          resetsAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
          message: "capped",
          docKind: "vehicle_rc",
        },
        "vehicle_rc",
      ),
      null,
    );
    assert.equal(
      normalizeAppliedElectronicVerifyRateLimit(
        {
          limited: true,
          retryAfterSec: 24 * 3600,
          resetsAt: null,
          message: "capped",
          docKind: "vehicle_rc",
        },
        "vehicle_rc",
        { allowRelativeAnchor: true },
      ),
      null,
    );
  });

  it("rate-limit message detection always false", () => {
    assert.equal(
      isElectronicVerifyRateLimitMessage(
        "You have used 2 Verify Instantly attempts in the last 24 hours.",
      ),
      false,
    );
    assert.equal(isElectronicVerifyRateLimitMessage("Invalid DL number"), false);
  });
});
