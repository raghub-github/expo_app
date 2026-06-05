/**
 * Stable attachment URL stored in DB (dashboard uses /api, rider app uses /v1 — both resolve in UI).
 */
export function attachmentsProxyUrlFromKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "";
  return `/api/attachments/proxy?key=${encodeURIComponent(trimmed)}`;
}

/** Rider mobile API responses use backend-relative proxy paths. */
export function attachmentsProxyUrlFromKeyForApi(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "";
  return `/v1/attachments/proxy?key=${encodeURIComponent(trimmed)}`;
}
