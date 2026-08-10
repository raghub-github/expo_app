import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRiderFaultCancellation } from "./credit-rider-pre-pickup-on-cancel.js";

describe("pre-pickup-on-cancel fault attribution", () => {
  it("RIDER-attributed reason = rider fault → no first-mile credit", () => {
    assert.equal(isRiderFaultCancellation("RIDER", "rider"), true);
    assert.equal(isRiderFaultCancellation("rider", "system"), true);
  });

  it("non-rider attribution = not rider fault → creditable", () => {
    assert.equal(isRiderFaultCancellation("CUSTOMER", "customer"), false);
    assert.equal(isRiderFaultCancellation("RESTAURANT", "store"), false);
    assert.equal(isRiderFaultCancellation("SYSTEM", "system"), false);
  });

  it("no attribute + rider cancelled = treated as rider's call → no credit", () => {
    assert.equal(isRiderFaultCancellation(null, "rider"), true);
    assert.equal(isRiderFaultCancellation("", "rider"), true);
  });

  it("no attribute + non-rider actor = creditable", () => {
    assert.equal(isRiderFaultCancellation(null, "customer"), false);
    assert.equal(isRiderFaultCancellation(null, "system"), false);
    assert.equal(isRiderFaultCancellation(undefined, "store"), false);
  });
});
