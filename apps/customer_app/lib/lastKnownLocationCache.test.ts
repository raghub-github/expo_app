import { test, mock } from "node:test";
import assert from "node:assert/strict";

// In-memory AsyncStorage stand-in.
let store: Record<string, string> = {};
mock.module("@react-native-async-storage/async-storage", {
  defaultExport: {
    getItem: async (k: string) => (k in store ? store[k] : null),
    setItem: async (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: async (k: string) => {
      delete store[k];
    },
  },
});

async function load() {
  return import("./lastKnownLocationCache");
}

const KEY = "@gatimitra/last_device_location_v1";
const MIN = 60_000;

test("classifyFreshness buckets (§8)", async () => {
  const { classifyFreshness } = await load();
  const now = 10_000_000;
  assert.equal(classifyFreshness(null, now), "UNKNOWN");
  assert.equal(classifyFreshness(now, now), "FRESH");
  assert.equal(classifyFreshness(now - 1 * MIN, now), "FRESH"); // <2 min
  assert.equal(classifyFreshness(now - 5 * MIN, now), "RECENT"); // 2–15 min
  assert.equal(classifyFreshness(now - 20 * MIN, now), "STALE"); // >15 min
  assert.equal(classifyFreshness(now + 5 * MIN, now), "FRESH"); // clock skew → not stale
});

test("loadLastKnownLocation returns a valid recent entry", async () => {
  const { loadLastKnownLocation, saveLastKnownLocation } = await load();
  store = {};
  const now = Date.now();
  saveLastKnownLocation({
    lat: 29.68,
    lon: 76.99,
    accuracy: 14,
    updatedAt: now,
    source: "balanced",
    address: null,
  });
  // saveLastKnownLocation is fire-and-forget; give the microtask a tick.
  await new Promise((r) => setTimeout(r, 0));
  const loaded = await loadLastKnownLocation(now);
  assert.ok(loaded);
  assert.equal(loaded!.lat, 29.68);
  assert.equal(loaded!.accuracy, 14);
  assert.equal(loaded!.source, "balanced");
});

test("loadLastKnownLocation rejects an entry older than the max age", async () => {
  const { loadLastKnownLocation } = await load();
  const old = 1_000_000_000_000;
  store = {
    [KEY]: JSON.stringify({ lat: 29.68, lon: 76.99, accuracy: 10, updatedAt: old, source: "watch", address: null }),
  };
  const now = old + 25 * 60 * 60_000; // 25 h later (> 24 h cap)
  assert.equal(await loadLastKnownLocation(now), null);
});

test("loadLastKnownLocation rejects corrupt / incomplete data", async () => {
  const { loadLastKnownLocation } = await load();
  store = { [KEY]: JSON.stringify({ lon: 76.99, updatedAt: Date.now() }) }; // no lat
  assert.equal(await loadLastKnownLocation(), null);

  store = { [KEY]: "{not json" };
  assert.equal(await loadLastKnownLocation(), null);
});

test("loadLastKnownLocation returns null when nothing stored", async () => {
  const { loadLastKnownLocation } = await load();
  store = {};
  assert.equal(await loadLastKnownLocation(), null);
});

test("clearLastKnownLocation removes the entry", async () => {
  const { clearLastKnownLocation, loadLastKnownLocation } = await load();
  store = { [KEY]: JSON.stringify({ lat: 1, lon: 1, accuracy: 1, updatedAt: Date.now(), source: "watch", address: null }) };
  clearLastKnownLocation();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(await loadLastKnownLocation(), null);
});
