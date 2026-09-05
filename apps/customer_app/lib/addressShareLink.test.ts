import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractAddressShareToken, isAddressSharePath } from "./addressShareLink";

describe("extractAddressShareToken", () => {
  it("reads the canonical gatimitra.com path", () => {
    assert.equal(
      extractAddressShareToken("https://gatimitra.com/address/share/abc123def456"),
      "abc123def456"
    );
  });

  it("reads the legacy /addr query token", () => {
    assert.equal(
      extractAddressShareToken("https://gatimitra.com/addr/deadbeef?id=tokentoken12"),
      "tokentoken12"
    );
  });

  it("reads the custom scheme", () => {
    assert.equal(
      extractAddressShareToken("gatimitra://address/save?id=tokentoken12"),
      "tokentoken12"
    );
  });

  it("detects share paths", () => {
    assert.equal(isAddressSharePath("https://gatimitra.com/address/share/x"), true);
    assert.equal(isAddressSharePath("https://gatimitra.com/home"), false);
  });
});
