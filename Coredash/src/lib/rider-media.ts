/**
 * Turn stored media (selfie / doc) into a browser-loadable Coredash proxy URL.
 * R2 keys and storage-endpoint URLs are rewritten to /api/attachments/proxy?key=…
 */
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
      const key = u.searchParams.get("key")?.trim();
      return key ? `/api/attachments/proxy?key=${encodeURIComponent(key)}` : null;
    } catch {
      /* fall through */
    }
  }

  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("//")) {
    try {
      const u = new URL(value.startsWith("//") ? `https:${value}` : value);
      if (u.pathname.includes("/attachments/proxy")) {
        const key = u.searchParams.get("key")?.trim();
        return key ? `/api/attachments/proxy?key=${encodeURIComponent(key)}` : null;
      }
      // Storage endpoint / CDN URL → extract object key
      const endpoint = (process.env.R2_ENDPOINT || process.env.R2_PUBLIC_BASE_URL || "").replace(/\/$/, "");
      const publicBase = (
        process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ||
        process.env.NEXT_PUBLIC_MERCHANT_R2_BASE_URL ||
        process.env.R2_PUBLIC_BASE_URL ||
        ""
      ).replace(/\/$/, "");
      const path = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
      let key = path;
      const bucket = process.env.R2_BUCKET_NAME?.trim();
      if (bucket && key.startsWith(`${bucket}/`)) key = key.slice(bucket.length + 1);
      if (
        (endpoint && u.origin === new URL(endpoint).origin) ||
        (publicBase && u.origin === new URL(publicBase).origin) ||
        u.hostname.includes("r2.cloudflarestorage.com")
      ) {
        return key ? `/api/attachments/proxy?key=${encodeURIComponent(key)}` : null;
      }
      // Unknown absolute URL (e.g. already public CDN / gravatar) — use as-is
      return value.startsWith("//") ? `https:${value}` : value;
    } catch {
      return null;
    }
  }

  // Bare R2 object key
  const key = value.replace(/^\/+/, "");
  if (!key) return null;
  return `/api/attachments/proxy?key=${encodeURIComponent(key)}`;
}

export function resolveMediaUrl(raw: string | null | undefined): string | null {
  return resolveSelfieUrl(raw);
}

/** Map rider vehicle type/category → public asset for wheel class. */
export function vehicleImageForType(vehicleType: string, vehicleCategory = ""): "/2w.png" | "/3w.png" | "/4w.png" {
  const raw = `${vehicleCategory} ${vehicleType}`.toLowerCase();
  if (/\b(auto|rickshaw|e_rickshaw|ev_auto|3w|three)\b/.test(raw)) return "/3w.png";
  if (/\b(car|cab|taxi|ev_car|4w|four|sedan|hatch)\b/.test(raw)) return "/4w.png";
  return "/2w.png";
}
