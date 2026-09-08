/**
 * One-time legacy onboarding storage migration.
 *
 * Security invariant: never hydrate gm_onboarding_v1 into the current rider
 * unless legacy.riderId PROVABLY matches that rider.
 */

/** Minimal shape needed for ownership — avoids circular import with the Zustand store. */
export type OnboardingOwnerBlob = {
  riderId?: string;
  [key: string]: unknown;
};

export type OnboardingStorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export const LEGACY_ONBOARDING_KEY = "gm_onboarding_v1";
/**
 * SecureStore only allows [A-Za-z0-9._-]. Do NOT use ":" (invalid on native).
 * Scoped key shape: gm_onboarding_v1_<riderId>
 */
export const ONBOARDING_KEY_PREFIX = "gm_onboarding_v1_";
export const LEGACY_QUARANTINE_KEY = "gm_onboarding_legacy_quarantine_v1";
export const LEGACY_MIGRATION_DONE_KEY = "gm_onboarding_legacy_migration_done_v1";

export type LegacyMigrationResult =
  | "NO_LEGACY_DATA"
  | "MIGRATION_ALREADY_COMPLETED"
  | "SCOPED_DATA_ALREADY_EXISTS"
  | "LEGACY_OWNER_MATCHED_MIGRATED"
  | "LEGACY_OWNER_MISMATCH_QUARANTINED"
  | "LEGACY_OWNER_UNKNOWN_QUARANTINED"
  | "LEGACY_PARSE_FAILED_QUARANTINED"
  | "STALE_OWNER_ABORTED";

export function storageKeyForOwner(ownerId: string): string {
  // SecureStore charset only — never embed ":" or other invalid characters.
  const safe = ownerId.trim().replace(/[^A-Za-z0-9._-]/g, "_");
  return `${ONBOARDING_KEY_PREFIX}${safe}`;
}

export function ownerFromOnboardingData(data: OnboardingOwnerBlob | null | undefined): string | null {
  const id = String(data?.riderId || "").trim();
  return id || null;
}

/** Lazy — avoid importing react-native storage at module load (breaks node:test). */
async function getDefaultStorage(): Promise<OnboardingStorageAdapter> {
  return import("@/src/utils/storage");
}

function logMigration(result: LegacyMigrationResult, meta?: Record<string, unknown>): void {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("[ONBOARDING_MIGRATION]", { result, ...meta });
  }
}

async function quarantineLegacy(
  storage: OnboardingStorageAdapter,
  raw: string,
  reason: string,
): Promise<void> {
  const envelope = JSON.stringify({
    quarantinedAt: new Date().toISOString(),
    reason,
    // Opaque forensics only — never hydrate into UI.
    payload: raw,
  });
  await storage.setItem(LEGACY_QUARANTINE_KEY, envelope);
  await storage.removeItem(LEGACY_ONBOARDING_KEY);
  await storage.setItem(LEGACY_MIGRATION_DONE_KEY, "1");
}

/**
 * Resolve onboarding blob for `ownerId`.
 * Scoped storage always wins. Legacy is only used when ownership is proven.
 */
