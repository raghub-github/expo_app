import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getCheckoutBillStatusMessage,
  isCanceledRequestError,
  isTimeoutError,
} from "./checkoutBillStatus";

describe("checkoutBillStatus", () => {
  it("does not blame connection while fetching", () => {
    const msg = getCheckoutBillStatusMessage({
      toPayAmount: null,
      canRequestBilling: true,
      billingItemsHaveResolvableIds: true,
      menuLoading: false,
      hasPickupCoords: true,
      needsDeliveryAddress: false,
      isFetching: true,
      isError: false,
      error: null,
    });
    assert.match(msg ?? "", /calculating/i);
    assert.doesNotMatch(msg ?? "", /connection/i);
  });

  it("explains unresolved menu ids without connection copy", () => {
    const msg = getCheckoutBillStatusMessage({
      toPayAmount: null,
      canRequestBilling: true,
      billingItemsHaveResolvableIds: false,
      menuLoading: true,
      hasPickupCoords: true,
      needsDeliveryAddress: false,
      isFetching: false,
      isError: false,
      error: null,
    });
    assert.match(msg ?? "", /menu/i);
    assert.doesNotMatch(msg ?? "", /connection/i);
  });

  it("classifies timeout vs cancel", () => {
    assert.equal(isTimeoutError({ code: "ECONNABORTED", message: "timeout of 20000ms exceeded" }), true);
    assert.equal(isCanceledRequestError({ code: "ERR_CANCELED", message: "canceled" }), true);
    assert.equal(isCanceledRequestError({ code: "ECONNABORTED" }), false);
  });

  it("uses server message for 5xx", () => {
    const msg = getCheckoutBillStatusMessage({
      toPayAmount: null,
      canRequestBilling: true,
      billingItemsHaveResolvableIds: true,
      menuLoading: false,
      hasPickupCoords: true,
      needsDeliveryAddress: false,
      isFetching: false,
      isError: true,
      error: { response: { status: 503 }, message: "Network Error" },
    });
    assert.match(msg ?? "", /unavailable/i);
    assert.doesNotMatch(msg ?? "", /connection/i);
  });
});
