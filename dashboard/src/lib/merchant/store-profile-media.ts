/**
 * Banner/gallery URLs on merchant_stores: proxy paths, raw R2 keys, or legacy signed URLs.
 */

export function coerceGalleryImageList(val: unknown): string[] {
  if (val == null) return [];
  if (Array.isArray(val)) {
    return val.flatMap((x) => (x == null ? [] : String(x).trim())).filter(Boolean);
  }
  if (typeof val === "string") {
    const t = val.trim();
    if (!t) return [];
    if (t.startsWith("[") || t.startsWith("{")) {
      try {
        const p = JSON.parse(t) as unknown;
        if (Array.isArray(p)) return p.map((x) => String(x).trim()).filter(Boolean);
      } catch {
        /* ignore */
      }
    }
    return t
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** Resolve R2 object key from a DB URL value (dashboard proxy, raw key, or absolute URL with proxy path). */
export function profileMediaR2KeyFromUrl(url: string): string | null {
  const t = (url || "").trim();
  if (!t) return null;
  if (!t.includes("://") && !t.startsWith("/") && !t.startsWith("data:")) {
    const k = t.replace(/^\/+/, "");
    if (k.startsWith("docs/merchants/") || k.startsWith("merchants/")) return k;
  }
  const tryPath = (pathname: string, search: string): string | null => {
    if (!pathname.includes("attachments/proxy")) return null;
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    let k = params.get("key");
    if (!k) return null;
    // Unwrap accidental double-encoding without breaking plain paths.
    for (let i = 0; i < 2; i++) {
      if (!/%2f/i.test(k)) break;
      try {
        const next = decodeURIComponent(k);
        if (next === k) break;
        k = next;
      } catch {
        break;
      }
    }
    return k.trim() || null;
  };
  try {
    const u = new URL(t);
    const found = tryPath(u.pathname, u.search || "");
    if (found) return found;
  } catch {
    /* relative */
  }
  if (t.startsWith("/")) {
    const q = t.indexOf("?");
    if (q !== -1) {
      const path = t.slice(0, q);
      const search = t.slice(q);
      const found = tryPath(path, search);
      if (found) return found;
    }
  }
  return null;
}

export function attachmentsProxyUrlFromKey(key: string): string {
  return `/api/attachments/proxy?key=${encodeURIComponent(key)}`;
}

const MAX_GALLERY_IMAGES = 5;

export function maxGalleryImages(): number {
  return MAX_GALLERY_IMAGES;
}
