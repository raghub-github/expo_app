import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeNativeAcceptOutcome } from "./nativeAcceptOutcome";

describe("native accept outcome", () => {
  it("reports a confirmed accept", () => {
    assert.deepEqual(
      describeNativeAcceptOutcome({ result: "ok", httpStatus: 200, detail: "" }),
      { kind: "accepted" }
    );
  });

  it("stays silent while the accept is still in flight", () => {
    // The refreshed order lists answer this one; a toast either way would guess.
    assert.deepEqual(
      describeNativeAcceptOutcome({ result: "pending", httpStatus: 0, detail: "" }),
      { kind: "unresolved" }
    );
  });

  it("prefers the server's reason over a status-code guess", () => {
    const outcome = describeNativeAcceptOutcome({
      result: "failed",
      httpStatus: 409,
      detail: "Another rider accepted this order.",
    });
    assert.deepEqual(outcome, {
      kind: "failed",
      message: "Another rider accepted this order.",
    });
  });

  it("asks for a fresh sign-in on an expired token", () => {
    for (const httpStatus of [401, 403]) {
      const outcome = describeNativeAcceptOutcome({ result: "failed", httpStatus, detail: "" });
      assert.equal(outcome.kind, "failed");
      assert.match(outcome.kind === "failed" ? outcome.message : "", /Sign in again/);
    }
  });

  it("names a missing sign-in even though it never reached the network", () => {
    const outcome = describeNativeAcceptOutcome({
      result: "failed",
      httpStatus: 0,
      detail: "not_signed_in",
    });
    assert.equal(outcome.kind, "failed");
    assert.match(outcome.kind === "failed" ? outcome.message : "", /Sign in again/);
  });

  it("says the order was not accepted when the request never left the device", () => {
    const outcome = describeNativeAcceptOutcome({
      result: "failed",
      httpStatus: 0,
      detail: "network",
    });
    assert.equal(outcome.kind, "failed");
    assert.match(outcome.kind === "failed" ? outcome.message : "", /not accepted/);
  });

  it("falls back to an availability message when the server sent no reason", () => {
    const outcome = describeNativeAcceptOutcome({ result: "failed", httpStatus: 409, detail: "" });
    assert.deepEqual(outcome, { kind: "failed", message: "That order is no longer available." });
  });
});
