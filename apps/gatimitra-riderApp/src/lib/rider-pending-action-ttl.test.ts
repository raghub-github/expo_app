import {
  ACCEPT_ACTION_TTL_MS,
  DEFAULT_ACTION_TTL_MS,
  isRiderActionExpired,
  riderActionTtlMs,
} from "@/src/lib/rider-pending-action-ttl";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const NOW = 1_700_000_000_000;

describe("riderActionTtlMs", () => {
  it("expires an accept far sooner than a progress action", () => {
    assert.equal(riderActionTtlMs("accept"), ACCEPT_ACTION_TTL_MS);
    assert.ok(riderActionTtlMs("accept") < riderActionTtlMs("complete_ride"));
  });

  it("expires a reject on the same short offer window as accept", () => {
    assert.equal(riderActionTtlMs("reject"), ACCEPT_ACTION_TTL_MS);
  });

  it("gives every non-offer action the long default", () => {
    for (const t of [
      "reached_pickup",
      "reached_drop",
      "mark_pickup",
      "start_ride",
      "complete_ride",
      "verify_pickup_otp",
      "verify_delivery_otp",
      "cancel_assigned",
    ] as const) {
      assert.equal(riderActionTtlMs(t), DEFAULT_ACTION_TTL_MS, t);
    }
  });
});

describe("isRiderActionExpired", () => {
  it("keeps a just-queued accept", () => {
    assert.equal(isRiderActionExpired({ actionType: "accept", createdAt: NOW }, NOW), false);
  });

  it("keeps an accept right up to the TTL boundary", () => {
    assert.equal(
      isRiderActionExpired(
        { actionType: "accept", createdAt: NOW - ACCEPT_ACTION_TTL_MS },
        NOW
      ),
      false
    );
  });

  it("expires an accept past the TTL", () => {
    // The wedge: this row used to survive restarts forever, keeping the accept
    // slider stuck on "Accepting..." for that order with gestures ignored.
    assert.equal(
      isRiderActionExpired(
        { actionType: "accept", createdAt: NOW - ACCEPT_ACTION_TTL_MS - 1 },
        NOW
      ),
      true
    );
  });

  it("still replays a progress action hours later", () => {
    assert.equal(
      isRiderActionExpired(
        { actionType: "complete_ride", createdAt: NOW - 6 * 60 * 60 * 1000 },
        NOW
      ),
      false
    );
  });

  it("expires a progress action past a day", () => {
    assert.equal(
      isRiderActionExpired(
        { actionType: "complete_ride", createdAt: NOW - DEFAULT_ACTION_TTL_MS - 1 },
        NOW
      ),
      true
    );
  });

  it("treats a corrupt or missing createdAt as expired, never immortal", () => {
    for (const bad of [0, -1, Number.NaN, undefined as unknown as number]) {
      assert.equal(
        isRiderActionExpired({ actionType: "accept", createdAt: bad }, NOW),
        true,
        String(bad)
      );
    }
  });
});
