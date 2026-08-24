/** Strip query/hash and accidental nested proxy wrappers from an R2 object key. */
export function normalizeR2ObjectKey(raw: string): string {
  let key = String(raw ?? "").trim();
  if (!key) return "";

  if (key.startsWith("http://") || key.startsWith("https://")) {
    try {
      const u = new URL(key);
      if (
        u.pathname.startsWith("/api/attachments/proxy") ||
        u.pathname.startsWith("/v1/attachments/proxy")
      ) {
        const nested = u.searchParams.get("key");
        key = nested ? nested.trim() : decodeURIComponent(u.pathname.replace(/^\/+/, ""));
      } else {
        key = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
        const bucketSegment = key.split("/")[0];
        if (bucketSegment && !bucketSegment.includes(".")) {
          key = key.split("/").slice(1).join("/");
        }
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

function unwrapNestedProxyKey(raw: string): string {
  let k = String(raw ?? "").trim();
  if (!k) return "";

  for (let i = 0; i < 8; i++) {
    if (/%2f/i.test(k)) {
      try {
        const decoded = decodeURIComponent(k);
        if (decoded !== k) {
          k = decoded;
          continue;
        }
      } catch {
        break;
      }
    }

    const lower = k.toLowerCase();
    if (!lower.includes("attachments/proxy")) {
      return normalizeR2ObjectKey(k);
    }

    try {
      const u = new URL(
        k.startsWith("http://") || k.startsWith("https://")
          ? k
          : k.startsWith("/")
            ? `https://local.invalid${k}`
            : `https://local.invalid/${k}`
      );
      const inner = u.searchParams.get("key");
      if (inner && inner !== k) {
        k = inner.trim();
        continue;
      }
    } catch {
      /* fall through */
    }
    return normalizeR2ObjectKey(k);
  }
  return normalizeR2ObjectKey(k);
}

/** Extract R2 object key from stored `/api/attachments/proxy?key=...` URL or raw key. */
export function extractR2KeyFromProxyUrl(url: string): string {
  return unwrapNestedProxyKey(url);
}

/** Candidate object keys to try when the stored prefix (`docs/`) does not match R2. */
export function r2LookupKeyVariants(raw: string): string[] {
  const primary = unwrapNestedProxyKey(raw);
  if (!primary) return [];
  const out = new Set<string>([primary]);
  if (primary.startsWith("docs/")) {
    const rest = primary.slice("docs/".length);
    if (rest) out.add(rest);
  } else if (primary.startsWith("merchants/")) {
    out.add(`docs/${primary}`);
  }
  return [...out];
}

/** Stable relative proxy URL stored in DB and used by <img src>. */
export function toAttachmentProxyUrl(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return null;
  const key = unwrapNestedProxyKey(trimmed);
  if (!key) return null;
  return `/api/attachments/proxy?key=${encodeURIComponent(key)}`;
}

export function contentTypeFromR2Key(
  key: string,
  fallback?: string | null
): string {
  const fb = (fallback || "").trim();
  if (fb && fb !== "application/octet-stream") return fb;
  const ext = key.split(".").pop()?.toLowerCase() || "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "pdf") return "application/pdf";
  if (ext === "csv") return "text/csv";
  if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === "xls") return "application/vnd.ms-excel";
  return fb || "application/octet-stream";
}

export async function deleteR2ObjectForStoredUrl(url: string | null | undefined): Promise<void> {
  const raw = String(url ?? "").trim();
  if (!raw) return;
  const { deleteDocument } = await import("@/lib/services/r2");
  const key = extractR2KeyFromProxyUrl(raw) || raw;
  if (!key) return;
  try {
    await deleteDocument(key);
  } catch {
    /* non-fatal */
  }
}
