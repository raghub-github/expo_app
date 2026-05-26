import { getConfig, resolveUrlForDevice } from "@/config/env";

/**
 * Partnersite/dashboard store `/api/attachments/proxy?key=...` (same-origin on web).
 * Merchant app must resolve to backend `/v1/attachments/proxy?key=...` — same as menu images.
 */
export function resolveAlertSoundUrl(url: string | null | undefined): string | null {
  if (url == null || typeof url !== "string" || !url.trim()) return null;
  let u = url.trim();
  if (u.startsWith("/api/attachments/proxy")) {
    u = "/v1/attachments/proxy" + u.slice("/api/attachments/proxy".length);
  }
  let absolute: string;
  if (u.startsWith("http://") || u.startsWith("https://")) {
    absolute = u;
  } else {
    const base = getConfig().apiBaseUrl.replace(/\/+$/, "");
    absolute = base + (u.startsWith("/") ? u : `/${u}`);
  }
  return resolveUrlForDevice(absolute);
}

export function normalizeAlertSoundSlots(
  slots: [string | null, string | null, string | null]
): [string | null, string | null, string | null] {
  return [
    resolveAlertSoundUrl(slots[0]),
    resolveAlertSoundUrl(slots[1]),
    resolveAlertSoundUrl(slots[2]),
  ];
}
