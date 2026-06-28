import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDecimalOnBlur,
  parseDecimalOrZero,
  parseOptionalDecimal,
  parseOptionalInteger,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
} from "../slabInputUtils";

test("decimal typing: 2.5 stays 2.5 through sanitize", () => {
  assert.equal(sanitizeDecimalInput("2.5"), "2.5");
  assert.equal(parseOptionalDecimal("2.5"), 2.5);
});

test("decimal typing: 6.75 and 0.5", () => {
  assert.equal(sanitizeDecimalInput("6.75"), "6.75");
  assert.equal(parseOptionalDecimal("6.75"), 6.75);
  assert.equal(sanitizeDecimalInput("0.5"), "0.5");
  assert.equal(parseOptionalDecimal("0.5"), 0.5);
});

test("decimal typing: partial 2. is preserved while editing", () => {
  assert.equal(sanitizeDecimalInput("2."), "2.");
  assert.equal(parseOptionalDecimal("2."), null);
});

test("decimal typing: rejects invalid characters without destroying structure", () => {
  assert.equal(sanitizeDecimalInput("2..5"), "2.5");
  assert.equal(sanitizeDecimalInput("2a5"), "25");
  assert.equal(sanitizeDecimalInput("abc"), "");
});

test("backspace: empty string is allowed", () => {
  assert.equal(sanitizeDecimalInput(""), "");
  assert.equal(parseOptionalDecimal(""), null);
  assert.equal(parseDecimalOrZero(""), 0);
});

test("blur normalizes trailing decimal and empty", () => {
  assert.equal(normalizeDecimalOnBlur("2."), "2");
  assert.equal(normalizeDecimalOnBlur(""), "");
  assert.equal(normalizeDecimalOnBlur("19.5"), "19.5");
});

test("integer fields allow empty while editing", () => {
  assert.equal(sanitizeIntegerInput(""), "");
  assert.equal(parseOptionalInteger(""), null);
  assert.equal(parseOptionalInteger("100"), 100);
});

test("save-style decimal payload tolerates undefined fields", () => {
  assert.equal(parseOptionalDecimal(undefined), null);
  assert.equal(parseDecimalOrZero(undefined), 0);
  assert.equal(parseOptionalInteger(undefined), null);
});

test("save-style decimal payload", () => {
  const baseFare = parseOptionalDecimal("19.5");
  const perKm = parseOptionalDecimal("6.75");
  const minCharge = parseOptionalDecimal("25.25");
  assert.equal(baseFare, 19.5);
  assert.equal(perKm, 6.75);
  assert.equal(minCharge, 25.25);
});
