import { test } from "node:test";
import assert from "node:assert/strict";
import {
  markDeviceSessionActive,
  readDeviceSessionCache,
  writeDeviceSessionCache,
} from "./device-session-cache.js";

test("negative device-session cache can be cleared by markDeviceSessionActive after re-login", () => {
  const sub = "MP_test_cache";
  const deviceId = "device-auth-fix";
  writeDeviceSessionCache(sub, deviceId, false);
  assert.equal(readDeviceSessionCache(sub, deviceId), false);
  markDeviceSessionActive(sub, deviceId);
  assert.equal(readDeviceSessionCache(sub, deviceId), true);
});
