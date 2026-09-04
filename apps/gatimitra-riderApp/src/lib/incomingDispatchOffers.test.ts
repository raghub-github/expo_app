import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectNewOfferIds,
  mergeIncomingOfferLists,
} from "./incomingDispatchOffers";

function stub(id: string, merchantName?: string) {
  return { id, merchantName, category: "food" } as never;
}

describe("mergeIncomingOfferLists", () => {
  it("unions by id and lets available hydrate over pending", () => {
    const pending = [stub("a", "pending")];
    const available = [stub("a", "live"), stub("b")];
    const merged = mergeIncomingOfferLists(available, pending);
    assert.equal(merged.find((o) => o.id === "a")?.merchantName, "live");
    assert.equal(merged.some((o) => o.id === "b"), true);
  });

  it("keeps a pending-only offer when the live pool is empty", () => {
    const merged = mergeIncomingOfferLists([], [stub("only")]);
    assert.deepEqual(merged.map((o) => o.id), ["only"]);
  });
});

describe("detectNewOfferIds", () => {
  it("returns only ids that were not previously seen", () => {
    assert.deepEqual(detectNewOfferIds(new Set(["a"]), ["a", "b"]), ["b"]);
    assert.deepEqual(detectNewOfferIds(new Set(), ["x"]), ["x"]);
  });
});
