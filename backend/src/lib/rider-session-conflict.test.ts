import { test } from "node:test";
import assert from "node:assert/strict";
import { findConflictingRiderSession } from "./rider-session-conflict.ts";

// A fake tagged-template `sql` that ignores the query and returns canned rows.
// (SQL semantics — same-device exclusion + 7-day staleness — are validated live against
// the real DB; here we lock down the row → ConflictingRiderSession mapping.)
function fakeSql(rows: Array<Record<string, unknown>>) {
  return ((..._args: unknown[]) => Promise.resolve(rows)) as never;
}

test("maps a device_model row to the conflict shape (§21)", async () => {
  const c = await findConflictingRiderSession(
    fakeSql([
      {
        id: 7,
        device_id: "dev_other",
        device_model: "Samsung Galaxy S21",
        os: "android",
        last_active: new Date("2026-02-01T10:00:00.000Z"),
      },
    ]),
    { userId: "usr_42", deviceId: "dev_this" },
  );
  assert.ok(c);
  assert.equal(c!.sessionId, 7);
  assert.equal(c!.deviceId, "dev_other");
  assert.equal(c!.deviceLabel, "Samsung Galaxy S21");
  assert.equal(c!.platform, "android");
  assert.equal(c!.lastActiveAt, "2026-02-01T10:00:00.000Z");
});

test("falls back to a platform label when no device_model (§6 safe context)", async () => {
  const c = await findConflictingRiderSession(
    fakeSql([{ id: 9, device_id: "dev_x", device_model: null, os: "ios", last_active: null }]),
    { userId: "usr_1", deviceId: "dev_this" },
  );
  assert.ok(c);
  assert.equal(c!.deviceLabel, "Ios device");
  assert.equal(c!.platform, "ios");
  assert.equal(c!.lastActiveAt, null);
});

test("defaults platform to android when os is missing", async () => {
  const c = await findConflictingRiderSession(
    fakeSql([{ id: 3, device_id: "dev_x", device_model: "", os: "", last_active: null }]),
    { userId: "usr_1", deviceId: "dev_this" },
  );
  assert.ok(c);
  assert.equal(c!.platform, "android");
  assert.equal(c!.deviceLabel, "Android device");
});

test("no active other-device session → null (login proceeds directly)", async () => {
  const c = await findConflictingRiderSession(fakeSql([]), {
    userId: "usr_1",
    deviceId: "dev_this",
  });
  assert.equal(c, null);
});
