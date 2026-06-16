import { normalizeR2ObjectKey } from "@/lib/r2-proxy-url";

const R2_PUBLIC_BASE = process.env.NEXT_PUBLIC_MERCHANT_R2_BASE_URL?.replace(/\/$/, "") ?? "";

/**
 * Normalize stored attachment values (R2 keys, legacy paths, absolute proxy URLs)
 * into a dashboard-relative `/api/attachments/proxy` URL the browser can load.
 */
export function resolveAttachmentProxyUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  let resolved = value.trim();
  if (!resolved) return "";

  if (resolved.startsWith("data:") || resolved.startsWith("blob:")) return resolved;

  if (resolved.startsWith("/v1/attachments/proxy")) {
    resolved = resolved.replace("/v1/attachments/proxy", "/api/attachments/proxy");
  }

  if (resolved.startsWith("http://") || resolved.startsWith("https://")) {
    try {
      const u = new URL(resolved);
      if (
        u.pathname.startsWith("/api/attachments/proxy") ||
        u.pathname.startsWith("/v1/attachments/proxy")
      ) {
        const key = u.searchParams.get("key");
        if (key?.trim()) {
          return `/api/attachments/proxy?key=${encodeURIComponent(key.trim())}`;
        }
        return `/api/attachments/proxy${u.search}`;
      }
      if (R2_PUBLIC_BASE && resolved.startsWith(R2_PUBLIC_BASE + "/")) {
        const objectKey = normalizeR2ObjectKey(resolved.slice(R2_PUBLIC_BASE.length + 1));
        if (objectKey) {
          return `/api/attachments/proxy?key=${encodeURIComponent(objectKey)}`;
        }
      }
    } catch {
      return resolved;
    }
    return resolved;
  }

  if (resolved.startsWith("/api/attachments/proxy")) {
    try {
      const u = new URL(resolved, "https://local.invalid");
      const key = u.searchParams.get("key");
      if (key) {
        const normalized = normalizeR2ObjectKey(decodeURIComponent(key));
        if (normalized) {
          return `/api/attachments/proxy?key=${encodeURIComponent(normalized)}`;
        }
      }
    } catch {
      // keep as-is
    }
    return resolved;
  }

  if (!resolved.includes("://") && !resolved.startsWith("/")) {
    const objectKey = normalizeR2ObjectKey(resolved);
    if (objectKey) {
      return `/api/attachments/proxy?key=${encodeURIComponent(objectKey)}`;
    }
  }

  return resolved;
}

/** Append a cache-bust query param so replaced proxy images reload without a full page refresh. */
export function withAttachmentCacheBust(url: string, version?: string | number): string {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("blob:") || trimmed.startsWith("data:")) return trimmed;
  const v = version ?? Date.now();
  const sep = trimmed.includes("?") ? "&" : "?";
  return `${trimmed}${sep}v=${encodeURIComponent(String(v))}`;
}

/** True when URL or stored file name indicates a PDF (not an image thumbnail). */
export function isPdfAttachment(url: string, fileName?: string | null): boolean {
  const u = (url.split("?")[0] ?? "").toLowerCase();
  const n = (fileName ?? "").toLowerCase();
  if (u.endsWith(".pdf") || n.endsWith(".pdf")) return true;
  if (u.includes(".pdf?") || n.includes("pdf")) return n.endsWith(".pdf") || u.includes(".pdf");
  return false;
}

const DOCUMENT_URL_SUFFIX = "_document_url";

/** Normalize all `*_document_url` fields on merchant_store_documents for API responses. */
export function normalizeMerchantDocumentUrls(
  documents: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!documents) return null;
  const out = { ...documents };
  for (const key of Object.keys(out)) {
    if (!key.endsWith(DOCUMENT_URL_SUFFIX)) continue;
    const v = out[key];
    if (typeof v === "string" && v.trim()) {
      out[key] = resolveAttachmentProxyUrl(v);
    }
  }
  const meta = out.aadhaar_document_metadata;
  if (meta != null && typeof meta === "object" && !Array.isArray(meta)) {
    const m = { ...(meta as Record<string, unknown>) };
    if (typeof m.back_url === "string" && m.back_url.trim()) {
      m.back_url = resolveAttachmentProxyUrl(m.back_url);
    }
    out.aadhaar_document_metadata = m;
  } else if (typeof meta === "string" && meta.trim()) {
    try {
      const parsed = JSON.parse(meta) as Record<string, unknown>;
      if (typeof parsed.back_url === "string" && parsed.back_url.trim()) {
        parsed.back_url = resolveAttachmentProxyUrl(parsed.back_url);
      }
      out.aadhaar_document_metadata = parsed;
    } catch {
      // keep string as-is
    }
  }
  return out;
}
