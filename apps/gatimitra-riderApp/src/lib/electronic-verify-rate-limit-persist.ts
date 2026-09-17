/**
 * Persist mirror for Verify Instantly rate-limit — permanently disabled.
 * load always returns null; persist is a no-op; clear still purges keys best-effort.
 */

import { removeItem } from "@/src/utils/storage";
import type { ElectronicVerifyRateLimitInfo } from "@/src/lib/electronic-verify-rate-limit";

function storageKeyV3(riderId: string, docKind: string): string {
  const safeRider = String(riderId).replace(/[^A-Za-z0-9._-]/g, "_");
  const safeKind = String(docKind).replace(/[^A-Za-z0-9._-]/g, "_");
  return `ev_rate_limit_v3_${safeRider}_${safeKind}`;
}

function legacyKeys(riderId: string, docKind: string): string[] {
  const safeRider = String(riderId).replace(/[^A-Za-z0-9._-]/g, "_");
  const safeKind = String(docKind).replace(/[^A-Za-z0-9._-]/g, "_");
  return [
    `ev_rate_limit_v2_${safeRider}_${safeKind}`,
    `ev_rate_limit_v1_${safeRider}_${safeKind}`,
  ];
}

async function purgeLegacyKeys(riderId: string, docKind: string): Promise<void> {
  for (const key of legacyKeys(riderId, docKind)) {
    try {
      await removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/** No-op — timed rate-limit locks are disabled. */
export async function persistElectronicVerifyRateLimit(
  _riderId: string,
  _docKind: string,
  _info: ElectronicVerifyRateLimitInfo,
): Promise<void> {
  /* no-op */
}

/** Always null — timed rate-limit locks are disabled. */
export async function loadPersistedElectronicVerifyRateLimit(
  _riderId: string,
  _docKind: string,
): Promise<ElectronicVerifyRateLimitInfo | null> {
  return null;
}

export async function clearPersistedElectronicVerifyRateLimit(
  riderId: string,
  docKind: string,
): Promise<void> {
  try {
    await removeItem(storageKeyV3(riderId, docKind));
  } catch {
    /* ignore */
  }
  await purgeLegacyKeys(riderId, docKind);
}

/** Clear every known docKind mirror for a rider (e.g. after admin wipe / migration). */
export async function clearAllPersistedElectronicVerifyRateLimitsForRider(
  riderId: string,
): Promise<void> {
  const kinds = [
    "pan",
    "driving_licence",
    "vehicle_rc",
    "aadhaar",
    "bank_account",
  ];
  await Promise.all(
    kinds.map((kind) => clearPersistedElectronicVerifyRateLimit(riderId, kind)),
  );
}
