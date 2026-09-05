import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { anyTextIncludes, textIncludes } from "./safe-text";

describe("textIncludes", () => {
  it("does not throw on null / undefined / non-string names", () => {
    assert.equal(textIncludes(undefined, "pizza"), false);
    assert.equal(textIncludes(null, "pizza"), false);
    assert.equal(textIncludes(12, "pizza"), false);
    assert.equal(textIncludes({ name: "Pizza" }, "pizza"), false);
  });

  it("matches real strings case-insensitively", () => {
    assert.equal(textIncludes("Domino's Pizza", "pizza"), true);
    assert.equal(textIncludes("Domino's Pizza", "burger"), false);
  });
});

describe("anyTextIncludes", () => {
  it("ignores null cuisine entries", () => {
    assert.equal(anyTextIncludes([null, "North Indian", undefined], "indian"), true);
    assert.equal(anyTextIncludes(undefined, "indian"), false);
    assert.equal(anyTextIncludes(["Chinese"], "indian"), false);
  });
});
