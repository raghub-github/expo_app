import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";

function mockDb(t: TestContext) {
  const inserts: unknown[][] = [];
  const sqlFn = async (_strings: TemplateStringsArray, ...values: unknown[]) => {
    inserts.push(values);
    return [];
  };
  t.mock.module("../db/client.js", { namedExports: { getSql: () => sqlFn, getDb: () => ({}) } });
  return { inserts };
}

test("a hung run is released at the deadline so the next tick can run", async (t) => {
  mockDb(t);
  const { withRunDeadline, ReconcilerDeadlineError } = await import(`./reconciler-guard.js?a=${Math.random()}`);
  const started = Date.now();
  await assert.rejects(
    withRunDeadline("test", 50, () => new Promise(() => undefined)), // never settles
    (e: unknown) => e instanceof ReconcilerDeadlineError
  );
  assert.ok(Date.now() - started < 1000);
});

test("a run that finishes in time returns its value", async (t) => {
  mockDb(t);
  const { withRunDeadline } = await import(`./reconciler-guard.js?b=${Math.random()}`);
  assert.equal(await withRunDeadline("test", 1000, async () => 42), 42);
});

test("the same failure for the same order is recorded once per hour", async (t) => {
  const db = mockDb(t);
  const { recordReconcilerFailure } = await import(`./reconciler-guard.js?c=${Math.random()}`);
  const f = { eventType: "PARCEL_SETTLEMENT_RETRY_FAILED", orderId: "GM1", message: "boom" };
  await recordReconcilerFailure(f);
  await recordReconcilerFailure(f);
  await recordReconcilerFailure(f);
  assert.equal(db.inserts.length, 1);
  await recordReconcilerFailure({ ...f, message: "different" });
  await recordReconcilerFailure({ ...f, orderId: "GM2" });
  assert.equal(db.inserts.length, 3, "a new message or another order is recorded");
  assert.equal(db.inserts[0]![0], "PARCEL_SETTLEMENT_RETRY_FAILED");
  assert.equal(db.inserts[0]![1], "GM1");
});

test("recording never throws, even when the database is down", async (t) => {
  t.mock.module("../db/client.js", {
    namedExports: {
      getSql: () => async () => {
        throw new Error("db down");
      },
      getDb: () => ({}),
    },
  });
  const { recordReconcilerFailure } = await import(`./reconciler-guard.js?d=${Math.random()}`);
  await recordReconcilerFailure({ eventType: "X", orderId: null, message: "m" });
});
