import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customerAnnouncementForegroundDecision,
  previousTokenToRetire,
} from "./tokenRotation";

describe("push token rotation", () => {
  it("replaces a refreshed token and leaves an unchanged token", () => {
    assert.equal(previousTokenToRetire("old-token-aaa", "new-token-bbb"), "old-token-aaa");
    assert.equal(previousTokenToRetire("same-token-11", "same-token-11"), null);
    assert.equal(previousTokenToRetire(null, "new-token-bbb"), null);
    assert.equal(previousTokenToRetire("old-token-aaa", null), null);
  });

  it("foreground posts one tray copy and does not duplicate it", () => {
    assert.deepEqual(
      customerAnnouncementForegroundDecision({
        isAnnouncement: true,
        alreadyTrayCopy: false,
        appIsActive: true,
      }),
      { suppressRemoteAlert: true, postLocalTray: true },
    );
    assert.deepEqual(
      customerAnnouncementForegroundDecision({
        isAnnouncement: true,
        alreadyTrayCopy: true,
        appIsActive: true,
      }),
      { suppressRemoteAlert: false, postLocalTray: false },
    );
  });

  it("background and terminated keep the system notification", () => {
    assert.deepEqual(
      customerAnnouncementForegroundDecision({
        isAnnouncement: true,
        alreadyTrayCopy: false,
        appIsActive: false,
      }),
      { suppressRemoteAlert: false, postLocalTray: false },
    );
    assert.deepEqual(
      customerAnnouncementForegroundDecision({
        isAnnouncement: false,
        alreadyTrayCopy: false,
        appIsActive: true,
      }),
      { suppressRemoteAlert: false, postLocalTray: false },
    );
  });
});
