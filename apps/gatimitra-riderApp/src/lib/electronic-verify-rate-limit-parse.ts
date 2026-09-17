/**
 * Pure helpers for Verify Instantly payloads (no React Native deps).
 * Rate-limit timed locks are permanently disabled — parsers always return null.
 */

export type ElectronicVerifyDocKind =
  | "pan"
  | "driving_licence"
  | "vehicle_rc"
  | "aadhaar"
  | "bank_account";

export type ElectronicVerifyRateLimitInfo = {
  limited: boolean;
  retryAfterSec: number;
  resetsAt: string | null;
  message: string;
  docKind?: ElectronicVerifyDocKind | string | null;
};

export function normalizeElectronicVerifyDocKind(
  raw: string | null | undefined,
): ElectronicVerifyDocKind | null {
  const k = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (k === "pan" || k === "pan_360") return "pan";
  if (k === "driving_licence" || k === "dl" || k === "driving_license") return "driving_licence";
  if (k === "vehicle_rc" || k === "rc") return "vehicle_rc";
  if (k === "aadhaar" || k === "aadhaar_digilocker") return "aadhaar";
  if (k === "bank_account" || k === "bank") return "bank_account";
  return null;
}

/** Always null — timed rate-limit locks are disabled. */
export function readElectronicVerifyRateLimitPayload(
  _raw: unknown,
  _expectedDocKind?: string | null,
): ElectronicVerifyRateLimitInfo | null {
  return null;
}

/** Always null — timed rate-limit locks are disabled. */
export function parseElectronicVerifyRateLimitFromResponse(
  _response: unknown,
  _expectedDocKind?: string | null,
): ElectronicVerifyRateLimitInfo | null {
  return null;
}

/** Always null — timed rate-limit locks are disabled. */
export function parseElectronicVerifyRateLimitFromLimitsMap(
  _limits: Record<string, unknown> | null | undefined,
  _docKind: string,
): ElectronicVerifyRateLimitInfo | null {
  return null;
}

export function formatVerifyCountdown(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export function resolveRetryAfterSec(info: {
  retryAfterSec?: number | null;
  resetsAt?: string | null;
}): number {
  if (info.resetsAt) {
    const ms = new Date(info.resetsAt).getTime() - Date.now();
    if (Number.isFinite(ms)) return Math.max(0, Math.ceil(ms / 1000));
  }
  return Math.max(0, Number(info.retryAfterSec ?? 0) || 0);
}
