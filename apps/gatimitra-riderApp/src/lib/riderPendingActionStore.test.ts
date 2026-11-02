import { describe, it, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// The store writes through to AsyncStorage, which has no implementation off
// device. Mock it with an in-memory map BEFORE importing the store, so the
// persisted-state behaviour - the part that made a wedged accept survive an
// app restart, with reinstall the only way out - is exercised for real.
const disk = new Map<string, string>();
mock.module("@react-native-async-storage/async-storage", {
  defaultExport: {
    getItem: async (k: string) => (disk.has(k) ? disk.get(k)! : null),
    setItem: async (k: string, v: string) => {
      disk.set(k, v);
    },
    removeItem: async (k: string) => {
      disk.delete(k);
    },
  },
});

// This package is CJS, so top-level await is unavailable; load the mocked
// modules in `before` instead. The mock above is registered synchronously at
// module scope, so it is already in place by the time these imports run.
type StoreModule = typeof import("@/src/stores/riderPendingActionStore");
let useRiderPendingActionStore: StoreModule["useRiderPendingActionStore"];
let riderPendingPhase: StoreModule["riderPendingPhase"];
let findPendingRiderAction: StoreModule["findPendingRiderAction"];
let ACCEPT_ACTION_TTL_MS: number;
let STALE: number;

before(async () => {
  const mod = await import("@/src/stores/riderPendingActionStore");
  useRiderPendingActionStore = mod.useRiderPendingActionStore;
  riderPendingPhase = mod.riderPendingPhase;
  findPendingRiderAction = mod.findPendingRiderAction;
  ({ ACCEPT_ACTION_TTL_MS } = await import("@/src/lib/rider-pending-action-ttl"));
  STALE = ACCEPT_ACTION_TTL_MS + 60_000;
});

const STORAGE_KEY = "gm.rider.pendingActions.v1";

function action(over: Record<string, unknown> = {}) {
  return {
    actionId: "a1",
    actionType: "accept",
    orderId: "ord_1",
    payload: {},
    phase: "processing",
    createdAt: Date.now(),
    lastAttemptAt: Date.now(),
    retryCount: 0,
    ...over,
  };
}

function seed(actions: unknown[]) {
  useRiderPendingActionStore.setState({ hydrated: true, actions: actions as never });
}

async function hydrateFrom(rows: unknown[]) {
  disk.set(STORAGE_KEY, JSON.stringify(rows));
  useRiderPendingActionStore.setState({ hydrated: false, actions: [] });
  await useRiderPendingActionStore.getState().hydrate();
  return useRiderPendingActionStore.getState();
}

beforeEach(() => {
  disk.clear();
  useRiderPendingActionStore.setState({ hydrated: false, actions: [] });
});

describe("hydrate: the restart that used to need a reinstall", () => {
  it("drops a stale accept left over from a previous app run", async () => {
    const s = await hydrateFrom([action({ createdAt: Date.now() - STALE })]);
    assert.equal(s.actions.length, 0, "stale accept must not come back after a restart");
    assert.equal(s.hydrated, true);
  });

  it("re-persists the pruned list, so the stale row leaves disk as well", async () => {
    await hydrateFrom([action({ createdAt: Date.now() - STALE })]);
    assert.deepEqual(JSON.parse(disk.get(STORAGE_KEY)!), []);
  });

  it("keeps an accept that is still genuinely in flight", async () => {
    const s = await hydrateFrom([action({ createdAt: Date.now() - 5_000 })]);
    assert.equal(s.actions.length, 1);
    assert.equal(s.actions[0].orderId, "ord_1");
  });

  it("keeps the fresh row and drops the stale one from the same payload", async () => {
    const s = await hydrateFrom([
      action({ actionId: "old", orderId: "ord_old", createdAt: Date.now() - 86_400_000 }),
      action({ actionId: "new", orderId: "ord_new" }),
    ]);
    assert.deepEqual(
      s.actions.map((a) => a.actionId),
      ["new"]
    );
  });

  it("does not rewrite disk when nothing was pruned", async () => {
    disk.set(STORAGE_KEY, JSON.stringify([action()]));
    const before = disk.get(STORAGE_KEY);
    useRiderPendingActionStore.setState({ hydrated: false, actions: [] });
    await useRiderPendingActionStore.getState().hydrate();
    assert.equal(disk.get(STORAGE_KEY), before);
  });

  it("treats a row with no createdAt as expired rather than trusting it forever", async () => {
    const s = await hydrateFrom([action({ createdAt: undefined })]);
    assert.equal(s.actions.length, 0);
  });

  it("recovers from corrupt JSON instead of crashing the app on open", async () => {
    disk.set(STORAGE_KEY, "{not json");
    useRiderPendingActionStore.setState({ hydrated: false, actions: [] });
    await useRiderPendingActionStore.getState().hydrate();
    const s = useRiderPendingActionStore.getState();
    assert.equal(s.hydrated, true);
    assert.deepEqual(s.actions, []);
  });

  it("recovers when the stored value is not an array", async () => {
    disk.set(STORAGE_KEY, JSON.stringify({ nope: true }));
    useRiderPendingActionStore.setState({ hydrated: false, actions: [] });
    await useRiderPendingActionStore.getState().hydrate();
    assert.deepEqual(useRiderPendingActionStore.getState().actions, []);
  });

  it("starts empty and hydrated on a fresh install", async () => {
    await useRiderPendingActionStore.getState().hydrate();
    assert.equal(useRiderPendingActionStore.getState().hydrated, true);
    assert.deepEqual(useRiderPendingActionStore.getState().actions, []);
  });
});

describe("reads never surface an expired action", () => {
  it("getByOrderAction hides an expired row still held in memory", () => {
    seed([action({ createdAt: Date.now() - STALE })]);
    assert.equal(useRiderPendingActionStore.getState().getByOrderAction("ord_1", "accept"), null);
  });

  it("getByOrderAction still returns a live row", () => {
    seed([action()]);
    assert.equal(
      useRiderPendingActionStore.getState().getByOrderAction("ord_1", "accept")?.actionId,
      "a1"
    );
  });

  it("riderPendingPhase reports idle for an expired accept, freeing the slider", () => {
    seed([action({ createdAt: Date.now() - STALE })]);
    assert.equal(riderPendingPhase("ord_1", "accept"), "idle");
  });

  it("riderPendingPhase reports the live phase for an in-flight accept", () => {
    seed([action({ phase: "retrying" })]);
    assert.equal(riderPendingPhase("ord_1", "accept"), "retrying");
  });

  it("riderPendingPhase is idle with no orderId", () => {
    assert.equal(riderPendingPhase(undefined, "accept"), "idle");
  });

  it("getOrCreate mints a NEW action instead of reviving an expired one", () => {
    seed([action({ createdAt: Date.now() - STALE })]);
    const created = useRiderPendingActionStore
      .getState()
      .getOrCreate("ord_1", "accept", { gps: 1 });
    assert.notEqual(created.actionId, "a1");
    assert.equal(created.retryCount, 0);
    assert.equal(created.phase, "processing");
    assert.ok(Date.now() - created.createdAt < 5_000, "new action must carry a fresh clock");
  });

  it("getOrCreate reuses and merges payload for a live action", () => {
    seed([action({ payload: { gps: 1 } })]);
    const got = useRiderPendingActionStore
      .getState()
      .getOrCreate("ord_1", "accept", { otp: "1234" });
    assert.equal(got.actionId, "a1");
    assert.deepEqual(got.payload, { gps: 1, otp: "1234" });
  });

  it("findPendingRiderAction skips an expired row", () => {
    const stale = action({ actionId: "stale", createdAt: Date.now() - STALE });
    assert.equal(findPendingRiderAction([stale] as never, "accept", "ord_1"), null);
  });

  it("findPendingRiderAction matches a live row on any supplied ref", () => {
    const live = action({ actionId: "live", orderId: "GM10000416" });
    assert.equal(
      findPendingRiderAction([live] as never, "accept", "ord_x", "GM10000416")?.actionId,
      "live"
    );
  });

  it("findPendingRiderAction returns null when every ref is blank", () => {
    seed([action()]);
    assert.equal(findPendingRiderAction([action()] as never, "accept", null, undefined), null);
  });
});
