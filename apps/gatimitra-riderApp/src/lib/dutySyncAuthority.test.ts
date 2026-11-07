import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dutyPhaseFromServerFlag,
  dutySyncRetryDelayMs,
  isDutyDispatchAuthorized,
  isDutyGpsAuthorized,
} from "@/src/lib/dutySyncAuthority";

describe("duty sync authority", () => {
  it("authorizes dispatch only for server_on", () => {
    assert.equal(isDutyDispatchAuthorized("server_on"), true);
    for (const p of ["unknown", "syncing", "server_off", "sync_failed"] as const) {
      assert.equal(isDutyDispatchAuthorized(p), false, p);
    }
  });

  it("authorizes duty GPS only for server_on", () => {
    assert.equal(isDutyGpsAuthorized("server_on"), true);
    assert.equal(isDutyGpsAuthorized("unknown"), false);
    assert.equal(isDutyGpsAuthorized("sync_failed"), false);
  });

  it("maps server flags to phases", () => {
    assert.equal(dutyPhaseFromServerFlag(true), "server_on");
    assert.equal(dutyPhaseFromServerFlag(false), "server_off");
  });

  it("bounds retry delay with jitter under 25s", () => {
    for (let i = 0; i < 8; i++) {
      const d = dutySyncRetryDelayMs(i);
      assert.ok(d >= 800, String(d));
      assert.ok(d <= 25_000, String(d));
    }
  });
});

