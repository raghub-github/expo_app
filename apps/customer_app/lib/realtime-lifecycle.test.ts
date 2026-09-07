import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  reduceConfirmedAppState,
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

describe("reduceConfirmedAppState", () => {
  it("ignores a background blip that returns to active before confirm", () => {
    let s = reduceConfirmedAppState("active", false, "background_started");
    assert.equal(s.emit, null);
    s = reduceConfirmedAppState(s.confirmed, s.pendingBackground, "active");
    assert.equal(s.emit, "cancel");
    assert.equal(s.confirmed, "active");
  });

  it("suspends only after confirm, then resumes on active", () => {
    let s = reduceConfirmedAppState("active", false, "background_started");
    s = reduceConfirmedAppState(s.confirmed, s.pendingBackground, "background_confirmed");
    assert.equal(s.emit, "suspend");
    assert.equal(s.confirmed, "background");
    s = reduceConfirmedAppState(s.confirmed, s.pendingBackground, "active");
    assert.equal(s.emit, "resume");
    assert.equal(s.confirmed, "active");
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
