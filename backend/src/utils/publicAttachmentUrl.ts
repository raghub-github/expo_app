import { getEnv } from "../config/env.js";

/**
 * DB stores stable relative paths: `/api/attachments/proxy?key=...` (dashboard) or
 * `/v1/attachments/proxy?key=...` (backend uploads). Mobile clients need absolute URLs.
 * Legacy rows may still hold full https:// R2 URLs — return those unchanged.
 */
export function toAbsoluteClientMediaUrl(stored: string | null | undefined): string | null {
  if (stored == null || typeof stored !== "string") return null;
  const u = stored.trim();
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;

  const base = getEnv().API_BASE_URL?.replace(/\/+$/, "");
  let path = u;
  if (path.startsWith("/api/attachments/proxy")) {
    path = "/v1/attachments/proxy" + path.slice("/api/attachments/proxy".length);
  }
  if (!path.startsWith("/")) path = `/${path}`;
  if (!base) return path;
  return `${base}${path}`;
}
