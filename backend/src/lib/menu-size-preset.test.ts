import test from "node:test";
import assert from "node:assert/strict";
import {
  formatMenuSize,
  normalizeSizeWrite,
  parseSizePreset,
  sizeModeFromPreset,
  sizePresetLabel,
} from "./menu-size-preset.js";

test("parseSizePreset accepts DB and UI labels", () => {
  assert.equal(parseSizePreset("REGULAR"), "REGULAR");
  assert.equal(parseSizePreset("standard"), "STANDARD");
  assert.equal(parseSizePreset("Premium"), "PREMIUM");
  assert.equal(parseSizePreset(null), null);
  assert.equal(parseSizePreset(""), null);
  assert.equal(parseSizePreset("MANUAL"), null);
});

test("normalizeSizeWrite clears size/unit for presets", () => {
  assert.deepEqual(normalizeSizeWrite({ size_preset: "REGULAR", size_value: "500", size_unit: "grams" }), {
    size_preset: "REGULAR",
    size_value: null,
    size_unit: null,
  });
  assert.deepEqual(normalizeSizeWrite({ size_preset: null, size_value: "500", size_unit: "grams" }), {
    size_preset: null,
    size_value: "500",
    size_unit: "grams",
  });
  assert.deepEqual(normalizeSizeWrite({ size_preset: "", size_value: "", size_unit: "" }), {
    size_preset: null,
    size_value: null,
    size_unit: null,
  });
});

test("formatMenuSize prefers preset over manual size", () => {
  assert.equal(formatMenuSize("REGULAR", "500", "grams"), "Regular");
  assert.equal(formatMenuSize(null, "500", "ml"), "500 ml");
  assert.equal(formatMenuSize(null, "1", "L"), "1 L");
  assert.equal(formatMenuSize(null, null, null), null);
  assert.equal(sizePresetLabel("STANDARD"), "Standard");
  assert.equal(sizeModeFromPreset(null), "MANUAL");
  assert.equal(sizeModeFromPreset("PREMIUM"), "PREMIUM");
});
