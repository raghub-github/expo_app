import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  shouldCatchUpAfterWsOpen,
  shouldSuspendRealtimeTransport,
} from "./realtime-lifecycle";

describe("shouldSuspendRealtimeTransport", () => {
  it("suspends only when backgrounded, not during brief inactive overlays", () => {
    assert.equal(shouldSuspendRealtimeTransport("background"), true);
    assert.equal(shouldSuspendRealtimeTransport("inactive"), false);
    assert.equal(shouldSuspendRealtimeTransport("active"), false);
  });
});

describe("shouldCatchUpAfterWsOpen", () => {
  it("skips full query invalidation on a short foreground reconnect", () => {
    assert.equal(shouldCatchUpAfterWsOpen("foreground"), false);
  });

  it("catch-up after mount, long resume, or backoff reconnect", () => {
    assert.equal(shouldCatchUpAfterWsOpen("mount"), true);
    assert.equal(shouldCatchUpAfterWsOpen("resume_long"), true);
    assert.equal(shouldCatchUpAfterWsOpen("backoff:closed"), true);
  });
});
