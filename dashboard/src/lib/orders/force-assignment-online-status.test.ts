import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isForceAssignmentOnDuty,
  mapForceAssignmentOnlineStatus,
} from "./force-assignment-online-status";

describe("mapForceAssignmentOnlineStatus", () => {
  it("keeps ONLINE and BUSY", () => {
    assert.equal(mapForceAssignmentOnlineStatus("ONLINE", false), "ONLINE");
    assert.equal(mapForceAssignmentOnlineStatus("BUSY", true), "BUSY");
  });

  it("maps Geo STALE (duty ON, old GPS) to Core on-duty, not Offline", () => {
    assert.equal(mapForceAssignmentOnlineStatus("STALE", false), "ONLINE");
    assert.equal(mapForceAssignmentOnlineStatus("stale", true), "BUSY");
  });

  it("keeps true OFFLINE", () => {
    assert.equal(mapForceAssignmentOnlineStatus("OFFLINE", false), "OFFLINE");
    assert.equal(mapForceAssignmentOnlineStatus(null, false), "OFFLINE");
    assert.equal(mapForceAssignmentOnlineStatus("UNKNOWN", false), "OFFLINE");
  });
});

describe("isForceAssignmentOnDuty", () => {
  it("treats STALE as on duty so the sheet filter matches Core", () => {
    assert.equal(isForceAssignmentOnDuty("ONLINE"), true);
    assert.equal(isForceAssignmentOnDuty("BUSY"), true);
    assert.equal(isForceAssignmentOnDuty("STALE"), true);
    assert.equal(isForceAssignmentOnDuty("OFFLINE"), false);
  });
});
