/**
 * App-level push permission gate expectations (customer / rider / merchant).
 * Pure assertions — device QA covers OS dialogs and FCM credentials.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

type OsStatus = "undetermined" | "granted" | "denied" | "blocked";

function shouldAdvancePermissionStep(input: {
  osStatus: OsStatus;
  syncOk: boolean | null;
}): boolean {
  return input.osStatus === "granted" && input.syncOk !== false;
}

function allowButtonLabel(input: {
  osStatus: OsStatus;
  canAskAgain: boolean;
}): "Allow" | "Open Settings" {
  if (input.osStatus === "blocked" || !input.canAskAgain) return "Open Settings";
  return "Allow";
}

function merchantGateVisible(input: {
  authenticated: boolean;
  osStatus: OsStatus;
  dismissed: boolean;
  expoGo: boolean;
}): boolean {
  if (input.expoGo || !input.authenticated || input.dismissed) return false;
  return input.osStatus !== "granted";
}

describe("customer/rider notification step advance", () => {
  it("advances only after grant + non-failed sync", () => {
    assert.equal(shouldAdvancePermissionStep({ osStatus: "granted", syncOk: true }), true);
    assert.equal(shouldAdvancePermissionStep({ osStatus: "granted", syncOk: null }), true);
    assert.equal(shouldAdvancePermissionStep({ osStatus: "granted", syncOk: false }), false);
    assert.equal(shouldAdvancePermissionStep({ osStatus: "denied", syncOk: true }), false);
  });

  it("labels Allow vs Open Settings", () => {
    assert.equal(allowButtonLabel({ osStatus: "undetermined", canAskAgain: true }), "Allow");
    assert.equal(allowButtonLabel({ osStatus: "blocked", canAskAgain: false }), "Open Settings");
    assert.equal(allowButtonLabel({ osStatus: "denied", canAskAgain: false }), "Open Settings");
  });
});

describe("merchant permission recovery gate", () => {
  it("shows for authenticated merchants when not granted", () => {
    assert.equal(
      merchantGateVisible({
        authenticated: true,
        osStatus: "denied",
        dismissed: false,
        expoGo: false,
      }),
      true
    );
    assert.equal(
      merchantGateVisible({
        authenticated: true,
        osStatus: "granted",
        dismissed: false,
        expoGo: false,
      }),
      false
    );
    assert.equal(
      merchantGateVisible({
        authenticated: false,
        osStatus: "denied",
        dismissed: false,
        expoGo: false,
      }),
      false
    );
  });
});
