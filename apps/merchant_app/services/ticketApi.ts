import { getConfig, resolveUrlForDevice } from "@/config/env";
import { ticketDebugLog } from "@/lib/ticketDebugLog";
import { authFetch } from "@/services/authFetch";

const getBase = () => getConfig().apiBaseUrl;

/** Avoid `res.json()` on HTML error pages (wrong API URL) — RN throws "JSON Parse error: Unexpected character: <". */
function parseJsonFromText(text: string, httpStatus: number): unknown {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const head = trimmed.slice(0, 32).toLowerCase().replace(/^\uFEFF/, "");
  if (
    trimmed.startsWith("<") ||
    head.includes("<!doctype") ||
    head.includes("<html") ||
    head.includes("<head")
  ) {
    throw new Error(
      `API returned a web page instead of JSON (HTTP ${httpStatus}). Set EXPO_PUBLIC_API_BASE_URL to your Next dev origin on port 3000 (e.g. http://192.168.x.x:3000 on a phone, http://10.0.2.2:3000 on Android emulator). Run dashboard npm run dev and ensure Fastify is running so Next can proxy /v1 (MERCHANT_API_PROXY_TARGET). Restart Expo after changing .env.`
    );
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(
      `Invalid JSON from API (HTTP ${httpStatus}). ${trimmed.slice(0, 96)}${trimmed.length > 96 ? "…" : ""}`
    );
  }
}

async function readApiBody(res: Response): Promise<unknown> {
  let text: string;
  try {
    text = await res.text();
  } catch (e) {
    const detail = e instanceof Error ? e.message.trim() : String(e);
    throw new Error(
      `Failed to read API response (HTTP ${res.status}). ${detail || "Unknown read error."}`
    );
  }
  return parseJsonFromText(text, res.status);
}

function apiErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    const msg =
      (typeof o.error === "string" && o.error.trim()) ||
      (typeof o.message === "string" && o.message.trim()) ||
      "";
    if (msg) return msg;
  }
  return fallback;
}

/** POST create/reopen/rating may nest `ticket` under `data` (proxies/wrappers). */
function extractTicketRecordFromEnvelope(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const direct = b.ticket;
  if (direct && typeof direct === "object") return direct as Record<string, unknown>;
  const data = b.data;
  if (data && typeof data === "object") {
    const nested = (data as Record<string, unknown>).ticket;
    if (nested && typeof nested === "object") return nested as Record<string, unknown>;
  }
  return null;
}

function extractStorageKeyFromProxyUrl(value: string): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("tickets/images/")) return raw;
  try {
    const base = getBase();
    const u = new URL(raw, base);
    const key = u.searchParams.get("key");
    if (!key) return null;
    const decoded = decodeURIComponent(key).trim();
    return decoded || null;
  } catch {
    return null;
  }
}

function canonicalDashboardProxyUrl(storageKey: string): string {
  return `/api/attachments/proxy?key=${encodeURIComponent(storageKey)}`;
}

function toAbsoluteUrl(value: string): string {
  const v = (value || "").trim();
  if (!v) return v;
  if (/^https?:\/\//i.test(v)) return resolveUrlForDevice(v);
  if (v.startsWith("/api/attachments/proxy")) {
    return `${getBase()}/v1/attachments/proxy${v.slice("/api/attachments/proxy".length)}`;
  }
  if (v.startsWith("/")) {
    if (v === "/") return "";
    return resolveUrlForDevice(`${getBase()}${v}`);
  }
  return resolveUrlForDevice(v);
}

function normalizeMessageAttachment(raw: unknown): string | null {
  const fromRecord = (rec: { url?: unknown; storageKey?: unknown }): string | null => {
    if (typeof rec.storageKey === "string" && rec.storageKey.trim()) {
      return canonicalDashboardProxyUrl(rec.storageKey.trim());
    }
    if (typeof rec.url === "string" && rec.url.trim()) return toAbsoluteUrl(rec.url.trim());
    return null;
  };
  if (typeof raw === "string") {
    const v = raw.trim();
    if (!v) return null;
    if (v.startsWith("{") || v.startsWith("\"{")) {
      try {
        const parsed = JSON.parse(v) as unknown;
        if (typeof parsed === "string") {
          const parsedInner = JSON.parse(parsed) as { url?: unknown; storageKey?: unknown };
          const normalized = fromRecord(parsedInner);
          if (normalized) return normalized;
        } else if (parsed && typeof parsed === "object") {
          const normalized = fromRecord(parsed as { url?: unknown; storageKey?: unknown });
          if (normalized) return normalized;
        }
      } catch {
        // fall through and treat as plain URL/path
      }
    }
    const urlMatch = /"url"\s*:\s*"([^"]+)"/i.exec(v);
    if (urlMatch?.[1]) return toAbsoluteUrl(urlMatch[1]);
    const keyMatch = /"storageKey"\s*:\s*"([^"]+)"/i.exec(v);
    if (keyMatch?.[1]) {
      return canonicalDashboardProxyUrl(keyMatch[1]);
    }
    if (v.startsWith("tickets/images/")) {
      return canonicalDashboardProxyUrl(v);
    }
    return toAbsoluteUrl(v);
  }
  if (raw && typeof raw === "object") {
    const normalized = fromRecord(raw as { url?: unknown; storageKey?: unknown });
    if (normalized) return normalized;
  }
  return null;
}

function inferMimeTypeFromUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function extForMimeType(mimeType: string): string {
  const m = String(mimeType || "").toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return ".jpg";
  if (m === "image/png") return ".png";
  if (m === "image/webp") return ".webp";
  if (m === "image/gif") return ".gif";
  if (m === "image/heic") return ".heic";
  if (m === "image/heif") return ".heif";
  return "";
}

export type TicketSummary = {
  id: number;
  ticket_id: string;
  status: string;
  priority: string;
  created_at: string;
  created_at_display?: string;
  subject?: string | null;
  description?: string | null;
  ticket_title?: string;
  ticket_category?: string;
  satisfaction_rating?: number | null;
  satisfaction_feedback?: string | null;
  satisfaction_collected_at?: string | null;
  /** ISO timestamp when agent snooze ends (merchant-visible countdown). */
  snoozed_until?: string | null;
  snooze_reason?: string | null;
};

function assertUsableTicketSummary(t: TicketSummary): void {
  if (!Number.isInteger(t.id) || t.id < 1) {
    throw new Error("Invalid ticket data from server.");
  }
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    return Number.isFinite(v.getTime()) ? v.toISOString() : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  const s = String(v).trim();
  if (!s.length) return null;
  const d = new Date(s);
  if (Number.isFinite(d.getTime())) return d.toISOString();
  return null;
}

/** Pick snooze end time from API row (snake_case, camelCase, or odd casings). */
function extractSnoozedUntilRaw(r: Record<string, unknown>): unknown {
  const direct = r.snoozed_until ?? r.snoozedUntil;
  if (direct != null) return direct;
  for (const [k, v] of Object.entries(r)) {
    if (v == null) continue;
    const nk = k.toLowerCase().replace(/_/g, "");
    if (nk === "snoozeduntil") return v;
  }
  return null;
}

/** Normalize ticket payload from GET …/messages (handles Date objects and key variants). */
export function mapMessagesApiTicket(raw: unknown): TicketSummary {
  const r = raw as Record<string, unknown>;
  const createdRaw = r.created_at ?? r.createdAt;
  const satRating = r.satisfaction_rating ?? r.satisfactionRating;
  const satFeedback = r.satisfaction_feedback ?? r.satisfactionFeedback;
  const satCollected = r.satisfaction_collected_at ?? r.satisfactionCollectedAt;
  const snoozed = extractSnoozedUntilRaw(r);
  const reason = r.snooze_reason ?? r.snoozeReason;

  let satisfaction_rating: number | null = null;
  if (satRating != null && satRating !== "") {
    const n = Number(satRating);
    if (Number.isFinite(n)) satisfaction_rating = n;
  }

  return {
    id: Number(r.id),
    ticket_id: String(r.ticket_id ?? r.ticketId ?? ""),
    status: String(r.status ?? ""),
    priority: String(r.priority ?? ""),
    created_at: toIsoOrNull(createdRaw) ?? new Date().toISOString(),
    created_at_display:
      typeof r.created_at_display === "string"
        ? r.created_at_display
        : typeof r.createdAtDisplay === "string"
          ? r.createdAtDisplay
          : undefined,
    subject: r.subject != null ? String(r.subject) : null,
    description: r.description != null ? String(r.description) : null,
    ticket_title: r.ticket_title != null ? String(r.ticket_title) : undefined,
    ticket_category: r.ticket_category != null ? String(r.ticket_category) : undefined,
    satisfaction_rating,
    satisfaction_feedback:
      typeof satFeedback === "string" && satFeedback.trim() ? satFeedback.trim() : null,
    satisfaction_collected_at: toIsoOrNull(satCollected),
    snoozed_until: toIsoOrNull(snoozed),
    snooze_reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
  };
}

