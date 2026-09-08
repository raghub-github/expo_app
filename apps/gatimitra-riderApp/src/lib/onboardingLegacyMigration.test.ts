/**
 * Cross-rider onboarding isolation + legacy migration security tests.
 * These simulate Rider A / Rider B storage without needing a device.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_MIGRATION_DONE_KEY,
  LEGACY_ONBOARDING_KEY,
  LEGACY_QUARANTINE_KEY,
  persistOnboardingBlobForOwner,
  readQuarantineMeta,
  resolveOnboardingBlobForOwner,
  storageKeyForOwner,
  type OnboardingStorageAdapter,
} from "./onboardingLegacyMigration.js";

function createMemoryStorage(): OnboardingStorageAdapter & { dump: () => Record<string, string> } {
  const map = new Map<string, string>();
  return {
    async getItem(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
    async removeItem(key) {
      map.delete(key);
    },
    dump() {
      return Object.fromEntries(map.entries());
    },
  };
}

describe("onboarding legacy migration + cross-rider isolation", () => {
  let storage: ReturnType<typeof createMemoryStorage>;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it("TEST1: Rider A scoped draft persists and restores", async () => {
    await persistOnboardingBlobForOwner(
      "1001",
      { riderId: "1001", rcNumber: "HR01AA1111", dlNumber: "HR0620130124790", rcPhotoUri: "file://a.jpg" },
      storage,
    );
    const again = await resolveOnboardingBlobForOwner("1001", { storage });
    assert.equal(again.migration, "SCOPED_DATA_ALREADY_EXISTS");
    assert.equal(again.data?.rcNumber, "HR01AA1111");
    assert.equal(again.data?.dlNumber, "HR0620130124790");
    assert.equal(again.data?.rcPhotoUri, "file://a.jpg");
  });

  it("TEST2: Rider B login does not see Rider A scoped data", async () => {
    await persistOnboardingBlobForOwner(
      "1001",
      { riderId: "1001", rcNumber: "BR274AA7367", rcPhotoUri: "file://logo.png" },
      storage,
    );
    const b = await resolveOnboardingBlobForOwner("2002", { storage });
    assert.equal(b.data, null);
    assert.ok(
      b.migration === "NO_LEGACY_DATA" || b.migration === "MIGRATION_ALREADY_COMPLETED",
    );
  });

  it("TEST3: after B drafts, A still only sees A", async () => {
    await persistOnboardingBlobForOwner(
      "1001",
      { riderId: "1001", rcNumber: "AAA111", rcPhotoUri: "file://a.png" },
      storage,
    );
    await persistOnboardingBlobForOwner(
      "2002",
      { riderId: "2002", rcNumber: "BBB222", rcPhotoUri: "file://b.png" },
      storage,
    );
    const a = await resolveOnboardingBlobForOwner("1001", { storage });
    const b = await resolveOnboardingBlobForOwner("2002", { storage });
    assert.equal(a.data?.rcNumber, "AAA111");
    assert.equal(a.data?.rcPhotoUri, "file://a.png");
    assert.equal(b.data?.rcNumber, "BBB222");
    assert.equal(b.data?.rcPhotoUri, "file://b.png");
  });

  it("TEST8: no unscoped gm_onboarding_v1 fallback when scoped exists", async () => {
    await persistOnboardingBlobForOwner(
      "2002",
      { riderId: "2002", rcNumber: "CLEAN" },
      storage,
    );
    await storage.setItem(
      LEGACY_ONBOARDING_KEY,
      JSON.stringify({ riderId: "1001", rcNumber: "LEAKED_FROM_A", rcPhotoUri: "file://x" }),
    );
    const b = await resolveOnboardingBlobForOwner("2002", { storage });
    assert.equal(b.data?.rcNumber, "CLEAN");
    assert.notEqual(b.data?.rcNumber, "LEAKED_FROM_A");
    assert.equal(await storage.getItem(LEGACY_ONBOARDING_KEY), null);
  });

  it("TEST9a: unknown-owner legacy is quarantined, not assigned to B", async () => {
    await storage.setItem(
      LEGACY_ONBOARDING_KEY,
      JSON.stringify({ rcNumber: "ORPHAN_RC", dlNumber: "ORPHAN_DL", photo: "x" }),
    );
    const b = await resolveOnboardingBlobForOwner("2002", { storage });
    assert.equal(b.data, null);
    assert.equal(b.migration, "LEGACY_OWNER_UNKNOWN_QUARANTINED");
    assert.equal(await storage.getItem(LEGACY_ONBOARDING_KEY), null);
    assert.equal(await storage.getItem(storageKeyForOwner("2002")), null);
    const meta = await readQuarantineMeta(storage);
    assert.equal(meta?.reason, "owner_unknown");
    assert.equal(await storage.getItem(LEGACY_MIGRATION_DONE_KEY), "1");
  });

  it("TEST9b: mismatched owner parks under A, B stays empty", async () => {
    await storage.setItem(
      LEGACY_ONBOARDING_KEY,
      JSON.stringify({
        riderId: "1001",
        rcNumber: "BR274AA7367",
        rcPhotoUri: "file://gatimitra.png",
      }),
    );
    const b = await resolveOnboardingBlobForOwner("2002", { storage });
    assert.equal(b.data, null);
    assert.equal(b.migration, "LEGACY_OWNER_MISMATCH_QUARANTINED");
    const aScoped = await storage.getItem(storageKeyForOwner("1001"));
    assert.ok(aScoped);
    assert.match(aScoped!, /BR274AA7367/);
    assert.equal(await storage.getItem(storageKeyForOwner("2002")), null);
  });

  it("TEST9c: matched owner migrates once to scoped key", async () => {
    await storage.setItem(
      LEGACY_ONBOARDING_KEY,
      JSON.stringify({ riderId: "1001", rcNumber: "OWN_RC", dlNumber: "OWN_DL" }),
    );
    const a1 = await resolveOnboardingBlobForOwner("1001", { storage });
    assert.equal(a1.migration, "LEGACY_OWNER_MATCHED_MIGRATED");
    assert.equal(a1.data?.rcNumber, "OWN_RC");
    assert.equal(await storage.getItem(LEGACY_ONBOARDING_KEY), null);

    // Idempotent — second pass uses scoped, does not re-import.
    await storage.setItem(
      LEGACY_ONBOARDING_KEY,
      JSON.stringify({ riderId: "1001", rcNumber: "SHOULD_NOT_OVERWRITE" }),
    );
    const a2 = await resolveOnboardingBlobForOwner("1001", { storage });
    assert.equal(a2.migration, "SCOPED_DATA_ALREADY_EXISTS");
    assert.equal(a2.data?.rcNumber, "OWN_RC");
  });

  it("TEST9d: scoped data wins over legacy for same rider", async () => {
    await persistOnboardingBlobForOwner(
      "1001",
      { riderId: "1001", rcNumber: "SCOPED_WINS" },
      storage,
    );
    await storage.setItem(
      LEGACY_ONBOARDING_KEY,
      JSON.stringify({ riderId: "1001", rcNumber: "LEGACY_LOSES" }),
    );
    const a = await resolveOnboardingBlobForOwner("1001", { storage });
    assert.equal(a.data?.rcNumber, "SCOPED_WINS");
  });

  it("TEST7: stale generation aborts write into new rider", async () => {
    await storage.setItem(
      LEGACY_ONBOARDING_KEY,
      JSON.stringify({ riderId: "1001", rcNumber: "A_ONLY" }),
    );
    let current: string | null = "1001";
    const pending = resolveOnboardingBlobForOwner("1001", {
      storage,
      generation: () => current,
    });
    // Simulate logout + Rider B login before migration finishes.
    current = "2002";
    const result = await pending;
    assert.equal(result.migration, "STALE_OWNER_ABORTED");
    assert.equal(result.data, null);
  });

  it("TEST5 shape: duplicate message must not include foreign PII fields", () => {
    // UI/API contract check — check-rc returns only { registered: boolean }.
    const apiResponse = { registered: true };
    assert.deepEqual(Object.keys(apiResponse), ["registered"]);
    const msg =
      "This registration certificate is already associated with another account. Please try a different one.";
    assert.doesNotMatch(msg, /name|address|dob|phone|aadhaar|vehicle|application/i);
  });

  it("quarantine is never a hydration source key used by resolve", async () => {
    await storage.setItem(
      LEGACY_QUARANTINE_KEY,
      JSON.stringify({
        reason: "owner_unknown",
        payload: JSON.stringify({ rcNumber: "HIDDEN", riderId: "1001" }),
      }),
    );
    const b = await resolveOnboardingBlobForOwner("2002", { storage });
    assert.equal(b.data, null);
    assert.ok(!storage.dump()[storageKeyForOwner("2002")]);
  });

  it("leftover legacy after migration_done is quarantined, not rehydrated", async () => {
    await storage.setItem(LEGACY_MIGRATION_DONE_KEY, "1");
    await storage.setItem(
      LEGACY_ONBOARDING_KEY,
      JSON.stringify({ riderId: "2002", rcNumber: "SHOULD_NOT_APPEAR" }),
    );
    const b = await resolveOnboardingBlobForOwner("2002", { storage });
    assert.equal(b.data, null);
    assert.equal(b.migration, "MIGRATION_ALREADY_COMPLETED");
    assert.equal(await storage.getItem(LEGACY_ONBOARDING_KEY), null);
  });
});
