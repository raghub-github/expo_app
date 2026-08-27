import { test, mock } from "node:test";
import assert from "node:assert/strict";

// Mutable per-test implementations behind a stable mocked "expo-location".
type Loc = { coords: { latitude: number; longitude: number; accuracy?: number | null }; timestamp?: number } | null;
let lastKnownImpl: (arg?: unknown) => Promise<Loc> = async () => null;
let currentImpl: (arg: { accuracy: number }) => Promise<Loc> = async () => {
  throw new Error("no live fix");
};
const calls: string[] = [];

const Accuracy = { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5 };

mock.module("expo-location", {
  namedExports: {
    Accuracy,
    getLastKnownPositionAsync: (arg?: unknown) => {
      calls.push("lastKnown");
      return lastKnownImpl(arg);
    },
    getCurrentPositionAsync: (arg: { accuracy: number }) => {
      calls.push(`current:${arg.accuracy}`);
      return currentImpl(arg);
    },
  },
});

async function load() {
  const m = await import("./fastPosition");
  return m.getFastPosition;
}

function reset() {
  calls.length = 0;
  lastKnownImpl = async () => null;
  currentImpl = async () => {
    throw new Error("no live fix");
  };
}

const fix = (lat = 29.68, lon = 76.99, accuracy: number | null = 12, timestamp = 1_700_000_000_000): Loc => ({
  coords: { latitude: lat, longitude: lon, accuracy },
  timestamp,
});

test("returns OS last-known FIRST without a live GPS call", async () => {
  const getFastPosition = await load();
  reset();
  lastKnownImpl = async () => fix(29.68, 76.99, 10, 1_700_000_000_000);
  const r = await getFastPosition();
  assert.equal(r.source, "last-known");
  assert.equal(r.latitude, 29.68);
  assert.equal(r.accuracy, 10);
  assert.equal(r.timestampMs, 1_700_000_000_000);
  assert.deepEqual(calls, ["lastKnown"]); // never called getCurrentPositionAsync
});

test("falls back to a quick Balanced live fix when no last-known", async () => {
  const getFastPosition = await load();
  reset();
  lastKnownImpl = async () => null;
  currentImpl = async (arg) => (arg.accuracy === Accuracy.Balanced ? fix(29.7, 77.0, 30) : (() => { throw new Error("x"); })());
  const r = await getFastPosition();
  assert.equal(r.source, "balanced");
  assert.equal(r.accuracy, 30);
  assert.deepEqual(calls, ["lastKnown", `current:${Accuracy.Balanced}`]);
});

test("falls back to Low when last-known absent and Balanced fails", async () => {
  const getFastPosition = await load();
  reset();
  lastKnownImpl = async () => null;
  currentImpl = async (arg) => {
    if (arg.accuracy === Accuracy.Balanced) throw new Error("balanced failed");
    if (arg.accuracy === Accuracy.Low) return fix(29.71, 77.01, 200);
    throw new Error("unexpected accuracy");
  };
  const r = await getFastPosition();
  assert.equal(r.source, "low");
  assert.equal(r.accuracy, 200);
  assert.deepEqual(calls, ["lastKnown", `current:${Accuracy.Balanced}`, `current:${Accuracy.Low}`]);
});

test("rejects when nothing yields a usable fix", async () => {
  const getFastPosition = await load();
  reset();
  lastKnownImpl = async () => null;
  currentImpl = async () => {
    throw new Error("all failed");
  };
  await assert.rejects(() => getFastPosition(), /Could not get a fast device location/);
});

test("ignores an invalid (0,0) last-known and uses the live fix", async () => {
  const getFastPosition = await load();
  reset();
  lastKnownImpl = async () => fix(0, 0, 5); // null-island → rejected by validateCoords
  currentImpl = async (arg) => (arg.accuracy === Accuracy.Balanced ? fix(29.72, 77.02, 25) : null);
  const r = await getFastPosition();
  assert.equal(r.source, "balanced");
  assert.equal(r.latitude, 29.72);
});
