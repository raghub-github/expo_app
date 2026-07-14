import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveNextSlotTransitionIso,
  merchantStoresRowHasStaleOnlineFlags,
  schedulePhaseImpliesSurfaceClosed,
} from "./store-schedule-engine.js";

function mockHoursRow(): Record<string, unknown> {
  return {
    same_for_all_days: false,
    closed_days: [],
    monday_open: true,
    monday_slot1_start: "09:00",
    monday_slot1_end: "22:00",
  };
}

test("resolveNextSlotTransitionIso returns next close while within slot", () => {
  const ref = new Date("2026-06-22T12:00:00+05:30"); // Monday
  const iso = resolveNextSlotTransitionIso(mockHoursRow(), 1, 12 * 60, ref);
  assert.ok(iso);
  assert.match(String(iso), /T16:30:00\.000Z$/); // 22:00 IST
});

test("resolveNextSlotTransitionIso returns next open when outside slot", () => {
  const ref = new Date("2026-06-22T08:00:00+05:30"); // Monday
  const iso = resolveNextSlotTransitionIso(mockHoursRow(), 1, 8 * 60, ref);
  assert.ok(iso);
});

test("merchantStoresRowHasStaleOnlineFlags detects orphan online booleans", () => {
  assert.equal(
    merchantStoresRowHasStaleOnlineFlags({
      operational_status: "CLOSED",
      is_active: true,
      is_accepting_orders: false,
      is_available: false,
    }),
    true
  );
  assert.equal(
    merchantStoresRowHasStaleOnlineFlags({
      operational_status: "CLOSED",
      is_active: false,
      is_accepting_orders: false,
      is_available: false,
    }),
    false
  );
});

test("schedulePhaseImpliesSurfaceClosed is true outside WITHIN_SLOT", () => {
  assert.equal(schedulePhaseImpliesSurfaceClosed("OUTSIDE_HOURS", null), true);
  assert.equal(schedulePhaseImpliesSurfaceClosed("WITHIN_SLOT", null), false);
  assert.equal(
    schedulePhaseImpliesSurfaceClosed("WITHIN_SLOT", "2026-07-10T12:00:00.000Z"),
    true
  );
});

