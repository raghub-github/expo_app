import { attachmentsProxyUrlFromKey } from "../utils/attachments-proxy-url.js";

export type TicketAttachmentDbRow = {
  storageKey: string;
  name: string;
  mimeType: string;
  url: string;
};

function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (/\.(jpe?g)$/.test(lower)) return "image/jpeg";
  if (/\.png$/.test(lower)) return "image/png";
  if (/\.gif$/.test(lower)) return "image/gif";
  if (/\.webp$/.test(lower)) return "image/webp";
  if (/\.pdf$/.test(lower)) return "application/pdf";
  if (/\.(wav|wave)$/.test(lower)) return "audio/wav";
  if (/\.mp3$/.test(lower)) return "audio/mpeg";
  if (/\.mp4$/.test(lower)) return "video/mp4";
  return "application/octet-stream";
}

/** Extract R2 object key from proxy URL or bare tickets/... path. */
export function extractTicketAttachmentStorageKey(value: string): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("tickets/")) return raw.replace(/^\/+/, "");
  try {
    const u = raw.startsWith("http://") || raw.startsWith("https://")
      ? new URL(raw)
      : new URL(raw, "http://local");
    const key = u.searchParams.get("key");
    if (key) {
      const decoded = decodeURIComponent(key).trim();
      return decoded || null;
    }
  } catch {
    // not a URL
  }
  return null;
}

function rowFromParts(
  storageKey: string,
  name?: string,
  mimeType?: string,
  url?: string,
): TicketAttachmentDbRow {
  const key = storageKey.trim();
  const fileName = (name || "").trim() || key.split("/").pop() || "file";
  const mime = (mimeType || "").trim() || guessMimeFromName(fileName);
  const proxyUrl = (url || "").trim();
  const normalizedUrl =
    proxyUrl && proxyUrl.includes("/attachments/proxy")
      ? proxyUrl.startsWith("/api/attachments/proxy")
        ? proxyUrl
        : attachmentsProxyUrlFromKey(key)
      : attachmentsProxyUrlFromKey(key);
  return {
    storageKey: key,
    name: fileName,
    mimeType: mime,
    url: normalizedUrl,
  };
}

function normalizeOne(raw: unknown): string | null {
  if (raw == null) return null;

  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return null;
    if (text.startsWith("{") || text.startsWith('"{')) {
      try {
        const parsed = JSON.parse(text) as unknown;
        if (typeof parsed === "string") return normalizeOne(parsed);
        return normalizeOne(parsed);
      } catch {
        return null;
      }
    }
    const fromKey = extractTicketAttachmentStorageKey(text);
    if (fromKey) {
      return JSON.stringify(rowFromParts(fromKey));
    }
    return null;
  }

  if (typeof raw === "object") {
    const o = raw as {
      storageKey?: unknown;
      url?: unknown;
      name?: unknown;
      mimeType?: unknown;
      mime_type?: unknown;
    };
    let storageKey =
      typeof o.storageKey === "string" ? o.storageKey.trim() : "";
    const urlStr = typeof o.url === "string" ? o.url.trim() : "";
    if (!storageKey && urlStr) {
      storageKey = extractTicketAttachmentStorageKey(urlStr) ?? "";
    }
    if (!storageKey) return null;
    const name = typeof o.name === "string" ? o.name : undefined;
    const mimeType =
      typeof o.mimeType === "string"
        ? o.mimeType
        : typeof o.mime_type === "string"
          ? o.mime_type
          : undefined;
    return JSON.stringify(rowFromParts(storageKey, name, mimeType, urlStr));
  }

  return null;
}

/**
 * Dashboard unified_ticket_messages.attachments expects text[] of JSON.stringify rows:
 * { storageKey, name, mimeType, url } with url `/api/attachments/proxy?key=...`.
 */
export function normalizeTicketAttachmentsForDb(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw.slice(0, 10)) {
    const row = normalizeOne(item);
    if (row) out.push(row);
  }
  return out;
}
