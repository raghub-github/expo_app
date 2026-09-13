import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeRiderId, riderIdFromSession } from "./normalizeRiderId";

describe("normalizeRiderId", () => {
  it("strips usr_ prefix", () => {
    assert.equal(normalizeRiderId("usr_1015"), "1015");
    assert.equal(normalizeRiderId("USR_42"), "42");
  });

  it("keeps numeric ids", () => {
    assert.equal(normalizeRiderId("1015"), "1015");
  });

  it("rejects empty / non-rider shapes", () => {
    assert.equal(normalizeRiderId(""), null);
    assert.equal(normalizeRiderId(null), null);
    assert.equal(normalizeRiderId("merchant_1"), null);
  });
});

describe("riderIdFromSession", () => {
  it("prefers riderId over userId", () => {
    assert.equal(
      riderIdFromSession({ riderId: "1015", userId: "usr_999" }),
      "1015"
    );
  });

  it("derives from userId when riderId missing", () => {
    assert.equal(riderIdFromSession({ userId: "usr_1015" }), "1015");
  });
});
