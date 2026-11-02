import {
  acceptDidLand,
  acceptOrderRefs,
  findAcceptedOrder,
} from "@/src/lib/acceptRecovery";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("acceptOrderRefs", () => {
  it("keeps every distinct identifier", () => {
    assert.deepEqual(acceptOrderRefs("ord_1", "GM10000416"), ["ord_1", "GM10000416"]);
  });

  it("de-duplicates, so acceptRef === id collapses to one ref", () => {
    assert.deepEqual(acceptOrderRefs("ord_1", "ord_1", "ord_1"), ["ord_1"]);
  });

  it("drops blanks, whitespace and nullish refs", () => {
    assert.deepEqual(acceptOrderRefs(null, undefined, "", "   ", "ord_1"), ["ord_1"]);
  });

  it("trims, so a padded id still matches a clean one", () => {
    assert.deepEqual(acceptOrderRefs("  ord_1  "), ["ord_1"]);
  });
});

describe("findAcceptedOrder", () => {
  const refs = acceptOrderRefs("ord_1", "GM10000416");

  it("matches on the internal id", () => {
    const hit = findAcceptedOrder([{ id: "ord_1" }], refs);
    assert.equal(hit?.id, "ord_1");
  });

  it("matches on the formatted order id", () => {
    const hit = findAcceptedOrder([{ id: "ord_other", formattedOrderId: "GM10000416" }], refs);
    assert.equal(hit?.id, "ord_other");
  });

  it("matches a row whose id field carries the formatted id", () => {
    // The server is inconsistent about which id lands in `id`; both must work.
    const hit = findAcceptedOrder([{ id: "GM10000416" }], refs);
    assert.equal(hit?.id, "GM10000416");
  });

  it("returns the order itself, so the caller can seed its detail cache", () => {
    const row = { id: "ord_1", formattedOrderId: "GM10000416" };
    assert.equal(findAcceptedOrder([{ id: "nope" }, row], refs), row);
  });

  it("returns null when the order is genuinely absent", () => {
    // This is the release signal: a wedged rider gets their slider back.
    assert.equal(findAcceptedOrder([{ id: "someone_elses" }], refs), null);
  });

  it("returns null for an empty or missing active list", () => {
    assert.equal(findAcceptedOrder([], refs), null);
    assert.equal(findAcceptedOrder(null, refs), null);
    assert.equal(findAcceptedOrder(undefined, refs), null);
  });

  it("returns null when there are no refs to match", () => {
    assert.equal(findAcceptedOrder([{ id: "ord_1" }], []), null);
  });
});

describe("findAcceptedOrder: false positives that would strand a rider", () => {
  it("does NOT match a blank-id order against a blank ref", () => {
    // `undefined === undefined` is true. If that ever read as "your accept
    // landed", the rider would be navigated into an order they do not hold.
    assert.equal(findAcceptedOrder([{ id: undefined }], acceptOrderRefs(undefined)), null);
    assert.equal(findAcceptedOrder([{ id: "" }], acceptOrderRefs("")), null);
    assert.equal(findAcceptedOrder([{ id: null }], acceptOrderRefs(null)), null);
  });

  it("does NOT match an order with no ids at all", () => {
    assert.equal(findAcceptedOrder([{}], acceptOrderRefs("ord_1")), null);
  });

  it("does NOT match a blank formattedOrderId against a blank ref", () => {
    assert.equal(
      findAcceptedOrder([{ id: "other", formattedOrderId: "" }], acceptOrderRefs("", "   ")),
      null
    );
  });

  it("survives a null entry in the active list without throwing", () => {
    const active = [null, { id: "ord_1" }] as unknown as Array<{ id?: string }>;
    assert.equal(findAcceptedOrder(active, acceptOrderRefs("ord_1"))?.id, "ord_1");
  });

  it("does not match on a partial / prefix id", () => {
    assert.equal(findAcceptedOrder([{ id: "ord_10" }], acceptOrderRefs("ord_1")), null);
    assert.equal(findAcceptedOrder([{ id: "ord_1" }], acceptOrderRefs("ord_10")), null);
  });
});

describe("acceptDidLand", () => {
  it("is true when the order is live, false when it is not", () => {
    const active = [{ id: "ord_1", formattedOrderId: "GM10000416" }];
    assert.equal(acceptDidLand(active, "ord_1", "GM10000416", "GM10000416"), true);
    assert.equal(acceptDidLand(active, "ord_zzz", null, undefined), false);
  });

  it("is false when the rider holds nothing, which releases the accept latch", () => {
    assert.equal(acceptDidLand([], "ord_1"), false);
  });
});

describe("findAcceptedOrder: blank refs can never match a blank id", () => {
  // acceptOrderRefs strips blanks, so these refs cannot arise through it.
  // findAcceptedOrder is exported and takes arbitrary refs, though, and this
  // guard is the last thing standing between a malformed response and a rider
  // being navigated into an order they do not hold.
  it("refuses a blank ref against a blank id", () => {
    assert.equal(findAcceptedOrder([{ id: "" }], [""]), null);
    assert.equal(findAcceptedOrder([{ id: "   " }], ["   "]), null);
    assert.equal(findAcceptedOrder([{ id: undefined }], [""]), null);
    assert.equal(findAcceptedOrder([{ id: null }], [""]), null);
  });

  it("refuses a blank ref against a blank formattedOrderId", () => {
    assert.equal(findAcceptedOrder([{ id: "other", formattedOrderId: "" }], [""]), null);
    assert.equal(findAcceptedOrder([{ id: "other", formattedOrderId: null }], [""]), null);
  });

  it("still matches a real id when a blank ref is present alongside it", () => {
    assert.equal(findAcceptedOrder([{ id: "ord_1" }], ["", "ord_1"])?.id, "ord_1");
  });

  it("skips the blank-id row and matches the real one later in the list", () => {
    const rows = [{ id: "" }, { id: "ord_1" }];
    assert.equal(findAcceptedOrder(rows, ["", "ord_1"])?.id, "ord_1");
  });
});
