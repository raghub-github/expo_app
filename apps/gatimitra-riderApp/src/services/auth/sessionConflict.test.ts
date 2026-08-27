import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSessionConflict,
  isRiderSessionConflict,
  type RiderSessionConflict,
} from "./sessionConflict";

test("parses a well-formed 409 SESSION_CONFLICT (§21)", () => {
  const c = parseSessionConflict(409, {
    code: "SESSION_CONFLICT",
    message: "Rider account is active on another device.",
    existingSession: {
      sessionId: "7",
      deviceLabel: "Samsung Galaxy",
      platform: "android",
      lastActiveAt: "2026-02-01T10:00:00.000Z",
    },
    takeoverToken: "tok_abc",
  });
  assert.ok(c);
  assert.equal(c!.conflict, true);
  assert.equal(c!.takeoverToken, "tok_abc");
  assert.equal(c!.existingSession.deviceLabel, "Samsung Galaxy");
  assert.equal(c!.existingSession.platform, "android");
  assert.equal(c!.existingSession.lastActiveAt, "2026-02-01T10:00:00.000Z");
});

test("a non-409 is never a conflict (normal login proceeds)", () => {
  assert.equal(parseSessionConflict(200, { code: "SESSION_CONFLICT", takeoverToken: "x" }), null);
});

test("a 409 without a takeover token is rejected (can't take over without proof)", () => {
  assert.equal(parseSessionConflict(409, { code: "SESSION_CONFLICT" }), null);
});

test("a 409 with a different code is not a conflict", () => {
  assert.equal(parseSessionConflict(409, { code: "SOMETHING_ELSE", takeoverToken: "x" }), null);
});

test("missing existingSession fields fall back to safe defaults", () => {
  const c = parseSessionConflict(409, { code: "SESSION_CONFLICT", takeoverToken: "tok" });
  assert.ok(c);
  assert.equal(c!.existingSession.deviceLabel, "another device");
  assert.equal(c!.existingSession.platform, "");
  assert.equal(c!.existingSession.lastActiveAt, null);
});

test("isRiderSessionConflict discriminates conflict vs session", () => {
  const conflict: RiderSessionConflict = {
    conflict: true,
    takeoverToken: "t",
    existingSession: { sessionId: "1", deviceLabel: "d", platform: "android", lastActiveAt: null },
  };
  assert.equal(isRiderSessionConflict(conflict), true);
  // A session object has no `conflict` flag.
  const sessionLike = { accessToken: "jwt", expiresAt: 1, role: "rider", userId: "usr_1" } as never;
  assert.equal(isRiderSessionConflict(sessionLike), false);
});