export type TicketMessage = {
  id: number;
  message_text: string;
  message_type: string;
  sender_type: string;
  sender_id: number | null;
  sender_name: string | null;
  attachments: string[];
  created_at: string;
  /** Client-only: stable id for optimistic rows + dedupe with realtime/API. */
  client_temp_id?: string;
  /** Client-only: outgoing message delivery UI. */
  delivery_status?: "sending" | "sent" | "failed";
};

/** Agent private notes must never appear in merchant support chat. */
function isInternalNoteMessageRow(m: {
  message_type?: string | null;
  is_internal_note?: boolean | null;
}): boolean {
  if (m.is_internal_note === true) return true;
  const raw = String(m.message_type ?? "").trim();
  if (!raw) return false;
  const norm = raw.toUpperCase().replace(/[\s-]+/g, "_");
  return norm === "INTERNAL_NOTE";
}

export type TicketMessageAttachmentInput = {
  url?: string;
  storageKey?: string;
  name?: string;
  mimeType?: string;
};

export type MerchantHelpSection = {
  ticketTitleId: number;
  sectionId: string;
  title: string;
  subtitle: string | null;
  quickOptions: string[];
  displayOrder: number | null;
  /** Ionicons glyph name from DB (`merchant_help_icon_name`); app may fall back to static map. */
  helpHubIcon: string | null;
};

function normalizeMerchantHelpSection(raw: Record<string, unknown>): MerchantHelpSection | null {
  const sidRaw =
    (typeof raw.section_id === "string" && raw.section_id) ||
    (typeof raw.sectionId === "string" && raw.sectionId) ||
    "";
  const sid = sidRaw.trim().toLowerCase();
  const tid = raw.ticket_title_id ?? raw.ticketTitleId;
  const idNum = typeof tid === "number" ? tid : typeof tid === "string" ? Number(tid.trim()) : NaN;
  if (!sid || !Number.isFinite(idNum) || idNum < 1) return null;
  const qo = raw.quick_options ?? raw.quickOptions;
  const quickOptions = Array.isArray(qo) ? qo.map((x) => String(x).trim()).filter(Boolean) : [];
  const iconRaw = raw.help_hub_icon ?? raw.helpHubIcon;
  const helpHubIcon =
    iconRaw != null && String(iconRaw).trim() ? String(iconRaw).trim() : null;
  return {
    ticketTitleId: idNum,
    sectionId: sid,
    title: String(raw.title ?? "").trim() || sid,
    subtitle: raw.subtitle != null && String(raw.subtitle).trim() ? String(raw.subtitle).trim() : null,
    quickOptions,
    displayOrder:
      raw.display_order != null && Number.isFinite(Number(raw.display_order))
        ? Number(raw.display_order)
        : raw.displayOrder != null && Number.isFinite(Number(raw.displayOrder))
          ? Number(raw.displayOrder)
          : null,
    helpHubIcon,
  };
}

