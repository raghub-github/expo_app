import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dispatchSessionKey,
  recoveryIntervalMs,
  WS_CONNECTED_RECOVERY_MS,
  WS_DOWN_RECOVERY_MS,
} from "./riderDispatchPolicy";

describe("recoveryIntervalMs", () => {
  it("uses the slower interval while WS is live", () => {
    assert.equal(recoveryIntervalMs(true), WS_CONNECTED_RECOVERY_MS);
  });

  it("uses the faster HTTP fallback while WS is down", () => {
    assert.equal(recoveryIntervalMs(false), WS_DOWN_RECOVERY_MS);
    assert.ok(WS_DOWN_RECOVERY_MS < WS_CONNECTED_RECOVERY_MS);
  });
});

describe("dispatchSessionKey", () => {
  it("changes when the rider identity changes", () => {
    const a = dispatchSessionKey({
      userId: "usr_1",
      riderId: "1",
      accessToken: "token-aaaaaa",
    });
    const b = dispatchSessionKey({
      userId: "usr_2",
      riderId: "2",
      accessToken: "token-aaaaaa",
    });
    assert.notEqual(a, b);
  });

  it("stays stable when the access token rotates", () => {
    const a = dispatchSessionKey({
      userId: "usr_1",
      riderId: "1",
      accessToken: "token-aaaaaa",
    });
    const b = dispatchSessionKey({
      userId: "usr_1",
      riderId: "1",
      accessToken: "token-bbbbbb",
    });
    assert.equal(a, b);
  });
});
