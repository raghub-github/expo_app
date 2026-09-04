import {
  classifyRiderActionFailure,
  isRetryableRiderActionFailure,
  riderActionRetryDelayMs,
  RiderActionBusyError,
} from "@/src/lib/rider-action-kind";
import { ApiError, NetworkTimeoutError } from "@gatimitra/sdk";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("classifyRiderActionFailure", () => {
  it("classifies NetworkTimeoutError as timeout", () => {
    assert.equal(classifyRiderActionFailure(new NetworkTimeoutError(20_000)), "timeout");
  });

  it("classifies 409 as conflict", () => {
    assert.equal(classifyRiderActionFailure(new ApiError("conflict", 409, { code: "X" })), "conflict");
  });

  it("classifies 401 as auth", () => {
    assert.equal(classifyRiderActionFailure(new ApiError("nope", 401, {})), "auth");
  });

  it("classifies 5xx as server", () => {
    assert.equal(classifyRiderActionFailure(new ApiError("boom", 503, {})), "server");
  });

  it("classifies 403 as business", () => {
    assert.equal(classifyRiderActionFailure(new ApiError("otp", 403, {})), "business");
  });

  it("classifies inflight as busy", () => {
    assert.equal(classifyRiderActionFailure(new RiderActionBusyError()), "busy");
  });

  it("classifies fetch failures as network", () => {
    assert.equal(classifyRiderActionFailure(new TypeError("Network request failed")), "network");
  });
});

describe("isRetryableRiderActionFailure", () => {
  it("retries timeout/network/server only", () => {
    assert.equal(isRetryableRiderActionFailure("timeout"), true);
    assert.equal(isRetryableRiderActionFailure("network"), true);
    assert.equal(isRetryableRiderActionFailure("server"), true);
    assert.equal(isRetryableRiderActionFailure("conflict"), false);
    assert.equal(isRetryableRiderActionFailure("business"), false);
    assert.equal(isRetryableRiderActionFailure("auth"), false);
    assert.equal(isRetryableRiderActionFailure("busy"), false);
  });
});

describe("riderActionRetryDelayMs", () => {
  it("caps at 15s", () => {
    assert.ok(riderActionRetryDelayMs(8) <= 15_400);
    assert.ok(riderActionRetryDelayMs(0) >= 1_000);
  });
});