/** Contact Us / help hub rows from ticket_titles (merchant_section_id). */
export async function fetchMerchantHelpSections(token: string): Promise<MerchantHelpSection[]> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/merchant-help-sections`, token);
  const body = await readApiBody(res);
  if (!res.ok) {
    throw new Error(apiErrorMessage(body, res.statusText || "Failed to load help sections"));
  }
  const data = body as { ok?: boolean; sections?: unknown[] };
  const list = Array.isArray(data.sections) ? data.sections : [];
  return list
    .map((x) => (x && typeof x === "object" ? normalizeMerchantHelpSection(x as Record<string, unknown>) : null))
    .filter((x): x is MerchantHelpSection => x != null);
}

export async function createStoreTicket(
  storeId: number,
  sectionCode: string,
  token: string,
  opts?: {
    subject?: string;
    description?: string;
    orderId?: number | null;
    /** Disambiguates multiple help rows that share the same `merchant_section_id`. */
    ticketTitleId?: number;
  }
): Promise<TicketSummary> {
  const url = `${getBase()}/v1/merchant-partner/stores/${storeId}/tickets`;
  const payload = {
    section_code: sectionCode,
    ticket_title_id: opts?.ticketTitleId,
    subject: opts?.subject,
    description: opts?.description,
    order_id: opts?.orderId ?? null,
  };
  ticketDebugLog("createStoreTicket:start", {
    url,
    storeId,
    sectionCode,
    ticketTitleId: opts?.ticketTitleId ?? null,
    descLen: (opts?.description ?? "").length,
  });
  let res: Response;
  try {
    res = await authFetch(url, token, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (e) {
    ticketDebugLog("createStoreTicket:fetch_threw", {
      err: e instanceof Error ? { name: e.name, message: e.message } : String(e),
    });
    throw e;
  }
  ticketDebugLog("createStoreTicket:http", { status: res.status, ok: res.ok });
  let body: unknown;
  try {
    body = await readApiBody(res);
  } catch (e) {
    ticketDebugLog("createStoreTicket:parse_body_failed", {
      status: res.status,
      err: e instanceof Error ? { name: e.name, message: e.message } : String(e),
    });
    throw e;
  }
  if (!res.ok) {
    const msg = apiErrorMessage(body, res.statusText || "Failed to create support ticket");
    ticketDebugLog("createStoreTicket:error_response", { status: res.status, msg, bodyPreview: JSON.stringify(body).slice(0, 400) });
    throw new Error(msg);
  }
  const row = extractTicketRecordFromEnvelope(body);
  if (!row) {
    ticketDebugLog("createStoreTicket:missing_ticket_envelope", { keys: body && typeof body === "object" ? Object.keys(body as object) : [] });
    throw new Error("Missing ticket in server response.");
  }
  const ticket = mapMessagesApiTicket(row);
  try {
    assertUsableTicketSummary(ticket);
  } catch (e) {
    ticketDebugLog("createStoreTicket:bad_ticket_id", { id: ticket.id, rowId: row.id });
    throw e;
  }
  ticketDebugLog("createStoreTicket:ok", { ticketId: ticket.id });
  return ticket;
}

export async function getStoreTickets(
  storeId: number,
  token: string
): Promise<TicketSummary[]> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/tickets`,
    token
  );
  const body = await readApiBody(res);
  if (!res.ok) {
    throw new Error(apiErrorMessage(body, res.statusText || "Failed to load tickets"));
  }
  const data = body as { tickets?: TicketSummary[] };
  return Array.isArray(data.tickets) ? data.tickets : [];
}

