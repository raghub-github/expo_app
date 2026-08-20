import { getConfig } from "@/config/env";

/**
 * Resolve store/menu image URLs for React Native Image.
 * - Relative paths and /api/attachments → app API base.
 * - Rewrite dev-only / wrong-reach hosts (localhost, 127.0.0.1, 10.0.2.2) to app base — **real devices
 *   cannot load 10.0.2.2** (emulator alias).
 * - Rewrite attachment URLs whose host ≠ app base (e.g. LAN IP mismatch) but path is our /v1/attachments proxy.
 */
export function toAbsoluteImageUrl(uri: string | null | undefined): string | null {
  if (uri == null || typeof uri !== "string") return null;
  const u = uri.trim();
  if (!u) return null;

  let base: string;
  try {
    base = getConfig().apiBaseUrl.replace(/\/+$/, "");
    if (!base) return u.startsWith("http://") || u.startsWith("https://") ? u : null;
  } catch {
    return u.startsWith("http://") || u.startsWith("https://") ? u : null;
  }

  if (u.startsWith("http://") || u.startsWith("https://")) {
    try {
      const parsed = new URL(u);
      const baseUrl = new URL(base);
      const host = parsed.hostname;
      const loopbackAlias =
        host === "localhost" || host === "127.0.0.1" || host === "10.0.2.2";
      const attachmentPath =
        parsed.pathname.startsWith("/v1/attachments") ||
        parsed.pathname.startsWith("/api/attachments");
      if (loopbackAlias || (attachmentPath && parsed.origin !== baseUrl.origin)) {
        return `${baseUrl.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch {
      return u;
    }
    return u;
  }

  let path = u;
  if (path.startsWith("/api/attachments/proxy")) {
    path = "/v1/attachments/proxy" + path.slice("/api/attachments/proxy".length);
  }
  // Bare R2 object keys (cxapp-home/discovery-cta/...) must go through the proxy.
  if (!path.startsWith("/") && !path.includes("://") && path.includes("/")) {
    return `${base}/v1/attachments/proxy?key=${encodeURIComponent(path.replace(/^\/+/, ""))}`;
  }
  if (!path.startsWith("/")) path = `/${path}`;
  return `${base}${path}`;
}
