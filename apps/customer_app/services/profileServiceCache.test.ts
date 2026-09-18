import assert from "node:assert/strict";
import { describe, it, mock, beforeEach } from "node:test";

/**
 * Regression: completing the profile (updateProfile with profile_completed:true)
 * must immediately persist to the local profile cache, so a cold start right
 * after registration does not re-show the onboarding form. The PATCH response
 * omits the lifetime-savings aggregate, so the cache write must MERGE over the
 * previous cached profile (never drop fields) while taking profile_completed.
 */
describe("profileService.updateProfile → profile cache", () => {
  let written: Record<string, unknown> | null = null;

  beforeEach(() => {
    written = null;
    mock.reset();
    // Config / native shims so profile.service can load under node:test.
    mock.module("@/config/env", { namedExports: { getConfig: () => ({ apiBaseUrl: "http://x" }) } });
    mock.module("@/constants", {
      namedExports: { STORAGE_KEYS: { AUTH_TOKEN: "auth_token", PROFILE_CACHE: "profile_cache" } },
    });
    mock.module("@/utils/storage", { namedExports: { getItem: async () => "test-token" } });
    mock.module("@/store/authStore", {
      namedExports: { useAuthStore: { getState: () => ({ session: { accessToken: "test-token" } }) } },
    });
    // Backend PATCH returns the updated profile WITHOUT lifetime_savings (as the real API does).
    mock.module("./api", {
      defaultExport: {
        patch: async () => ({ data: { full_name: "Bhim", profile_completed: true } }),
        get: async () => ({ data: {} }),
      },
    });
    // Capture what gets written to the cache; pretend the pre-update cache had
    // profile_completed:false plus a lifetime_savings field the PATCH omits.
    mock.module("@/lib/profileCache", {
      namedExports: {
        writeCachedProfile: async (p: Record<string, unknown>) => {
          written = p;
        },
        readSyncCachedProfile: () => ({
          full_name: "Bhim",
          profile_completed: false,
          lifetime_savings: 123,
        }),
      },
    });
  });

  it("persists profile_completed:true (the cold-start gate flag)", async () => {
    const { profileService } = await import("./profile.service");
    const res = await profileService.updateProfile({ profile_completed: true, full_name: "Bhim" });
    assert.equal(res.profile_completed, true);
    assert.ok(written, "updateProfile must write the profile cache");
    assert.equal(written!.profile_completed, true);
  });

  it("merges over the cache so PATCH-omitted fields are not dropped", async () => {
    const { profileService } = await import("./profile.service");
    await profileService.updateProfile({ profile_completed: true });
    assert.ok(written, "cache written");
    // lifetime_savings (absent from the PATCH response) survives via the merge.
    assert.equal(written!.lifetime_savings, 123);
    assert.equal(written!.profile_completed, true);
    assert.equal(written!.full_name, "Bhim");
  });
});
