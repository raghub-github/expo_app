import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveOnlineStatus } from "./geoDirectory.js";

test("off duty is OFFLINE regardless of location freshness or active order", () => {
  assert.equal(
    deriveOnlineStatus({ dutyStatus: "OFF", locationFresh: true, hasActiveOrder: true }),
    "OFFLINE"
  );
  assert.equal(
    deriveOnlineStatus({ dutyStatus: null, locationFresh: true, hasActiveOrder: false }),
    "OFFLINE"
  );
  assert.equal(
    deriveOnlineStatus({ dutyStatus: "AUTO_OFF", locationFresh: true, hasActiveOrder: false }),
    "OFFLINE"
  );
});

test("duty ON with stale location is STALE — the exact bug this closes — not ONLINE and not OFFLINE", () => {
  assert.equal(
    deriveOnlineStatus({ dutyStatus: "ON", locationFresh: false, hasActiveOrder: false }),
    "STALE"
  );
  assert.equal(
    deriveOnlineStatus({ dutyStatus: "ON", locationFresh: false, hasActiveOrder: true }),
    "STALE"
  );
});

test("duty ON, fresh location, no active order is ONLINE", () => {
  assert.equal(
    deriveOnlineStatus({ dutyStatus: "ON", locationFresh: true, hasActiveOrder: false }),
    "ONLINE"
  );
});

test("duty ON, fresh location, active order is BUSY", () => {
  assert.equal(
    deriveOnlineStatus({ dutyStatus: "ON", locationFresh: true, hasActiveOrder: true }),
    "BUSY"
  );
});
