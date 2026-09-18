import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError, NetworkTimeoutError } from "@gatimitra/sdk";
import {
  dutyConnectivityCopy,
  dutyLocationCopy,
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
