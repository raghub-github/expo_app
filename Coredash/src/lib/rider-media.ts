/**
 * Turn stored media (selfie / doc) into a browser-loadable Coredash proxy URL.
 * R2 keys and storage-endpoint URLs are rewritten to /api/attachments/proxy?key=…
 * Absolute http:// URLs are always upgraded to https:// (treasury is HTTPS-only).
 */

/** Path prefixes that live in our R2 bucket even when the stored host/scheme is wrong. */
const R2_KEY_PREFIXES = [
  "customers/",
  "riders/",
  "merchants/",
  "merchant-",
  "attachments/",
  "profile-images/",
  "documents/",
  "menu/",
  "stores/",
  "tickets/",
];

function proxyKey(key: string | null | undefined): string | null {
  const k = (key ?? "").trim().replace(/^\/+/, "");
  if (!k) return null;
  return `/api/attachments/proxy?key=${encodeURIComponent(k)}`;
}

function hostOf(raw: string): string | null {
  try {
    const normalized = raw.startsWith("//")
      ? `https:${raw}`
      : raw.replace(/^http:\/\//i, "https://");
    return new URL(normalized).host.toLowerCase();
  } catch {
    return null;
  }
}

function looksLikeR2ObjectKey(path: string): boolean {
  const p = path.replace(/^\/+/, "").toLowerCase();
  if (!p || p.includes("://")) return false;
  return R2_KEY_PREFIXES.some((prefix) => p.startsWith(prefix));
}

function forceHttpsAbsolute(value: string): string {
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("http://")) {
    try {
      const u = new URL(value);
      // Keep plain http only for local development hosts.
      if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return value;
      u.protocol = "https:";
      return u.toString();
    } catch {
      return `https://${value.slice("http://".length)}`;
    }
  }
  return value;
}

function configuredStorageHosts(): Set<string> {
  const hosts = new Set<string>();
  const candidates = [
    process.env.R2_ENDPOINT,
    process.env.R2_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_MERCHANT_R2_BASE_URL,
  ];
  for (const c of candidates) {
    const h = c?.trim() ? hostOf(c.trim()) : null;
    if (h) hosts.add(h);
  }
  return hosts;
}

export function resolveSelfieUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value || value === "pending") return null;
  if (value.startsWith("data:") || value.startsWith("blob:")) return value;

  if (value.startsWith("/api/attachments/proxy")) return value;

  // Customer/backend proxy paths: /v1/attachments/proxy?key=…
  if (
    value.startsWith("/v1/attachments/proxy") ||
    value.startsWith("/attachments/proxy") ||
    value.includes("/attachments/proxy?")
  ) {
    try {
      const u = new URL(value.startsWith("http") ? value : `https://local${value.startsWith("/") ? "" : "/"}${value}`);
      return proxyKey(u.searchParams.get("key"));
    } catch {
      /* fall through */
    }
  }

  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("//")) {
    try {
      const u = new URL(value.startsWith("//") ? `https:${value}` : value.replace(/^http:\/\//i, "https://"));
      if (u.pathname.includes("/attachments/proxy")) {
        return proxyKey(u.searchParams.get("key"));
      }

      const path = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
      let key = path;
      const bucket = process.env.R2_BUCKET_NAME?.trim();
      if (bucket && key.startsWith(`${bucket}/`)) key = key.slice(bucket.length + 1);

      const storageHosts = configuredStorageHosts();
      const isStorageHost =
        storageHosts.has(u.host.toLowerCase()) ||
        u.hostname.includes("r2.cloudflarestorage.com") ||
        u.hostname.endsWith(".r2.dev");

      if (isStorageHost || looksLikeR2ObjectKey(key)) {
        return proxyKey(key);
      }

      // Third-party absolute URL (gravatar, etc.) — never leave http:// on treasury.
      return forceHttpsAbsolute(value.startsWith("//") ? `https:${value}` : value);
    } catch {
      return null;
    }
  }

  // Bare R2 object key
  return proxyKey(value.replace(/^\/+/, ""));
}

export function resolveMediaUrl(raw: string | null | undefined): string | null {
  return resolveSelfieUrl(raw);
}

/** Client-side guard for <img src> — upgrades leftover http:// URLs on HTTPS pages. */
export function ensureHttpsMediaUrl(src: string | null | undefined): string | null {
  const value = (src ?? "").trim();
  if (!value) return null;
  return forceHttpsAbsolute(value);
}

/** Map rider vehicle type/category → public asset for wheel class. */
export function vehicleImageForType(vehicleType: string, vehicleCategory = ""): "/2w.png" | "/3w.png" | "/4w.png" {
  const raw = `${vehicleCategory} ${vehicleType}`.toLowerCase();
  if (/\b(auto|rickshaw|e_rickshaw|ev_auto|3w|three)\b/.test(raw)) return "/3w.png";
  if (/\b(car|cab|taxi|ev_car|4w|four|sedan|hatch)\b/.test(raw)) return "/4w.png";
  return "/2w.png";
}
