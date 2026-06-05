import { getRiderAppConfig } from "@/src/config/env";

/**
 * Resolve stored attachment paths for React Native Image.
 * DB / onboarding store `/api/attachments/proxy?key=...` or `/v1/attachments/proxy?key=...`.
 */
export function toAbsoluteImageUrl(uri: string | null | undefined): string | null {
  if (uri == null || typeof uri !== "string") return null;
  const u = uri.trim();
  if (!u) return null;

  if (u.startsWith("file://") || u.startsWith("content://")) return u;

  let base: string;
  try {
    base = getRiderAppConfig().apiBaseUrl.replace(/\/+$/, "");
  } catch {
    return u.startsWith("http://") || u.startsWith("https://") ? u : null;
  }

  if (u.startsWith("http://") || u.startsWith("https://")) {
    try {
      const parsed = new URL(u);
      const baseUrl = new URL(base);
      const host = parsed.hostname;
      const loopback = host === "localhost" || host === "127.0.0.1" || host === "10.0.2.2";
      const attachmentPath =
        parsed.pathname.startsWith("/v1/attachments") ||
        parsed.pathname.startsWith("/api/attachments");
      if (loopback || (attachmentPath && parsed.origin !== baseUrl.origin)) {
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
  } else if (!path.startsWith("/") && !path.includes("://")) {
    path = `/v1/attachments/proxy?key=${encodeURIComponent(path)}`;
  }
  if (!path.startsWith("/")) path = `/${path}`;
  return `${base}${path}`;
}
