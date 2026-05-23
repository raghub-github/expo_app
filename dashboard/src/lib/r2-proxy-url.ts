/** Extract R2 object key from stored `/api/attachments/proxy?key=...` URL. */
export function extractR2KeyFromProxyUrl(url: string): string {
  try {
    const fakeOrigin = "https://local.invalid";
    const u = url.startsWith("http://") || url.startsWith("https://")
      ? new URL(url)
      : new URL(url, fakeOrigin);
    const key = u.searchParams.get("key");
    return key ? decodeURIComponent(key) : "";
  } catch {
    return "";
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
