import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyOtpBackspace,
  applyOtpInput,
  applyOtpPaste,
  emptyOtpCells,
  otpCellsComplete,
  otpCellsToCode,
} from "./otpDigitEdit";

describe("otpDigitEdit", () => {
  it("clears only the focused digit and stays there", () => {
    const cells = ["1", "3", "4", "5", "0", "0"];
    const result = applyOtpBackspace(cells, 2);
    assert.deepEqual(result.cells, ["1", "3", "", "5", "0", "0"]);
    assert.equal(result.index, 2);
    assert.equal(otpCellsToCode(result.cells), "13500");
    assert.equal(otpCellsComplete(result.cells), false);
  });

  it("backspace on an empty box clears the previous digit", () => {
    const cells = ["1", "3", "", "5", "0", "0"];
    const result = applyOtpBackspace(cells, 2);
    assert.deepEqual(result.cells, ["1", "", "", "5", "0", "0"]);
    assert.equal(result.index, 1);
  });

  it("backspace on box 1 does not move away", () => {
    const empty = applyOtpBackspace(emptyOtpCells(), 0);
    assert.deepEqual(empty.cells, ["", "", "", "", "", ""]);
    assert.equal(empty.index, 0);
    const cleared = applyOtpBackspace(["1", "3", "4", "5", "0", "0"], 0);
    assert.deepEqual(cleared.cells, ["", "3", "4", "5", "0", "0"]);
    assert.equal(cleared.index, 0);
  });

  it("replaces a digit in place and does not shift neighbors", () => {
    const result = applyOtpInput(["1", "3", "4", "5", "0", "0"], 2, "7");
    assert.deepEqual(result.cells, ["1", "3", "7", "5", "0", "0"]);
    assert.equal(result.index, 3);
  });

  it("overflows fast extra keys into the next boxes instead of replacing", () => {
    const first = applyOtpInput(emptyOtpCells(), 0, "6");
    assert.deepEqual(first.cells, ["6", "", "", "", "", ""]);
    const burst = applyOtpInput(first.cells, 0, "63");
    assert.deepEqual(burst.cells, ["6", "3", "", "", "", ""]);
    const rest = applyOtpInput(burst.cells, 0, "630053");
    assert.deepEqual(rest.cells, ["6", "3", "0", "0", "5", "3"]);
    assert.equal(rest.index, 5);
    const stale = applyOtpInput(rest.cells, 0, "60");
    assert.deepEqual(stale.cells, ["6", "3", "0", "0", "5", "3"]);
  });

  it("allows a digit in box 4 while earlier boxes are empty", () => {
    const result = applyOtpInput(emptyOtpCells(), 3, "8");
    assert.deepEqual(result.cells, ["", "", "", "8", "", ""]);
    assert.equal(result.index, 4);
  });

  it("does not focus a seventh box after the last digit", () => {
    const result = applyOtpInput(["1", "3", "4", "5", "0", ""], 5, "2");
    assert.deepEqual(result.cells, ["1", "3", "4", "5", "0", "2"]);
    assert.equal(result.index, 5);
    assert.equal(otpCellsComplete(result.cells), true);
  });

  it("pastes a full 6-digit code across all boxes", () => {
    const result = applyOtpPaste(emptyOtpCells(), 2, "354601");
    assert.deepEqual(result.cells, ["3", "5", "4", "6", "0", "1"]);
    assert.equal(result.index, 5);
  });

  it("pastes a partial code from the active box and strips non-digits", () => {
    const result = applyOtpPaste(["1", "3", "4", "5", "0", "0"], 2, "7-8x");
    assert.deepEqual(result.cells, ["1", "3", "7", "8", "0", "0"]);
    assert.equal(result.index, 4);
  });
});
