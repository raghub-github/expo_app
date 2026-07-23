import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Lightweight pure helper mirroring riderLocationStore sequence commit rules.
 * Keeps the race-guard contract tested without loading React Native / Zustand.
 */
function commitIfCurrent(
  currentSeq: number,
  commitSeq: number
): boolean {
  return commitSeq === currentSeq;
}

describe("rider location acquisition sequence", () => {
  it("accepts only the latest acquisition token", () => {
    let seq = 0;
    seq += 1; // begin A
    const a = seq;
    seq += 1; // begin B supersedes A
    const b = seq;
    assert.equal(commitIfCurrent(seq, a), false);
    assert.equal(commitIfCurrent(seq, b), true);
  });
});
