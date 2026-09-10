import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildResponsiveMetrics,
  clamp,
  responsiveFont,
  responsiveSpacing,
  responsiveWidth,
  resolveSizeClass,
} from "../theme/responsive";

test("resolveSizeClass uses width breakpoints", () => {
  assert.equal(resolveSizeClass(320), "compact");
  assert.equal(resolveSizeClass(390), "regular");
  assert.equal(resolveSizeClass(720), "wide");
});

test("buildResponsiveMetrics flags short / compact layouts", () => {
  const compact = buildResponsiveMetrics(320, 568, 1.3);
  assert.equal(compact.isCompactWidth, true);
  assert.equal(compact.sizeClass, "compact");
  assert.ok(compact.layoutFontScale >= 1);

  const tall = buildResponsiveMetrics(390, 844, 1);
  assert.equal(tall.isCompactWidth, false);
  assert.equal(tall.isShortHeight, false);
});

test("responsiveWidth stays within clamps", () => {
  const narrow = responsiveWidth(100, 320);
  const wide = responsiveWidth(100, 480);
  assert.ok(narrow >= 85 && narrow <= 120);
  assert.ok(wide >= narrow);
});

test("responsiveFont respects fontScale without exploding", () => {
  const base = responsiveFont(14, 390, 1);
  const large = responsiveFont(14, 390, 1.5);
  assert.ok(large >= base);
  assert.ok(large <= 14 * 1.35);
});

test("responsiveSpacing and clamp helpers", () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  const s = responsiveSpacing(16, 320);
  assert.ok(s >= 12 && s <= 20);
});