export async function resolveOnboardingBlobForOwner(
  ownerId: string,
  opts?: {
    generation?: () => string | null;
    storage?: OnboardingStorageAdapter;
  },
): Promise<{ data: OnboardingOwnerBlob | null; migration: LegacyMigrationResult }> {
  const storage = opts?.storage ?? (await getDefaultStorage());
  const normalized = ownerId.trim();
  if (!normalized) {
    return { data: null, migration: "STALE_OWNER_ABORTED" };
  }

  const stillCurrent = () => {
    if (!opts?.generation) return true;
    return opts.generation() === normalized;
  };

  const scopedRaw = await storage.getItem(storageKeyForOwner(normalized));
  if (scopedRaw) {
    if (!stillCurrent()) {
      return { data: null, migration: "STALE_OWNER_ABORTED" };
    }
    try {
      const parsed = JSON.parse(scopedRaw) as OnboardingOwnerBlob;
      const stampedOwner = ownerFromOnboardingData(parsed);
      if (stampedOwner && stampedOwner !== normalized) {
        logMigration("LEGACY_OWNER_MISMATCH_QUARANTINED", { scopedMismatch: true });
        return { data: null, migration: "LEGACY_OWNER_MISMATCH_QUARANTINED" };
      }
      const legacyLeft = await storage.getItem(LEGACY_ONBOARDING_KEY);
      if (legacyLeft) {
        const done = await storage.getItem(LEGACY_MIGRATION_DONE_KEY);
        if (done !== "1") {
          await quarantineLegacy(storage, legacyLeft, "scoped_exists_legacy_leftover");
          logMigration("SCOPED_DATA_ALREADY_EXISTS", { quarantinedLeftover: true });
        } else {
          await storage.removeItem(LEGACY_ONBOARDING_KEY);
        }
      }
      return { data: { ...parsed, riderId: normalized }, migration: "SCOPED_DATA_ALREADY_EXISTS" };
    } catch {
      /* fall through to legacy */
    }
  }

  const migrationDone = await storage.getItem(LEGACY_MIGRATION_DONE_KEY);
  const legacyRaw = await storage.getItem(LEGACY_ONBOARDING_KEY);
  if (!legacyRaw) {
    if (migrationDone === "1") {
      return { data: null, migration: "MIGRATION_ALREADY_COMPLETED" };
    }
    return { data: null, migration: "NO_LEGACY_DATA" };
  }

  // Migration already completed once — never re-hydrate leftover global key into anyone.
  if (migrationDone === "1") {
    await quarantineLegacy(storage, legacyRaw, "leftover_after_migration_done");
    logMigration("MIGRATION_ALREADY_COMPLETED", { quarantinedLeftover: true });
    return { data: null, migration: "MIGRATION_ALREADY_COMPLETED" };
  }

  if (!stillCurrent()) {
    return { data: null, migration: "STALE_OWNER_ABORTED" };
  }

  let parsed: OnboardingOwnerBlob;
  try {
    parsed = JSON.parse(legacyRaw) as OnboardingOwnerBlob;
  } catch {
    await quarantineLegacy(storage, legacyRaw, "parse_failed");
    logMigration("LEGACY_PARSE_FAILED_QUARANTINED");
    return { data: null, migration: "LEGACY_PARSE_FAILED_QUARANTINED" };
  }

  const legacyOwner = ownerFromOnboardingData(parsed);

  if (!legacyOwner) {
    await quarantineLegacy(storage, legacyRaw, "owner_unknown");
    logMigration("LEGACY_OWNER_UNKNOWN_QUARANTINED");
    return { data: null, migration: "LEGACY_OWNER_UNKNOWN_QUARANTINED" };
  }

  if (legacyOwner !== normalized) {
    const otherScoped = await storage.getItem(storageKeyForOwner(legacyOwner));
    if (!otherScoped) {
      await storage.setItem(
        storageKeyForOwner(legacyOwner),
        JSON.stringify({ ...parsed, riderId: legacyOwner }),
      );
    }
    await quarantineLegacy(storage, legacyRaw, `owner_mismatch_expected_${legacyOwner}`);
    logMigration("LEGACY_OWNER_MISMATCH_QUARANTINED", { legacyOwnerPresent: true });
    if (!stillCurrent()) {
      return { data: null, migration: "STALE_OWNER_ABORTED" };
    }
    return { data: null, migration: "LEGACY_OWNER_MISMATCH_QUARANTINED" };
  }

  const migrated = { ...parsed, riderId: normalized };
  if (!stillCurrent()) {
    return { data: null, migration: "STALE_OWNER_ABORTED" };
  }
  await storage.setItem(storageKeyForOwner(normalized), JSON.stringify(migrated));
  await storage.removeItem(LEGACY_ONBOARDING_KEY);
  await storage.setItem(LEGACY_MIGRATION_DONE_KEY, "1");
  logMigration("LEGACY_OWNER_MATCHED_MIGRATED");
  return { data: migrated, migration: "LEGACY_OWNER_MATCHED_MIGRATED" };
}

export async function persistOnboardingBlobForOwner(
  ownerId: string,
  data: OnboardingOwnerBlob,
  storage?: OnboardingStorageAdapter,
): Promise<void> {
  const store = storage ?? (await getDefaultStorage());
  const normalized = ownerId.trim();
  if (!normalized) return;
  await store.setItem(
    storageKeyForOwner(normalized),
    JSON.stringify({ ...data, riderId: normalized }),
  );
  await store.removeItem(LEGACY_ONBOARDING_KEY);
}

/** Quarantine payload is never returned for UI hydration. */
export async function readQuarantineMeta(
  storage?: OnboardingStorageAdapter,
): Promise<{ reason?: string; quarantinedAt?: string } | null> {
  const store = storage ?? (await getDefaultStorage());
  const raw = await store.getItem(LEGACY_QUARANTINE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { reason?: string; quarantinedAt?: string };
    return { reason: parsed.reason, quarantinedAt: parsed.quarantinedAt };
  } catch {
    return null;
  }
}
