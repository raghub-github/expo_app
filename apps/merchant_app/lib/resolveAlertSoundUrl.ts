import { getConfig, resolveUrlForDevice } from "@/config/env";

/**
 * Partnersite/dashboard store `/api/attachments/proxy?key=...` (same-origin on web).
 * Merchant app must resolve to backend `/v1/attachments/proxy?key=...` — same as menu images.
 *
 * Also rewrites absolute proxy URLs that used the server's API_BASE_URL host onto the
 * device's EXPO_PUBLIC_API_BASE_URL (LAN IP vs localhost mismatch broke playback).
 */
export function resolveAlertSoundUrl(url: string | null | undefined): string | null {
  if (url == null || typeof url !== "string" || !url.trim()) return null;
  let u = url.trim();

  // Already a direct R2 / CDN signed URL — use as-is (host rewrite would break signature).
  if (
    (u.startsWith("http://") || u.startsWith("https://")) &&
    !u.includes("/attachments/proxy")
  ) {
    return resolveUrlForDevice(u);
  }

  try {
    const asUrl =
      u.startsWith("http://") || u.startsWith("https://")
        ? new URL(u)
        : new URL(u, "https://placeholder.local");
    if (asUrl.pathname.includes("/attachments/proxy")) {
      let path = asUrl.pathname + asUrl.search;
      if (path.startsWith("/api/attachments/proxy")) {
        path = "/v1/attachments/proxy" + path.slice("/api/attachments/proxy".length);
      }
      const base = getConfig().apiBaseUrl.replace(/\/+$/, "");
      return resolveUrlForDevice(base + path);
    }
  } catch {
    /* fall through */
  }

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

/**
 * Follow attachment-proxy redirects to a final playable URL.
 * Native audio players often fail on 302 → silent fallback to bundled wav.
 */
export async function resolvePlayableAlertSoundUrl(
  url: string | null | undefined
): Promise<string | null> {
  const resolved = resolveAlertSoundUrl(url);
  if (!resolved) return null;
  if (!resolved.includes("/attachments/proxy")) return resolved;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(resolved, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
      });
      const finalUrl = typeof res.url === "string" && res.url.trim() ? res.url.trim() : null;
      if (finalUrl && !finalUrl.includes("/attachments/proxy")) {
        return resolveUrlForDevice(finalUrl);
      }
      // Some stacks reject HEAD — try a ranged GET that still follows redirects.
      if (!res.ok) {
        const getRes = await fetch(resolved, {
          method: "GET",
          headers: { Range: "bytes=0-0" },
          redirect: "follow",
          signal: controller.signal,
        });
        const getUrl =
          typeof getRes.url === "string" && getRes.url.trim() ? getRes.url.trim() : null;
        if (getUrl && !getUrl.includes("/attachments/proxy")) {
          return resolveUrlForDevice(getUrl);
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    /* keep proxy URL — player may still succeed */
  }
  return resolved;
}