export async function getTicketMessages(
  storeId: number,
  ticketId: number,
  token: string
): Promise<{ ticket: TicketSummary; messages: TicketMessage[] }> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/tickets/${ticketId}/messages`,
    token
  );
  const body = await readApiBody(res);
  if (!res.ok) {
    throw new Error(apiErrorMessage(body, res.statusText || "Failed to load ticket messages"));
  }
  const data = body as {
    ticket: TicketSummary;
    messages: Array<Record<string, unknown>>;
  };
  if (!data.ticket || typeof data.ticket !== "object") {
    throw new Error("Invalid ticket payload from server.");
  }
  const messages: TicketMessage[] = (data.messages ?? [])
    .filter((m) => !isInternalNoteMessageRow(m as { message_type?: string | null; is_internal_note?: boolean | null }))
    .map((raw, idx) => {
      const m = raw as Record<string, unknown>;
      const idRaw = m.id ?? m.message_id ?? m.messageId;
      let idNum: number;
      if (typeof idRaw === "number" && Number.isFinite(idRaw)) idNum = idRaw;
      else if (typeof idRaw === "string" && idRaw.trim()) idNum = Number(idRaw.trim());
      else idNum = NaN;
      if (!Number.isFinite(idNum) || idNum < 1) idNum = -(idx + 1);

      const messageText =
        (typeof m.message_text === "string" ? m.message_text : null) ??
        (typeof m.messageText === "string" ? m.messageText : null) ??
        "";
      const messageType =
        (typeof m.message_type === "string" ? m.message_type : null) ??
        (typeof m.messageType === "string" ? m.messageType : null) ??
        "TEXT";
      const senderType =
        (typeof m.sender_type === "string" ? m.sender_type : null) ??
        (typeof m.senderType === "string" ? m.senderType : null) ??
        "MERCHANT";
      const senderId = (m.sender_id ?? m.senderId) as number | null | undefined;
      const senderName =
        (typeof m.sender_name === "string" ? m.sender_name : null) ??
        (typeof m.senderName === "string" ? m.senderName : null) ??
        null;
      const createdRaw = m.created_at ?? m.createdAt;
      const created_at =
        createdRaw instanceof Date
          ? createdRaw.toISOString()
          : typeof createdRaw === "string" && createdRaw.trim()
            ? createdRaw.trim()
            : new Date().toISOString();
      const attachmentsRaw = m.attachments;
      return {
        id: idNum,
        message_text: messageText,
        message_type: messageType,
        sender_type: senderType,
        sender_id: typeof senderId === "number" && Number.isFinite(senderId) ? senderId : null,
        sender_name: senderName,
        attachments: Array.isArray(attachmentsRaw)
          ? attachmentsRaw
              .map((a) => normalizeMessageAttachment(a))
              .filter((u): u is string => Boolean(u))
          : [],
        created_at,
      };
    });
  return { ticket: mapMessagesApiTicket(data.ticket), messages };
}

export async function uploadTicketAttachment(
  storeId: number,
  ticketId: number,
  fileUri: string,
  token: string,
  opts?: { fileName?: string; mimeType?: string }
): Promise<{ storageKey: string; url: string; name?: string; mimeType?: string }> {
  const cleanUri = String(fileUri || "").trim();
  if (!cleanUri) throw new Error("Attachment URI missing");
  let nameGuess =
    (opts?.fileName && opts.fileName.trim()) ||
    cleanUri.split("/").pop()?.split("?")[0] ||
    `attachment-${Date.now()}.jpg`;
  let mimeType = (opts?.mimeType && opts.mimeType.trim()) || inferMimeTypeFromUri(cleanUri);
  // Android content:// URIs often lack extension; in support chat picker we allow only images.
  if (cleanUri.startsWith("content://") && mimeType === "application/octet-stream") {
    mimeType = "image/jpeg";
  }
  // Ensure image uploads keep a valid extension so all UIs can classify as image.
  const hasKnownExtension = /\.[a-z0-9]{2,6}$/i.test(nameGuess);
  if (!hasKnownExtension) {
    const ext = extForMimeType(mimeType);
    if (ext) {
      nameGuess = `${nameGuess}${ext}`;
    }
  }

  const formData = new FormData();
  formData.append("file", {
    uri: cleanUri,
    name: nameGuess,
    type: mimeType,
  } as any);

  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/tickets/${ticketId}/upload`,
    token,
    { method: "POST", body: formData }
  );
  const body = await readApiBody(res);
  if (!res.ok) {
    throw new Error(apiErrorMessage(body, res.statusText || "Failed to upload attachment"));
  }
  const data = body as {
    success?: boolean;
    attachment?: { storageKey?: string; url?: string; name?: string; mimeType?: string };
  };
  const attachment = data.attachment ?? {};
  return {
    storageKey: String(attachment.storageKey ?? ""),
    url: toAbsoluteUrl(String(attachment.url ?? "")),
    name: attachment.name,
    mimeType: attachment.mimeType,
  };
}

export async function rateTicket(
  storeId: number,
  ticketId: number,
  rating: number,
  token: string,
  feedback?: string
): Promise<TicketSummary> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/tickets/${ticketId}/rating`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        rating,
        feedback: feedback && feedback.trim().length ? feedback.trim() : undefined,
      }),
    }
  );
  const body = await readApiBody(res);
  if (!res.ok) {
    throw new Error(apiErrorMessage(body, res.statusText || "Failed to submit rating"));
  }
  const row = extractTicketRecordFromEnvelope(body);
  if (!row) {
    throw new Error("Missing ticket in server response.");
  }
  const ticket = mapMessagesApiTicket(row);
  assertUsableTicketSummary(ticket);
  return ticket;
}

export async function reopenTicket(
  storeId: number,
  ticketId: number,
  token: string
): Promise<TicketSummary> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/tickets/${ticketId}/reopen`,
    token,
    { method: "POST" }
  );
  const body = await readApiBody(res);
  if (!res.ok) {
    throw new Error(apiErrorMessage(body, res.statusText || "Failed to reopen ticket"));
  }
  const row = extractTicketRecordFromEnvelope(body);
  if (!row) {
    throw new Error("Missing ticket in server response.");
  }
  const ticket = mapMessagesApiTicket(row);
  assertUsableTicketSummary(ticket);
  return ticket;
}

