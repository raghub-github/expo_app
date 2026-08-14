import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyRiderDeviceLogin,
  RIDER_DEVICE_CHANGE_LIMIT_24H,
  RIDER_DEVICE_CHANGE_LIMIT_30D,
} from "./rider-device-change-policy.js";

const baseArgs = {
  count24h: 0,
  count30d: 0,
  oldestInWindow24h: null,
  oldestInWindow30d: null,
};

test("no prior device -> first_login, regardless of counts", () => {
  const result = classifyRiderDeviceLogin({
    ...baseArgs,
    lastDeviceId: null,
    incomingDeviceId: "device-a",
    count24h: 999,
    count30d: 999,
  });
  assert.deepEqual(result, { kind: "first_login" });
});

test("same device -> same_device, does not need counts populated", () => {
  const result = classifyRiderDeviceLogin({
    ...baseArgs,
    lastDeviceId: "device-a",
    incomingDeviceId: "device-a",
    count24h: 999,
    count30d: 999,
  });
  assert.deepEqual(result, { kind: "same_device" });
});

test("different device, under both limits -> device_change_allowed", () => {
  const result = classifyRiderDeviceLogin({
    ...baseArgs,
    lastDeviceId: "device-a",
    incomingDeviceId: "device-b",
    count24h: RIDER_DEVICE_CHANGE_LIMIT_24H - 1,
    count30d: RIDER_DEVICE_CHANGE_LIMIT_30D - 1,
  });
  assert.deepEqual(result, { kind: "device_change_allowed" });
});

test("24h boundary: one under limit allows, at limit rejects", () => {
  const allowed = classifyRiderDeviceLogin({
    ...baseArgs,
    lastDeviceId: "device-a",
    incomingDeviceId: "device-b",
    count24h: RIDER_DEVICE_CHANGE_LIMIT_24H - 1,
  });
  assert.equal(allowed.kind, "device_change_allowed");

  const oldest = new Date("2026-01-01T00:00:00.000Z");
  const rejected = classifyRiderDeviceLogin({
    ...baseArgs,
    lastDeviceId: "device-a",
    incomingDeviceId: "device-b",
    count24h: RIDER_DEVICE_CHANGE_LIMIT_24H,
    oldestInWindow24h: oldest,
  });
  assert.equal(rejected.kind, "device_change_rejected");
  if (rejected.kind !== "device_change_rejected") return;
  assert.equal(rejected.limitType, "24h");
  assert.equal(rejected.retryAt.toISOString(), new Date(oldest.getTime() + 24 * 60 * 60 * 1000).toISOString());
});

test("30d boundary: one under limit allows, at limit rejects", () => {
  const allowed = classifyRiderDeviceLogin({
    ...baseArgs,
    lastDeviceId: "device-a",
    incomingDeviceId: "device-b",
    count30d: RIDER_DEVICE_CHANGE_LIMIT_30D - 1,
  });
  assert.equal(allowed.kind, "device_change_allowed");

  const oldest = new Date("2026-01-01T00:00:00.000Z");
  const rejected = classifyRiderDeviceLogin({
    ...baseArgs,
    lastDeviceId: "device-a",
    incomingDeviceId: "device-b",
    count30d: RIDER_DEVICE_CHANGE_LIMIT_30D,
    oldestInWindow30d: oldest,
  });
  assert.equal(rejected.kind, "device_change_rejected");
  if (rejected.kind !== "device_change_rejected") return;
  assert.equal(rejected.limitType, "30d");
  assert.equal(rejected.retryAt.toISOString(), new Date(oldest.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString());
});

test("both limits breached simultaneously -> 24h wins (more immediate/specific)", () => {
  const result = classifyRiderDeviceLogin({
    lastDeviceId: "device-a",
    incomingDeviceId: "device-b",
    count24h: RIDER_DEVICE_CHANGE_LIMIT_24H,
    count30d: RIDER_DEVICE_CHANGE_LIMIT_30D,
    oldestInWindow24h: new Date("2026-01-01T00:00:00.000Z"),
    oldestInWindow30d: new Date("2026-01-01T00:00:00.000Z"),
  });
  assert.equal(result.kind, "device_change_rejected");
  if (result.kind !== "device_change_rejected") return;
  assert.equal(result.limitType, "24h");
});

test("30d under limit but 24h under limit too -> allowed even with high 30d count", () => {
  const result = classifyRiderDeviceLogin({
    ...baseArgs,
    lastDeviceId: "device-a",
    incomingDeviceId: "device-b",
    count24h: 0,
    count30d: RIDER_DEVICE_CHANGE_LIMIT_30D - 1,
  });
  assert.equal(result.kind, "device_change_allowed");
});
