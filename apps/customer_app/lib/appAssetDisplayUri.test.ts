import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickAppAssetDisplayUri } from "./appAssetDisplayUri";

describe("pickAppAssetDisplayUri", () => {
  it("keeps lastGood while a new preferred URI loads", () => {
    const pick = pickAppAssetDisplayUri({
      preferredUri: "https://cdn/new.png",
      lastGoodUri: "https://cdn/old.png",
    });
    assert.equal(pick.displayUri, "https://cdn/old.png");
    assert.equal(pick.pendingUri, "https://cdn/new.png");
    assert.equal(pick.isRevalidating, true);
  });

  it("shows preferred when there is no lastGood", () => {
    const pick = pickAppAssetDisplayUri({
      preferredUri: "https://cdn/a.png",
      lastGoodUri: null,
    });
    assert.equal(pick.displayUri, "https://cdn/a.png");
    assert.equal(pick.isRevalidating, false);
  });

  it("falls back to lastGood when preferred clears", () => {
    const pick = pickAppAssetDisplayUri({
      preferredUri: null,
      lastGoodUri: "https://cdn/old.png",
    });
    assert.equal(pick.displayUri, "https://cdn/old.png");
    assert.equal(pick.pendingUri, null);
  });

  it("fresh mode always prefers the live URI", () => {
    const pick = pickAppAssetDisplayUri({
      preferredUri: "https://cdn/new.png",
      lastGoodUri: "https://cdn/old.png",
      fresh: true,
    });
    assert.equal(pick.displayUri, "https://cdn/new.png");
    assert.equal(pick.isRevalidating, false);
  });
});