export async function postTicketMessage(
  storeId: number,
  ticketId: number,
  messageText: string,
  token: string,
  attachments?: Array<string | TicketMessageAttachmentInput>
): Promise<TicketMessage> {
  const attachmentsPayload = (attachments ?? [])
    .map((att) => {
      if (typeof att === "string") {
        const raw = att.trim();
        if (!raw) return null;
        const keyFromRaw = extractStorageKeyFromProxyUrl(raw);
        if (keyFromRaw) {
          return JSON.stringify({
            storageKey: keyFromRaw,
            url: canonicalDashboardProxyUrl(keyFromRaw),
          });
        }
        return JSON.stringify({ url: toAbsoluteUrl(raw) });
      }
      const storageKey = typeof att.storageKey === "string" ? att.storageKey.trim() : "";
      const url = typeof att.url === "string" ? att.url.trim() : "";
      const name = typeof att.name === "string" ? att.name.trim() : "";
      const mimeType = typeof att.mimeType === "string" ? att.mimeType.trim() : "";
      const derivedKey = storageKey || (url ? extractStorageKeyFromProxyUrl(url) ?? "" : "");
      const canonicalUrl = derivedKey
        ? canonicalDashboardProxyUrl(derivedKey)
        : url
          ? toAbsoluteUrl(url)
          : "";
      if (!derivedKey && !canonicalUrl) return null;
      return JSON.stringify({
        storageKey: derivedKey || undefined,
        name: name || undefined,
        mimeType: mimeType || undefined,
        url: canonicalUrl || undefined,
      });
    })
    .filter((v): v is string => Boolean(v));
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/tickets/${ticketId}/messages`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        message_text: messageText,
        attachments: attachmentsPayload.length ? attachmentsPayload : undefined,
      }),
    }
  );
  const body = await readApiBody(res);
  if (!res.ok) {
    throw new Error(apiErrorMessage(body, res.statusText || "Failed to send message"));
  }
  if (!body || typeof body !== "object") {
    throw new Error("Invalid message payload from server.");
  }
  const envelope = body as Record<string, unknown>;
  let rawMsg: unknown = envelope.message;
  if (!rawMsg && envelope.data && typeof envelope.data === "object") {
    const d = envelope.data as Record<string, unknown>;
    rawMsg = typeof d.id === "number" || typeof d.id === "string" ? d : d.message;
  }
  if (!rawMsg || typeof rawMsg !== "object") {
    throw new Error("Invalid message payload from server.");
  }
  const msg = rawMsg as Record<string, unknown>;
  /** Postgres bigint ids often arrive as strings over JSON. */
  const idRaw = msg.id ?? msg.message_id ?? msg.messageId;
  let idNum: number;
  if (typeof idRaw === "number" && Number.isFinite(idRaw)) {
    idNum = idRaw;
  } else if (typeof idRaw === "bigint") {
    idNum = Number(idRaw);
  } else if (typeof idRaw === "string" && idRaw.trim()) {
    idNum = Number(idRaw.trim());
  } else {
    idNum = NaN;
  }
  if (!Number.isFinite(idNum) || idNum < 1) {
    throw new Error("Invalid message payload from server.");
  }
  const textOut =
    (typeof msg.message_text === "string" ? msg.message_text : null) ??
    (typeof msg.messageText === "string" ? msg.messageText : null) ??
    messageText;
  const createdRaw = msg.created_at ?? msg.createdAt;
  let created_at: string;
  if (typeof createdRaw === "string" && createdRaw.trim()) {
    created_at = createdRaw.trim();
  } else if (createdRaw instanceof Date && Number.isFinite(createdRaw.getTime())) {
    created_at = createdRaw.toISOString();
  } else {
    created_at = new Date().toISOString();
  }
  return {
    id: idNum,
    message_text: textOut,
    message_type: "TEXT",
    sender_type: "MERCHANT",
    sender_id: null,
    sender_name: null,
    attachments: attachmentsPayload
      .map((a) => normalizeMessageAttachment(a))
      .filter((u): u is string => Boolean(u)),
    created_at,
  };
}

