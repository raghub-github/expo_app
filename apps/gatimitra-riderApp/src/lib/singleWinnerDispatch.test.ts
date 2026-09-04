import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "@gatimitra/sdk";
import { isOrderTakenByAnotherRiderError } from "./rider-dispatch-accept-errors";
import { dropOfferFromLists } from "./incomingDispatchOffers";
import { useIncomingDispatchOfferStore } from "../stores/incomingDispatchOfferStore";

describe("isOrderTakenByAnotherRiderError", () => {
  it("treats ORDER_ALREADY_ASSIGNED as taken by another rider", () => {
    const err = new ApiError("API 409", 409, {
      error: "Order already assigned",
      code: "ORDER_ALREADY_ASSIGNED",
    });
    assert.equal(isOrderTakenByAnotherRiderError(err), true);
  });

  it("does not treat a generic 409 as taken", () => {
    const err = new ApiError("API 409", 409, { error: "This order is waiting for admin assignment" });
    assert.equal(isOrderTakenByAnotherRiderError(err), false);
  });
});

describe("dropOfferFromLists", () => {
  it("removes the matching offer id", () => {
    const next = dropOfferFromLists(
      [
        { id: "GMF1", formattedOrderId: "GMF100026" } as never,
        { id: "GMF2" } as never,
      ],
      "GMF100026"
    );
    assert.deepEqual(next?.map((o) => o.id), ["GMF2"]);
  });
});

describe("incomingDispatchOfferStore cancel", () => {
  it("blocks re-ingest of a cancelled offer", () => {
    useIncomingDispatchOfferStore.getState().reset();
    assert.equal(useIncomingDispatchOfferStore.getState().ingestOfferId("X"), true);
    useIncomingDispatchOfferStore.getState().cancelOffer("X");
    assert.equal(useIncomingDispatchOfferStore.getState().isCancelled("X"), true);
    assert.equal(useIncomingDispatchOfferStore.getState().ingestOfferId("X"), false);
    assert.equal(useIncomingDispatchOfferStore.getState().lastOfferId, null);
    useIncomingDispatchOfferStore.getState().reset();
  });
});
