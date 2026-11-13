/**
 * Read merchant staff claims from the session JWT (client-side shape check only).
 * The backend still enforces permissions; this keeps UI in sync when partner
 * cache predates accessRole or /me has not returned yet.
 */

export type MerchantJwtStaffClaims = {
  accessRole?: "OWNER" | "MANAGER" | "STAFF";
  staffId?: number | null;
  storeId?: number | null;
};

function parseJsonPayload(segment: string): Record<string, unknown> | null {
  try {
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    const decode =
      typeof globalThis.atob === "function"
        ? globalThis.atob.bind(globalThis)
        : null;
    if (!decode) return null;
    const json = decode(normalized + pad);
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function readMerchantJwtStaffClaims(token: string | null | undefined): MerchantJwtStaffClaims {
  if (!token?.trim()) return {};
  const parts = token.trim().split(".");
  if (parts.length < 2) return {};
  const payload = parseJsonPayload(parts[1]!);
  if (!payload) return {};

  const rawRole = payload.merchant_access_role;
  const accessRole =
    rawRole === "OWNER" || rawRole === "MANAGER" || rawRole === "STAFF" ? rawRole : undefined;

  const staffRaw = payload.merchant_staff_id;
  const storeRaw = payload.merchant_store_id;
  const staffId =
    typeof staffRaw === "number" && Number.isFinite(staffRaw)
      ? staffRaw
      : staffRaw == null
        ? null
        : undefined;
  const storeId =
    typeof storeRaw === "number" && Number.isFinite(storeRaw)
      ? storeRaw
      : storeRaw == null
        ? null
        : undefined;

  return {
    ...(accessRole ? { accessRole } : {}),
    ...(staffId !== undefined ? { staffId } : {}),
    ...(storeId !== undefined ? { storeId } : {}),
  };
}
