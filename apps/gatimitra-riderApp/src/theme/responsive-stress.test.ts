/**
 * Layout stress metrics — verifies responsive helpers stay within bounds
 * across common Android widths and font scales (no UI runtime).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildResponsiveMetrics,
  responsiveFont,
  responsiveSpacing,
  responsiveWidth,
  MIN_TOUCH_TARGET,
  ensureTouchTarget,
} from "../theme/responsive";
import { resolveBottomDock } from "../lib/rider-bottom-dock";

const WIDTHS = [320, 360, 375, 390, 393, 412, 430, 480, 600];
const HEIGHTS = [568, 640, 667, 800, 844, 852, 915, 932];
const FONT_SCALES = [1.0, 1.15, 1.3, 1.5];

test("responsiveWidth stays usable across phone widths", () => {
  for (const w of WIDTHS) {
    const pad = responsiveSpacing(16, w);
    const btn = responsiveWidth(48, w, { min: 44, max: 56 });
    assert.ok(pad >= 12 && pad <= 20, `pad@${w}=${pad}`);
    assert.ok(ensureTouchTarget(btn) >= MIN_TOUCH_TARGET);
  }
});

test("responsiveFont never explodes at fontScale 1.5", () => {
  for (const w of WIDTHS) {
    for (const fs of FONT_SCALES) {
      const title = responsiveFont(20, w, fs, { min: 14, max: 28 });
      const body = responsiveFont(14, w, fs, { min: 11, max: 18 });
      const tab = responsiveFont(11, w, fs, { min: 10, max: 13 });
      assert.ok(title <= 28 && title >= 14, `title ${w}/${fs}=${title}`);
      assert.ok(body <= 18 && body >= 11, `body ${w}/${fs}=${body}`);
      assert.ok(tab <= 13 && tab >= 10, `tab ${w}/${fs}=${tab}`);
    }
  }
});

test("buildResponsiveMetrics across aspect ratios", () => {
  for (const w of WIDTHS) {
    for (const h of HEIGHTS) {
      const m = buildResponsiveMetrics(w, h, 1.3);
      assert.ok(m.width === w);
      assert.ok(m.aspectRatio > 0);
      if (w < 360) assert.equal(m.isCompactWidth, true);
    }
  }
});

test("bottom dock leaves room for content on short phones", () => {
  for (const h of [568, 640, 800]) {
    const dock = resolveBottomDock(h, {
      tabBarTotalHeight: 70,
      bottomPanelHeight: 62,
    });
    assert.ok(dock.aboveTabBar >= h - 70);
    assert.ok(dock.floatingBottom > 62);
  }
});
