import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseWarningWindows,
  daysUntil,
  dlExpiryStatus,
  crossedUnnotifiedWindows,
  DEFAULT_DL_EXPIRY_WARNING_DAYS,
} from "./dlExpiry.ts";

test("parseWarningWindows: default, custom, dedupe/sort-desc, garbage → default", () => {
  assert.deepEqual(parseWarningWindows(null), DEFAULT_DL_EXPIRY_WARNING_DAYS);
  assert.deepEqual(parseWarningWindows("7, 1, 30"), [30, 7, 1]);
  assert.deepEqual(parseWarningWindows("5,5,5"), [5]);
  assert.deepEqual(parseWarningWindows("abc"), DEFAULT_DL_EXPIRY_WARNING_DAYS);
});

test("daysUntil: whole days, negative once past", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  assert.equal(daysUntil("2026-06-25", now), 9);
  assert.equal(daysUntil("2026-06-15T12:00:00Z", now), 0);
  assert.equal(daysUntil("2026-06-10", now), -6);
  assert.equal(daysUntil(null, now), null);
});

test("dlExpiryStatus: VALID / EXPIRING_SOON / EXPIRED / UNKNOWN", () => {
  const now = new Date("2026-06-15T00:00:00Z");
  const w = [30, 15, 7, 3, 1];
  assert.equal(dlExpiryStatus("2026-12-01", now, w), "VALID"); // > 30 days
  assert.equal(dlExpiryStatus("2026-06-25", now, w), "EXPIRING_SOON"); // 10 days
  assert.equal(dlExpiryStatus("2026-06-14", now, w), "EXPIRED");
  assert.equal(dlExpiryStatus(null, now, w), "UNKNOWN");
});

test("crossedUnnotifiedWindows: catch-up + no re-notify + expired returns none", () => {
  const w = [30, 15, 7, 3, 1];
  // 10 days out, nothing sent → both 30 and 15 crossed; most-urgent-first.
  assert.deepEqual(crossedUnnotifiedWindows(10, w, []), [15, 30]);
  // 10 days out, 15 already sent → only 30 remains crossed.
  assert.deepEqual(crossedUnnotifiedWindows(10, w, [15]), [30]);
  // 2 days out, 30/15/7/3 sent → 1-day window not yet crossed (2 > 1) → nothing due.
  assert.deepEqual(crossedUnnotifiedWindows(2, w, [30, 15, 7, 3]), []);
  // 1 day out, 30/15/7/3 sent → the 1-day window is now due.
  assert.deepEqual(crossedUnnotifiedWindows(1, w, [30, 15, 7, 3]), [1]);
  // 40 days out → nothing crossed.
  assert.deepEqual(crossedUnnotifiedWindows(40, w, []), []);
  // expired → none (handled by eligibility, not a warning).
  assert.deepEqual(crossedUnnotifiedWindows(-1, w, []), []);
});
