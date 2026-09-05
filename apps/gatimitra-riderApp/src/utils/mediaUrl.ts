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

  // Expired / host-bound R2 signed URLs cannot be loaded directly — rebuild via proxy.
  const proxyFromSigned = proxyPathFromPossiblySignedUrl(u);
  if (proxyFromSigned) {
    return `${base}${proxyFromSigned}`;
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
        const path = parsed.pathname.startsWith("/api/attachments/proxy")
          ? "/v1/attachments/proxy" + parsed.pathname.slice("/api/attachments/proxy".length)
          : parsed.pathname;
        return `${baseUrl.origin}${path}${parsed.search}${parsed.hash}`;
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

/** Convert legacy signed R2 object URLs into a stable backend proxy path. */
function proxyPathFromPossiblySignedUrl(u: string): string | null {
  if (!u.startsWith("http://") && !u.startsWith("https://")) return null;
  const looksSigned =
    u.includes("X-Amz-") ||
    u.includes("x-amz-") ||
    u.includes("r2.cloudflarestorage.com") ||
    u.includes(".r2.dev/");
  if (!looksSigned) return null;
  try {
    const parsed = new URL(u);
    if (parsed.pathname.includes("/attachments/proxy")) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return null;
    // /bucket/key... → drop bucket; /riders/... → keep
    const key =
      parts.length >= 2 && !parts[0]!.startsWith("riders") && !parts[0]!.startsWith("orders")
        ? parts.slice(1).join("/")
        : parts.join("/");
    if (!key) return null;
    return `/v1/attachments/proxy?key=${encodeURIComponent(key)}`;
  } catch {
    return null;
  }
}

/**
 * Prefer fresh local upload, then server selfie, then onboarding cache.
 * Always resolve to an Image-loadable absolute URL (or local file URI).
 */
export function resolveRiderSelfieDisplayUrl(opts: {
  localSelfieUrl?: string | null;
  serverSelfieUrl?: string | null;
  onboardingSignedUrl?: string | null;
  onboardingLocalUri?: string | null;
}): string | null {
  const candidates = [
    opts.localSelfieUrl,
    opts.serverSelfieUrl,
    opts.onboardingSignedUrl,
    opts.onboardingLocalUri,
  ];
  for (const c of candidates) {
    const abs = toAbsoluteImageUrl(c);
    if (abs) return abs;
  }
  return null;
}

/** Force Image to refetch when the stored object is overwritten in place. */
export function withImageCacheBust(
  uri: string | null | undefined,
  token?: number | string | null
): string | null {
  const abs = toAbsoluteImageUrl(uri);
  if (!abs) return null;
  if (token == null || token === "") return abs;
  const sep = abs.includes("?") ? "&" : "?";
  return `${abs}${sep}t=${encodeURIComponent(String(token))}`;
}
