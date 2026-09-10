import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createInitialSessionState,
  deriveStoreOpState,
  reduceStoreStatusSession,
  type StoreStatusInputs,
  type StoreStatusSessionState,
} from "./storeStatusMachine";

function inputs(over: Partial<StoreStatusInputs>): StoreStatusInputs {
  return {
    authenticated: true,
    storeId: 1,
    isOnline: true,
    activeOrders: 0,
    kitchenBodyChanged: false,
    newIdleSessionId: "S1",
    ...over,
  };
}

test("deriveStoreOpState maps online + active count to the three states", () => {
  assert.equal(deriveStoreOpState(false, 0), "OFFLINE");
  assert.equal(deriveStoreOpState(false, 3), "OFFLINE"); // offline dominates
  assert.equal(deriveStoreOpState(true, 0), "ONLINE_IDLE");
  assert.equal(deriveStoreOpState(true, 2), "ORDER_ACTIVE");
});

test("TEST 1/9: OFFLINE → ONLINE_IDLE posts exactly one idle notification (new session)", () => {
  const prev: StoreStatusSessionState = { opState: "OFFLINE", idleSessionId: null, idleNotifiedSessionId: null };
  const { next, action } = reduceStoreStatusSession(prev, inputs({ isOnline: true, activeOrders: 0, newIdleSessionId: "S1" }));
  assert.deepEqual(action, { type: "POST_IDLE", idleSessionId: "S1" });
  assert.equal(next.opState, "ONLINE_IDLE");
  assert.equal(next.idleNotifiedSessionId, "S1");
});

test("TEST 3/6/8: ONLINE_IDLE → ONLINE_IDLE is silent (state is not an event)", () => {
  const prev: StoreStatusSessionState = { opState: "ONLINE_IDLE", idleSessionId: "S1", idleNotifiedSessionId: "S1" };
  // Any number of repeat evaluations (poll / render / websocket / foreground) → NONE.
  for (let i = 0; i < 5; i++) {
    const { action } = reduceStoreStatusSession(prev, inputs({ newIdleSessionId: `S${i + 9}` }));
    assert.deepEqual(action, { type: "NONE", reason: "SAME_IDLE_SESSION" });
  }
});

test("TEST 2/7: cleared tray + app open while still idle does NOT re-post (same session)", () => {
  // Tray cleared by the user does not change the session; a later evaluate must stay silent.
  const prev: StoreStatusSessionState = { opState: "ONLINE_IDLE", idleSessionId: "S1", idleNotifiedSessionId: "S1" };
  const { action } = reduceStoreStatusSession(prev, inputs({ newIdleSessionId: "S-open" }));
  assert.deepEqual(action, { type: "NONE", reason: "SAME_IDLE_SESSION" });
});

test("TEST 4/9: ONLINE_IDLE → ORDER_ACTIVE → ONLINE_IDLE creates a NEW idle session (one new notif)", () => {
  // idle (notified S1)
  let s: StoreStatusSessionState = { opState: "ONLINE_IDLE", idleSessionId: "S1", idleNotifiedSessionId: "S1" };
  // order arrives → ORDER_ACTIVE, no idle notif, kitchen update
  let r = reduceStoreStatusSession(s, inputs({ activeOrders: 1, newIdleSessionId: "S2" }));
  assert.equal(r.action.type, "UPDATE_KITCHEN");
  s = r.next;
  // order completes → back to idle with a brand-new session id → one POST_IDLE
  r = reduceStoreStatusSession(s, inputs({ activeOrders: 0, newIdleSessionId: "S3" }));
  assert.deepEqual(r.action, { type: "POST_IDLE", idleSessionId: "S3" });
  assert.notEqual(r.next.idleSessionId, "S1");
});

test("§6 multiple orders: ACTIVE→ACTIVE only updates kitchen on real content change, never idle", () => {
  const s: StoreStatusSessionState = { opState: "ORDER_ACTIVE", idleSessionId: "S1", idleNotifiedSessionId: "S1" };
  // same counts → no post
  assert.deepEqual(
    reduceStoreStatusSession(s, inputs({ activeOrders: 2, kitchenBodyChanged: false })).action,
    { type: "NONE", reason: "KITCHEN_UNCHANGED" }
  );
  // counts changed → kitchen sticky update (not an idle notification)
  assert.deepEqual(
    reduceStoreStatusSession(s, inputs({ activeOrders: 3, kitchenBodyChanged: true })).action,
    { type: "UPDATE_KITCHEN" }
  );
});

test("§16/§17: online → OFFLINE posts offline once; OFFLINE → OFFLINE is silent", () => {
  const online: StoreStatusSessionState = { opState: "ONLINE_IDLE", idleSessionId: "S1", idleNotifiedSessionId: "S1" };
  const r1 = reduceStoreStatusSession(online, inputs({ isOnline: false }));
  assert.deepEqual(r1.action, { type: "POST_OFFLINE" });
  assert.equal(r1.next.idleSessionId, null); // idle session cleared on going offline
  const r2 = reduceStoreStatusSession(r1.next, inputs({ isOnline: false }));
  assert.deepEqual(r2.action, { type: "NONE", reason: "OFFLINE_STABLE" });
});

test("TEST 9 (offline→online again): a fresh idle session posts one new notification", () => {
  const offline: StoreStatusSessionState = { opState: "OFFLINE", idleSessionId: null, idleNotifiedSessionId: null };
  const r = reduceStoreStatusSession(offline, inputs({ isOnline: true, activeOrders: 0, newIdleSessionId: "S9" }));
  assert.deepEqual(r.action, { type: "POST_IDLE", idleSessionId: "S9" });
});

test("TEST 10: logout / no store removes the tray and clears the session (no leak into next store)", () => {
  const prev: StoreStatusSessionState = { opState: "ONLINE_IDLE", idleSessionId: "A123", idleNotifiedSessionId: "A123" };
  const loggedOut = reduceStoreStatusSession(prev, inputs({ authenticated: false, storeId: null }));
  assert.deepEqual(loggedOut.action, { type: "REMOVE", reason: "LOGOUT" });
  assert.deepEqual(loggedOut.next, createInitialSessionState());
  const noStore = reduceStoreStatusSession(prev, inputs({ authenticated: true, storeId: null }));
  assert.deepEqual(noStore.action, { type: "REMOVE", reason: "NO_STORE" });
});

test("first run (prev=null) while idle posts once; a restored idle session stays silent (§7)", () => {
  const fresh = reduceStoreStatusSession(createInitialSessionState(), inputs({ newIdleSessionId: "S1" }));
  assert.deepEqual(fresh.action, { type: "POST_IDLE", idleSessionId: "S1" });
  // Restored session already notified → silent on the next evaluate.
  const restored = reduceStoreStatusSession(fresh.next, inputs({ newIdleSessionId: "S2" }));
  assert.deepEqual(restored.action, { type: "NONE", reason: "SAME_IDLE_SESSION" });
});
