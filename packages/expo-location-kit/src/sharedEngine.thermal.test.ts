import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Pure source contract — avoid importing expo-location (pulls react-native).
 */
describe("location engine thermal profiles (source contract)", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "sharedEngine.ts"),
    "utf8"
  );

  it("defines a cool homeMapIdle profile (≥45s)", () => {
    assert.match(src, /HOME_MAP_IDLE_PROFILE[\s\S]*timeIntervalMs:\s*45_000/);
    assert.match(src, /homeMapIdle:\s*HOME_MAP_IDLE_PROFILE/);
  });

  it("nav interval is ≥2000ms (not sub-second)", () => {
    assert.match(src, /NAV_PROFILE[\s\S]*timeIntervalMs:\s*2000/);
  });

  it("duty idle stays Balanced at 20s", () => {
    assert.match(src, /DUTY_IDLE_BG_PROFILE[\s\S]*timeIntervalMs:\s*20000/);
    assert.match(src, /DUTY_IDLE_BG_PROFILE[\s\S]*Accuracy\.Balanced/);
  });
});
