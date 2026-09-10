/**
 * Unit tests for bottom-dock resolution (measured tab bar + panels).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveBottomDock,
  floatingControlsBottomInMap,
} from "../lib/rider-bottom-dock";

test("resolveBottomDock prefers measured tab bar height", () => {
  const dock = resolveBottomDock(800, {
    tabBarTotalHeight: 72,
    safeBottomInset: 0,
    bottomPanelHeight: 62,
  });
  assert.equal(dock.tabBarHeight, 72);
  assert.equal(dock.panelHeight, 62);
  assert.equal(dock.contentBottomInset, 72);
  assert.ok(dock.aboveTabBar === 800 - 72);
});

test("resolveBottomDock falls back when tab bar not measured", () => {
  const dock = resolveBottomDock(800, {
    tabBarTotalHeight: null,
    safeBottomInset: 24,
  });
  assert.ok(dock.tabBarHeight >= 58);
});

test("floatingControlsBottomInMap uses panel height", () => {
  assert.equal(floatingControlsBottomInMap({ panelHeight: 0, edge: 16 }), 16);
  assert.ok(floatingControlsBottomInMap({ panelHeight: 62, edge: 16 }) > 62);
  assert.ok(
    floatingControlsBottomInMap({ panelHeight: 62, offDuty: true, edge: 16 }) >
      floatingControlsBottomInMap({ panelHeight: 62, edge: 16 })
  );
});

test("tabBarVisible false zeros tab bar occupancy", () => {
  const dock = resolveBottomDock(800, {
    tabBarTotalHeight: 80,
    tabBarVisible: false,
    safeBottomInset: 20,
  });
  assert.equal(dock.tabBarHeight, 0);
});
