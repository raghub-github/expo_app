import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deadlineEpochMs, serializeNativeAlertDetails } from "./orderAlertDetails";

describe("serializeNativeAlertDetails", () => {
  it("keeps flat primitives as strings, using the FCM payload keys", () => {
    const json = serializeNativeAlertDetails({
      pickupAddress: "  MG Road, Kolkata ",
      dropAddress: "Salt Lake",
      amount: 75,
      toPickupKm: 1.2,
      surgeEarning: 20,
      isAdditional: false,
    });
    assert.deepEqual(JSON.parse(String(json)), {
      pickupAddress: "MG Road, Kolkata",
      dropAddress: "Salt Lake",
      amount: "75",
      toPickupKm: "1.2",
      surgeEarning: "20",
      isAdditional: "false",
    });
  });

  it("drops values the card must never print (null / NaN / blank / nested)", () => {
    const json = serializeNativeAlertDetails({
      a: null,
      b: undefined,
      c: Number.NaN,
      d: Number.POSITIVE_INFINITY,
      e: "   ",
      f: "null",
      g: { nested: 1 },
      h: [1, 2],
      keep: "ok",
    });
    assert.deepEqual(JSON.parse(String(json)), { keep: "ok" });
  });

  it("returns null when nothing is left, so the bridge falls back to startAlert", () => {
    assert.equal(serializeNativeAlertDetails(null), null);
    assert.equal(serializeNativeAlertDetails(undefined), null);
    assert.equal(serializeNativeAlertDetails({ a: null, b: "" }), null);
  });

  it("caps very long values (FCM-sized rows, not unbounded)", () => {
    const json = serializeNativeAlertDetails({ itemsJson: "x".repeat(5000) });
    assert.equal(JSON.parse(String(json)).itemsJson.length, 2000);
  });
});

describe("deadlineEpochMs", () => {
  it("turns an ISO deadline into epoch millis (native parses millis on every API level)", () => {
    assert.equal(deadlineEpochMs("2026-11-19T10:00:30.000Z"), String(Date.parse("2026-11-19T10:00:30.000Z")));
    assert.equal(deadlineEpochMs("2026-11-19T15:30:30+05:30"), String(Date.parse("2026-11-19T10:00:30Z")));
  });

  it("passes epoch strings / numbers through and rejects junk", () => {
    assert.equal(deadlineEpochMs("1763546430000"), "1763546430000");
    assert.equal(deadlineEpochMs(1763546430000.4), "1763546430000");
    assert.equal(deadlineEpochMs(""), undefined);
    assert.equal(deadlineEpochMs(null), undefined);
    assert.equal(deadlineEpochMs("soon"), undefined);
    assert.equal(deadlineEpochMs(-5), undefined);
  });
});
