import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isVegStoreFilterActive,
  isVegToggleOn,
  mergeVegModePrefs,
  parseStoredVegMode,
} from "./vegMode";

const monday = 1;
const sunday = 0;

describe("vegMode", () => {
  it("maps legacy vegOnly true to Pure Veg restaurants, all days", () => {
    const prefs = parseStoredVegMode({ vegOnly: true });
    assert.equal(prefs.enabled, true);
    assert.equal(prefs.storeScope, "pure_veg_only");
    assert.equal(prefs.weekdays, null);
    assert.equal(isVegToggleOn(prefs, monday), true);
    assert.equal(isVegStoreFilterActive(prefs, monday), true);
  });

  it("does not hide mixed stores when All restaurants is selected", () => {
    const prefs = parseStoredVegMode({
      enabled: true,
      storeScope: "all_restaurants",
      weekdays: null,
    });
    assert.equal(isVegToggleOn(prefs, monday), true);
    assert.equal(isVegStoreFilterActive(prefs, monday), false);
  });

  it("auto-filters Pure Veg only on selected days and not on other days", () => {
    const prefs = parseStoredVegMode({
      enabled: true,
      storeScope: "pure_veg_only",
      weekdays: [1, 2, 3],
    });
    assert.equal(isVegStoreFilterActive(prefs, monday), true);
    assert.equal(isVegToggleOn(prefs, sunday), false);
    assert.equal(isVegStoreFilterActive(prefs, sunday), false);
  });

  it("keeps prefs off until Apply (enabled false)", () => {
    const prefs = parseStoredVegMode({
      enabled: false,
      storeScope: "pure_veg_only",
      weekdays: null,
    });
    assert.equal(isVegToggleOn(prefs, monday), false);
    assert.equal(isVegStoreFilterActive(prefs, monday), false);
  });

  it("does not re-enable from leftover vegOnly when enabled is explicitly false", () => {
    const prefs = parseStoredVegMode({
      enabled: false,
      vegOnly: true,
      storeScope: "pure_veg_only",
    });
    assert.equal(prefs.enabled, false);
    assert.equal(isVegToggleOn(prefs, monday), false);
  });

  it("prefers newer remote prefs when merging", () => {
    const merged = mergeVegModePrefs(
      {
        enabled: false,
        storeScope: "all_restaurants",
        weekdays: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        enabled: true,
        storeScope: "pure_veg_only",
        weekdays: [0],
        updatedAt: "2026-09-07T00:00:00.000Z",
      }
    );
    assert.equal(merged.enabled, true);
    assert.equal(merged.storeScope, "pure_veg_only");
    assert.deepEqual(merged.weekdays, [0]);
  });

  it("keeps local off on equal timestamps so stale remote cannot auto-on", () => {
    const merged = mergeVegModePrefs(
      {
        enabled: false,
        storeScope: "all_restaurants",
        weekdays: null,
        updatedAt: "2026-09-07T00:00:00.000Z",
      },
      {
        enabled: true,
        storeScope: "pure_veg_only",
        weekdays: null,
        updatedAt: "2026-09-07T00:00:00.000Z",
      }
    );
    assert.equal(merged.enabled, false);
  });
});
