import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError, NetworkTimeoutError } from "@gatimitra/sdk";
import {
  dutyConnectivityCopy,
  dutyLocationCopy,
  dutyServerRejectionMessage,
  isDutyServerRejection,
  resolveDutyGoOnFailureKind,
} from "@/src/lib/dutyToggleFailure";

describe("resolveDutyGoOnFailureKind", () => {
  it("prefers network when offline even if location also failed", () => {
    assert.equal(
      resolveDutyGoOnFailureKind({
        online: false,
        locationFailure: "unavailable",
      }),
      "network"
    );
  });

  it("maps GPS service / permission failures to location when online", () => {
    assert.equal(
      resolveDutyGoOnFailureKind({
        online: true,
        locationFailure: "services_disabled",
      }),
      "location"
    );
    assert.equal(
      resolveDutyGoOnFailureKind({
        online: true,
        locationFailure: "permission",
      }),
      "location"
    );
  });

  it("maps API timeout / network errors to network (never GPS)", () => {
    assert.equal(
      resolveDutyGoOnFailureKind({
        online: true,
        apiError: new NetworkTimeoutError(25_000),
      }),
      "network"
    );
    assert.equal(
      resolveDutyGoOnFailureKind({
        online: true,
        apiError: new TypeError("Network request failed"),
      }),
      "network"
    );
  });

  it("maps 5xx to server, not location", () => {
    assert.equal(
      resolveDutyGoOnFailureKind({
        online: true,
        apiError: new ApiError("boom", 503, {}),
      }),
      "server"
    );
  });

  it("offline wins over API error classification", () => {
    assert.equal(
      resolveDutyGoOnFailureKind({
        online: false,
        apiError: new ApiError("boom", 503, {}),
      }),
      "network"
    );
  });
});

describe("duty copy", () => {
  it("uses No Internet Connection for network modal", () => {
    const copy = dutyConnectivityCopy("network");
    assert.match(copy.title, /No Internet Connection/i);
    assert.match(copy.message, /internet/i);
  });

  it("uses Turn on GPS only for services_disabled", () => {
    const gps = dutyLocationCopy("services_disabled");
    assert.match(gps.message, /Turn on GPS/i);
    const unavailable = dutyLocationCopy("unavailable");
    assert.doesNotMatch(unavailable.message, /internet/i);
  });
});

describe("isDutyServerRejection", () => {
  it("treats a 4xx as the server refusing, not the network failing", () => {
    assert.equal(isDutyServerRejection(new ApiError("blocked", 403, { code: "X" })), true);
    assert.equal(isDutyServerRejection(new ApiError("bad", 400, { code: "X" })), true);
  });

  it("does not treat a retryable 408/429 as a considered refusal", () => {
    assert.equal(isDutyServerRejection(new ApiError("timeout", 408, { code: "X" })), false);
    assert.equal(isDutyServerRejection(new ApiError("slow down", 429, { code: "X" })), false);
  });

  it("does not treat a 5xx or a transport failure as a refusal", () => {
    assert.equal(isDutyServerRejection(new ApiError("boom", 500, { code: "X" })), false);
    assert.equal(isDutyServerRejection(new NetworkTimeoutError(20_000)), false);
    assert.equal(isDutyServerRejection(new Error("Network request failed")), false);
  });
});

describe("dutyServerRejectionMessage", () => {
  it("prefers a JSON message field from the body", () => {
    const err = Object.assign(new Error("Request failed with status code 403"), {
      status: 403,
      body: JSON.stringify({ message: "Clear your wallet dues to go on duty." }),
    });
    assert.equal(dutyServerRejectionMessage(err), "Clear your wallet dues to go on duty.");
  });

  it("accepts a short plain-text body", () => {
    const err = Object.assign(new Error("x"), { status: 403, body: "Vehicle not verified" });
    assert.equal(dutyServerRejectionMessage(err), "Vehicle not verified");
  });

  it("ignores an HTML error page", () => {
    const err = Object.assign(new Error("Request failed"), {
      status: 403,
      body: "<html><body>502 Bad Gateway</body></html>",
    });
    assert.equal(dutyServerRejectionMessage(err), null);
  });

  it("rejects a bare status line that tells the rider nothing", () => {
    assert.equal(
      dutyServerRejectionMessage(new Error("Request failed with status code 403")),
      null
    );
    assert.equal(dutyServerRejectionMessage(new Error("403 Forbidden")), null);
  });

  it("falls back to a meaningful error message when there is no body", () => {
    assert.equal(
      dutyServerRejectionMessage(new Error("All requested services are restricted")),
      "All requested services are restricted"
    );
  });

  it("drops an absurdly long body rather than filling the dialog", () => {
    const err = Object.assign(new Error("Request failed with status code 400"), {
      status: 400,
      body: JSON.stringify({ message: "y".repeat(400) }),
    });
    assert.equal(dutyServerRejectionMessage(err), null);
  });

  it("still falls back to a useful error message when the body is unusable", () => {
    const err = Object.assign(new Error("Wallet dues pending"), {
      status: 403,
      body: JSON.stringify({ message: "y".repeat(400) }),
    });
    assert.equal(dutyServerRejectionMessage(err), "Wallet dues pending");
  });
});
