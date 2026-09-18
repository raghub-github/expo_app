import { isBogusAttachmentProxyKey, normalizeR2ObjectKey } from "@/lib/r2-proxy-url";

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

  // Bare / mangled proxy path without a real object key — never invent ?key=attachments/proxy.
  if (
    /^(?:\/?(?:api|v1)\/)?attachments\/proxy\/?$/i.test(resolved) ||
    isBogusAttachmentProxyKey(resolved)
  ) {
    return "";
  }

  if (resolved.startsWith("http://") || resolved.startsWith("https://")) {
    try {
      const u = new URL(resolved);
      if (
        u.pathname.startsWith("/api/attachments/proxy") ||
        u.pathname.startsWith("/v1/attachments/proxy") ||
        u.pathname.includes("/attachments/proxy")
      ) {
        const key = u.searchParams.get("key");
        const normalized = key?.trim()
          ? normalizeR2ObjectKey(key.trim())
          : "";
        if (normalized && !isBogusAttachmentProxyKey(normalized)) {
          return `/api/attachments/proxy?key=${encodeURIComponent(normalized)}`;
        }
        return "";
      }
      if (R2_PUBLIC_BASE && resolved.startsWith(R2_PUBLIC_BASE + "/")) {
        const objectKey = normalizeR2ObjectKey(resolved.slice(R2_PUBLIC_BASE.length + 1));
        if (objectKey && !isBogusAttachmentProxyKey(objectKey)) {
          return `/api/attachments/proxy?key=${encodeURIComponent(objectKey)}`;
        }
      }
    } catch {
      return resolved;
    }
    return resolved;
  }

  if (
    resolved.startsWith("/api/attachments/proxy") ||
    /^(?:\/)?(?:api\/|v1\/)?attachments\/proxy\?/i.test(resolved)
  ) {
    try {
      const withSlash = resolved.startsWith("/") ? resolved : `/${resolved}`;
      const asApi = withSlash
        .replace(/^\/v1\/attachments\/proxy/i, "/api/attachments/proxy")
        .replace(/^\/attachments\/proxy/i, "/api/attachments/proxy");
      const u = new URL(asApi.startsWith("/api/") ? asApi : `/api/${asApi.replace(/^\/+/, "")}`, "https://local.invalid");
      const key = u.searchParams.get("key");
      if (key) {
        const normalized = normalizeR2ObjectKey(decodeURIComponent(key));
        if (normalized && !isBogusAttachmentProxyKey(normalized)) {
          return `/api/attachments/proxy?key=${encodeURIComponent(normalized)}`;
        }
      }
    } catch {
      // fall through
    }
    return "";
  }

  if (!resolved.includes("://") && !resolved.startsWith("/")) {
    const objectKey = normalizeR2ObjectKey(resolved);
    if (objectKey && !isBogusAttachmentProxyKey(objectKey)) {
      return `/api/attachments/proxy?key=${encodeURIComponent(objectKey)}`;
    }
    return "";
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
  const full = String(url || "").toLowerCase();
  const pathOnly = (full.split("?")[0] ?? "").toLowerCase();
  const n = String(fileName || "").toLowerCase();
  if (pathOnly.endsWith(".pdf") || n.endsWith(".pdf")) return true;
  // Proxy URLs keep the object key in ?key=…/file.pdf — path alone has no extension.
  if (full.includes(".pdf")) return true;
  try {
    const u = new URL(url, "https://local.invalid");
    const key = u.searchParams.get("key");
    if (key && decodeURIComponent(key).toLowerCase().includes(".pdf")) return true;
  } catch {
    /* ignore */
  }
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
