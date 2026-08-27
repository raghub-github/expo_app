import { test, mock } from "node:test";
import assert from "node:assert/strict";

// Isolate the orchestration from the real atomic policy + Redis publish.
const policyCalls: Array<Record<string, unknown>> = [];
const published: Array<{ riderId: number | string; event: Record<string, unknown> }> = [];

mock.module("./rider-device-change-policy.js", {
  namedExports: {
    applyRiderDeviceLoginPolicy: async (_sql: unknown, args: Record<string, unknown>) => {
      policyCalls.push(args);
      return { outcome: "ok", kind: "device_changed", revokedCount: 1 };
    },
  },
});
mock.module("../modules/realtime/publish.js", {
  namedExports: {
    publishRiderEvent: async (riderId: number | string, event: Record<string, unknown>) => {
      published.push({ riderId, event });
    },
  },
});

async function load() {
  return import("./rider-session-takeover.ts");
}

function reset() {
  policyCalls.length = 0;
  published.length = 0;
}

// Fake tagged-template sql: the takeover only queries prior active OTHER devices.
function fakeSql(priorRows: Array<{ device_id: string }>) {
  return ((..._args: unknown[]) => Promise.resolve(priorRows)) as never;
}

test("emitRiderSessionRevoked publishes one session.revoked per (non-empty) device (§27)", async () => {
  const { emitRiderSessionRevoked } = await load();
  reset();
  await emitRiderSessionRevoked(42, ["dev_a", "", "dev_b"]);
  assert.equal(published.length, 2);
  assert.deepEqual(
    published.map((p) => p.riderId),
    [42, 42],
  );
  assert.equal(published[0].event.type, "session.revoked");
  assert.equal(published[0].event.deviceId, "dev_a");
  assert.equal(published[0].event.reason, "DEVICE_TAKEOVER");
  assert.equal(published[1].event.deviceId, "dev_b");
});

test("takeover: revokes the old device, runs the atomic policy once, notifies the old device", async () => {
  const { performRiderDeviceTakeover } = await load();
  reset();
  const out = await performRiderDeviceTakeover(fakeSql([{ device_id: "dev_old" }]), {
    userId: "usr_42",
    riderId: 42,
    deviceId: "dev_new",
    ip: "1.2.3.4",
  });
  assert.deepEqual(out.revokedDeviceIds, ["dev_old"]);
  assert.equal(policyCalls.length, 1);
  assert.equal(policyCalls[0].deviceId, "dev_new");
  assert.equal(policyCalls[0].bypassPolicy, false);
  assert.equal(published.length, 1);
  assert.equal(published[0].event.deviceId, "dev_old");
  assert.equal(published[0].event.type, "session.revoked");
});

test("§20 idempotent repeat: no other active device → policy runs, but nothing is revoked/emitted", async () => {
  const { performRiderDeviceTakeover } = await load();
  reset();
  const out = await performRiderDeviceTakeover(fakeSql([]), {
    userId: "usr_42",
    riderId: 42,
    deviceId: "dev_new",
  });
  assert.deepEqual(out.revokedDeviceIds, []);
  assert.equal(policyCalls.length, 1); // same-device re-activation is a no-op inside the policy
  assert.equal(published.length, 0); // no SESSION_REVOKED storm on repeat taps
});

test("takeover notifies every prior device when more than one was active", async () => {
  const { performRiderDeviceTakeover } = await load();
  reset();
  const out = await performRiderDeviceTakeover(
    fakeSql([{ device_id: "dev_1" }, { device_id: "dev_2" }]),
    { userId: "usr_7", riderId: 7, deviceId: "dev_new" },
  );
  assert.deepEqual(out.revokedDeviceIds.sort(), ["dev_1", "dev_2"]);
  assert.equal(published.length, 2);
  assert.deepEqual(published.map((p) => p.event.deviceId).sort(), ["dev_1", "dev_2"]);
});
