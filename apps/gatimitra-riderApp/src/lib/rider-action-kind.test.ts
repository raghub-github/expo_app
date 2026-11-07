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
  it("caps at 8s with snappy first retry", () => {
    assert.ok(riderActionRetryDelayMs(8) <= 8_400);
    assert.ok(riderActionRetryDelayMs(0) >= 400);
    assert.ok(riderActionRetryDelayMs(0) < 1_000);
  });
});

// HttpError (from @/src/services/http) is matched structurally, not with
// instanceof, so that this module stays importable without react-native.
// These cases are what guarantee that swap did not change classification.
class FakeHttpError extends Error {
  status: number;
  constructor(status: number) {
    super(`http ${status}`);
    this.name = "HttpError";
    this.status = status;
  }
}

describe("classifyRiderActionFailure: HttpError shape", () => {
  it("classifies by status exactly as ApiError does", () => {
    assert.equal(classifyRiderActionFailure(new FakeHttpError(401)), "auth");
    assert.equal(classifyRiderActionFailure(new FakeHttpError(409)), "conflict");
    assert.equal(classifyRiderActionFailure(new FakeHttpError(503)), "server");
    assert.equal(classifyRiderActionFailure(new FakeHttpError(408)), "server");
    assert.equal(classifyRiderActionFailure(new FakeHttpError(429)), "server");
    assert.equal(classifyRiderActionFailure(new FakeHttpError(403)), "business");
  });

  it("does not read status off an unrelated error that happens to carry one", () => {
    // Previously impossible via instanceof; the name check preserves that.
    const rogue = Object.assign(new Error("Network request failed"), { status: 409 });
    assert.equal(classifyRiderActionFailure(rogue), "network");
  });

  it("ignores a non-numeric status on an HttpError", () => {
    const weird = new FakeHttpError(500);
    (weird as unknown as { status: unknown }).status = "500";
    // Falls through to message matching rather than throwing or mis-reading.
    assert.equal(classifyRiderActionFailure(weird), "business");
  });
});
