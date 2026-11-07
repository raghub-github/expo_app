import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

type Loc = {
  coords: { latitude: number; longitude: number; accuracy?: number | null };
  timestamp?: number;
} | null;
type WatchCb = (loc: Loc) => void;

const Accuracy = { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5 };

let lastKnownImpl: () => Promise<Loc> = async () => null;
let currentImpl: (arg: { accuracy: number }) => Promise<Loc> = () => new Promise(() => {});
let watchCb: WatchCb | null = null;
let watchImpl: () => Promise<void> = async () => {};
let removed = 0;
let watchOptions: Record<string, unknown> | null = null;
const currentOptions: Array<Record<string, unknown>> = [];

mock.module("expo-location", {
  namedExports: {
    Accuracy,
    getLastKnownPositionAsync: () => lastKnownImpl(),
    getCurrentPositionAsync: (arg: { accuracy: number }) => {
      currentOptions.push(arg);
      return currentImpl(arg);
    },
    watchPositionAsync: async (opts: Record<string, unknown>, cb: WatchCb) => {
      watchOptions = opts;
      await watchImpl();
      watchCb = cb;
      return {
        remove: () => {
          removed += 1;
        },
      };
    },
  },
});

async function load() {
  return import("./progressivePosition");
}

const fix = (accuracy: number | null, ageMs = 0, lat = 25.6): Loc => ({
  coords: { latitude: lat, longitude: 85.1, accuracy },
  timestamp: Date.now() - ageMs,
});
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  lastKnownImpl = async () => null;
  currentImpl = () => new Promise(() => {});
  watchImpl = async () => {};
  watchCb = null;
  removed = 0;
  watchOptions = null;
  currentOptions.length = 0;
});

test("effectiveAccuracyM charges a fix for its age", async () => {
  const { effectiveAccuracyM } = await load();
  const now = 1_000_000;
  assert.equal(effectiveAccuracyM({ accuracy: 10, timestampMs: now }, now), 10);
  assert.equal(effectiveAccuracyM({ accuracy: 10, timestampMs: now - 120_000 }, now), 610);
});

test("first fix is the cached one, without waiting on any live source", async () => {
  const { acquireProgressivePosition } = await load();
  lastKnownImpl = async () => fix(30, 5_000);
  const a = acquireProgressivePosition({ budgetMs: 200 });
  const first = await a.firstFix;
  assert.equal(first?.source, "last-known");
  a.stop();
});

test("a late one-shot still counts: nothing that arrives is thrown away", async () => {
  const { acquireProgressivePosition } = await load();
  currentImpl = (arg) =>
    arg.accuracy === Accuracy.Low
      ? new Promise((r) => setTimeout(() => r(fix(900)), 40))
      : new Promise(() => {});
  const a = acquireProgressivePosition({ budgetMs: 300 });
  const first = await a.firstFix;
  assert.equal(first?.source, "low");
  a.stop();
});

test("streams improvements only: worse or near-identical fixes do not fire onFix", async () => {
  const { acquireProgressivePosition } = await load();
  const seen: Array<number | null> = [];
  const a = acquireProgressivePosition({ budgetMs: 400, onFix: (f) => seen.push(f.accuracy) });
  await tick();
  watchCb!(fix(200));
  watchCb!(fix(250)); // worse
  watchCb!(fix(199)); // noise
  watchCb!(fix(90)); // real improvement
  assert.deepEqual(seen, [200, 90]);
  a.stop();
});

test("a goal-quality fix ends the session and releases the GPS", async () => {
  const { acquireProgressivePosition } = await load();
  const a = acquireProgressivePosition({ budgetMs: 5_000 });
  await tick();
  watchCb!(fix(12));
  const best = await a.done;
  assert.equal(best?.accuracy, 12);
  assert.equal(removed, 1);
});

test("a good fix that stops improving settles early, not at the budget", async () => {
  const { acquireProgressivePosition } = await load();
  const a = acquireProgressivePosition({ budgetMs: 5_000, settleMs: 30 });
  await tick();
  watchCb!(fix(45));
  const t0 = Date.now();
  await a.done;
  assert.ok(Date.now() - t0 < 1_000);
  assert.equal(removed, 1);
});

test("the budget always ends the session, keeping the best fix", async () => {
  const { acquireProgressivePosition } = await load();
  const a = acquireProgressivePosition({ budgetMs: 40 });
  await tick();
  watchCb!(fix(400));
  const best = await a.done;
  assert.equal(best?.accuracy, 400);
  assert.equal(removed, 1);
});

test("no fix at all resolves null rather than hanging", async () => {
  const { acquireProgressivePosition } = await load();
  const a = acquireProgressivePosition({ budgetMs: 30 });
  assert.equal(await a.firstFix, null);
  assert.equal(await a.done, null);
});

test("when every live source fails it finishes at once, not at the budget", async () => {
  const { acquireProgressivePosition } = await load();
  currentImpl = async () => {
    throw new Error("denied");
  };
  watchImpl = async () => {
    throw new Error("denied");
  };
  const t0 = Date.now();
  const a = acquireProgressivePosition({ budgetMs: 5_000 });
  assert.equal(await a.done, null);
  assert.ok(Date.now() - t0 < 1_000);
});

test("a watch that starts after stop() is removed immediately (no GPS leak)", async () => {
  const { acquireProgressivePosition } = await load();
  watchImpl = () => new Promise((r) => setTimeout(r, 20));
  const a = acquireProgressivePosition({ budgetMs: 5_000 });
  a.stop();
  await tick(40);
  assert.equal(removed, 1);
});

test("never allows the Android accuracy dialog: this runs unprompted on app open", async () => {
  const { acquireProgressivePosition } = await load();
  const a = acquireProgressivePosition({ budgetMs: 20 });
  await tick();
  assert.equal(watchOptions?.mayShowUserSettingsDialog, false);
  assert.ok(currentOptions.every((o) => o.mayShowUserSettingsDialog === false));
  a.stop();
});

test("an onFix that throws does not end the session", async () => {
  const { acquireProgressivePosition } = await load();
  const a = acquireProgressivePosition({
    budgetMs: 200,
    onFix: () => {
      throw new Error("consumer bug");
    },
  });
  await tick();
  watchCb!(fix(300));
  watchCb!(fix(100));
  assert.equal(a.best()?.accuracy, 100);
  a.stop();
});
