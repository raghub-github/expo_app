import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";

export type ParsedTicketAttachment = {
  storageKey: string;
  name: string;
  mimeType: string;
  url: string;
};

export function extractTicketAttachmentStorageKey(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (raw.startsWith("tickets/")) return raw.replace(/^\/+/, "");
  try {
    const u =
      raw.startsWith("http://") || raw.startsWith("https://")
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

function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (/\.(jpe?g)$/.test(lower)) return "image/jpeg";
  if (/\.png$/.test(lower)) return "image/png";
  if (/\.gif$/.test(lower)) return "image/gif";
  if (/\.webp$/.test(lower)) return "image/webp";
  if (/\.pdf$/.test(lower)) return "application/pdf";
  if (/\.(wav|wave)$/.test(lower)) return "audio/wav";
  if (/\.mp3$/.test(lower)) return "audio/mpeg";
  return "application/octet-stream";
}

function fromRecord(rec: {
  storageKey?: string;
  url?: string;
  name?: string;
  mimeType?: string;
  mime_type?: string;
}): ParsedTicketAttachment | null {
  let storageKey = (rec.storageKey ?? "").trim();
  const urlRaw = (rec.url ?? "").trim();
  if (!storageKey && urlRaw) {
    storageKey = extractTicketAttachmentStorageKey(urlRaw) ?? "";
  }
  if (!storageKey) return null;
  const name = (rec.name ?? "").trim() || storageKey.split("/").pop() || "Attachment";
  const mimeType =
    (rec.mimeType ?? rec.mime_type ?? "").trim() || guessMimeFromName(name);
  const url = resolveAttachmentProxyUrl(
    urlRaw || `/api/attachments/proxy?key=${encodeURIComponent(storageKey)}`,
  );
  if (!url) return null;
  return { storageKey, name, mimeType, url };
}

/**
 * Parse unified_ticket_messages.attachments[] entry (JSON string, proxy URL, or object).
 * Always returns storageKey + dashboard-relative proxy URL (never /v1 → backend :4000).
 */
export function parseTicketAttachmentItem(item: unknown): ParsedTicketAttachment | null {
  if (item == null) return null;

  if (typeof item === "string") {
    const text = item.trim();
    if (!text) return null;
    if (text.startsWith("{") || text.startsWith('"{')) {
      try {
        const parsed = JSON.parse(text) as unknown;
        if (typeof parsed === "string") return parseTicketAttachmentItem(parsed);
        if (parsed && typeof parsed === "object") {
          return fromRecord(parsed as Parameters<typeof fromRecord>[0]);
        }
      } catch {
        return null;
      }
    }
    const key = extractTicketAttachmentStorageKey(text);
    if (key) return fromRecord({ storageKey: key, url: text });
    if (text.startsWith("tickets/")) return fromRecord({ storageKey: text });
    return null;
  }

  if (typeof item === "object") {
    return fromRecord(item as Parameters<typeof fromRecord>[0]);
  }

  return null;
}
