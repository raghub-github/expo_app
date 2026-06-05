import { getRiderAppConfig } from "@/src/config/env";
import { toAbsoluteImageUrl } from "@/src/utils/mediaUrl";

export type ResolvedTicketAttachment = {
  name: string;
  url: string;
  isImage: boolean;
};

function parseAttachmentRaw(att: unknown): {
  storageKey: string;
  url: string;
  name: string;
  mime: string;
} {
  let storageKey = "";
  let url = "";
  let name = "attachment";
  let mime = "";

  if (typeof att === "string") {
    const text = att.trim();
    if (text.startsWith("{") || text.startsWith('"{')) {
      try {
        const parsed = JSON.parse(text) as { storageKey?: string; url?: string; name?: string; mimeType?: string };
        storageKey = String(parsed.storageKey ?? "").trim();
        url = String(parsed.url ?? "").trim();
        name = String(parsed.name ?? "").trim() || name;
        mime = String(parsed.mimeType ?? "").trim();
      } catch {
        storageKey = text;
      }
    } else {
      storageKey = text;
    }
  } else if (att && typeof att === "object") {
    const rec = att as { storageKey?: string; url?: string; name?: string; mimeType?: string };
    storageKey = String(rec.storageKey ?? "").trim();
    url = String(rec.url ?? "").trim();
    name = String(rec.name ?? "").trim() || name;
    mime = String(rec.mimeType ?? "").trim();
  }

  return { storageKey, url, name, mime };
}

function looksLikeImage(name: string, mime: string, full: string): boolean {
  if (/^image\//i.test(mime)) return true;
  if (/\.(jpe?g|png|gif|webp|bmp|heic|heif)(\?|#|$)/i.test(name)) return true;
  if (full.includes("/attachments/proxy?key=") || full.includes("tickets/images/")) return true;
  if (/\.(pdf|docx?|xlsx?)(\?|#|$)/i.test(full)) return false;
  return /\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(full);
}

/** Resolve unified_ticket_messages.attachments entry to a loadable URL. */
export function resolveTicketAttachment(att: unknown): ResolvedTicketAttachment | null {
  const { storageKey, url, name, mime } = parseAttachmentRaw(att);
  if (!storageKey && !url) return null;

  const absolute = toAbsoluteImageUrl(
    url.startsWith("http") ? url : storageKey || url,
  );
  if (!absolute) return null;

  const displayName = name || storageKey.split("/").pop() || "attachment";
  return {
    name: displayName,
    url: absolute,
    isImage: looksLikeImage(displayName, mime, absolute),
  };
}

export function resolveTicketAttachmentList(raw: unknown): ResolvedTicketAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(resolveTicketAttachment).filter((a): a is ResolvedTicketAttachment => !!a);
}

export function riderApiBase(): string {
  return getRiderAppConfig().apiBaseUrl.replace(/\/+$/, "");
}
