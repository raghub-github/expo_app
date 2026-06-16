/** Strip query/hash and legacy `docs/` prefix from an R2 object key. */
export function normalizeR2ObjectKey(raw: string): string {
  let key = String(raw ?? "").trim();
  if (!key) return "";

  if (key.startsWith("http://") || key.startsWith("https://")) {
    try {
      const u = new URL(key);
      key = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
      const bucketSegment = key.split("/")[0];
      if (bucketSegment && !bucketSegment.includes(".")) {
        key = key.split("/").slice(1).join("/");
      }
    } catch {
      return "";
    }
  }

  const q = key.indexOf("?");
  if (q >= 0) key = key.slice(0, q);
  const h = key.indexOf("#");
  if (h >= 0) key = key.slice(0, h);

  key = key.replace(/^\/+/, "");
  if (key.startsWith("docs/orders/")) {
    key = key.slice("docs/".length);
  }
  return key;
}

/** Extract R2 object key from stored `/api/attachments/proxy?key=...` URL. */
export function extractR2KeyFromProxyUrl(url: string): string {
  try {
    const fakeOrigin = "https://local.invalid";
    const u = url.startsWith("http://") || url.startsWith("https://")
      ? new URL(url)
      : new URL(url, fakeOrigin);
    if (
      u.pathname.startsWith("/api/attachments/proxy") ||
      u.pathname.startsWith("/v1/attachments/proxy")
    ) {
      const key = u.searchParams.get("key");
      return key ? normalizeR2ObjectKey(decodeURIComponent(key)) : "";
    }
    return normalizeR2ObjectKey(url);
  } catch {
    return normalizeR2ObjectKey(url);
  }
}

export async function deleteR2ObjectForStoredUrl(url: string | null | undefined): Promise<void> {
  const raw = String(url ?? "").trim();
  if (!raw) return;
  const { deleteDocument } = await import("@/lib/services/r2");
  const key = raw.includes("/api/attachments/proxy")
    ? extractR2KeyFromProxyUrl(raw)
    : raw;
  if (!key) return;
  try {
    await deleteDocument(key);
  } catch {
    /* non-fatal */
  }
}
