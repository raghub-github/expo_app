/**
 * Map store-scoped support tickets that mention / attach an order ID
 * into the same complaint shape used by User Insights. UI is unchanged;
 * these rows are extra Complaint entries in GET /api/merchant/reviews.
 */

export const TICKET_COMPLAINT_ID_OFFSET = 1_000_000_000;

const ORDER_ID_MENTION_RE = /\bGM[A-Z]{0,3}\d{4,}\b/i;

export type UnifiedTicketComplaintRow = {
  id: number;
  ticket_id?: string | null;
  subject?: string | null;
  description?: string | null;
  status?: string | null;
  order_id?: number | null;
  customer_id?: number | null;
  created_at?: string | null;
  ticket_type?: string | null;
  raised_by_name?: string | null;
  raised_by_type?: string | null;
  ticket_source?: string | null;
  metadata?: unknown;
  attachments?: unknown;
};

export function isCustomerRaisedTicket(row: {
  raised_by_type?: string | null;
  ticket_source?: string | null;
}): boolean {
  const raised = String(row.raised_by_type ?? "").toUpperCase();
  const source = String(row.ticket_source ?? "").toUpperCase();
  if (raised === "RIDER" || raised === "MERCHANT") return false;
  if (source === "RIDER" || source === "MERCHANT") return false;
  return raised === "CUSTOMER" || source === "CUSTOMER";
}

export function ticketMentionsOrder(row: UnifiedTicketComplaintRow): boolean {
  if (!isCustomerRaisedTicket(row)) return false;
  if (row.order_id != null && Number(row.order_id) > 0) return true;
  if (String(row.ticket_type ?? "").toUpperCase() === "ORDER_RELATED") return true;
  const meta =
    typeof row.metadata === "string"
      ? row.metadata
      : row.metadata != null
        ? JSON.stringify(row.metadata)
        : "";
  const blob = `${row.subject ?? ""} ${row.description ?? ""} ${meta}`;
  return ORDER_ID_MENTION_RE.test(blob);
}

export function formattedOrderIdFromTicketMetadata(metadata: unknown): string | null {
  if (metadata == null) return null;
  let obj: Record<string, unknown>;
  if (typeof metadata === "string") {
    try {
      obj = JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof metadata === "object") {
    obj = metadata as Record<string, unknown>;
  } else {
    return null;
  }
  const pick = (node: unknown): string | null => {
    if (node == null || typeof node !== "object") return null;
    const v = (node as Record<string, unknown>).formatted_order_id;
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  return pick(obj.customer_help) ?? pick(obj.live_order_support);
}

export function ticketComplaintListId(ticketPk: number): number {
  return TICKET_COMPLAINT_ID_OFFSET + ticketPk;
}

export function isTicketComplaintListId(id: number): boolean {
  return Number.isInteger(id) && id >= TICKET_COMPLAINT_ID_OFFSET;
}

export function ticketPkFromComplaintListId(id: number): number {
  return id - TICKET_COMPLAINT_ID_OFFSET;
}

/** Pull image URLs / R2 keys from unified_tickets.attachments (text[], jsonb, or JSON strings). */
export function extractTicketImageUrls(attachments: unknown): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (!t) return;
    if (/\.(pdf|mp3|wav|m4a|mp4|mov|webm|doc|docx)(\?|$)/i.test(t)) return;
    if (!out.includes(t)) out.push(t);
  };
  const walk = (v: unknown) => {
    if (v == null) return;
    if (typeof v === "string") {
      const s = v.trim();
      if (!s) return;
      if ((s.startsWith("[") || s.startsWith("{")) && (s.includes("http") || s.includes("/") || s.includes("key"))) {
        try {
          walk(JSON.parse(s));
          return;
        } catch {
          /* fall through */
        }
      }
      push(s);
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      const storageKey =
        (typeof o.storageKey === "string" && o.storageKey.trim()) ||
        (typeof o.key === "string" && o.key.trim()) ||
        "";
      const u = o.url ?? o.src ?? o.uri;
      if (storageKey) push(storageKey);
      else if (typeof u === "string") push(u);
    }
  };
  walk(attachments);
  return out.slice(0, 8);
}

const TICKET_COLS =
  "id, ticket_id, subject, description, status, order_id, customer_id, created_at, ticket_type, raised_by_name, raised_by_type, ticket_source, metadata, attachments";

function asTicketRow(raw: unknown): UnifiedTicketComplaintRow | null {
  if (raw == null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = Number(r.id);
  if (!Number.isInteger(id) || id < 1) return null;
  return {
    id,
    ticket_id: typeof r.ticket_id === "string" ? r.ticket_id : null,
    subject: typeof r.subject === "string" ? r.subject : null,
    description: typeof r.description === "string" ? r.description : null,
    status: r.status != null ? String(r.status) : null,
    order_id: r.order_id != null && Number.isFinite(Number(r.order_id)) ? Number(r.order_id) : null,
    customer_id:
      r.customer_id != null && Number.isFinite(Number(r.customer_id))
        ? Number(r.customer_id)
        : null,
    created_at: r.created_at != null ? String(r.created_at) : null,
    ticket_type: r.ticket_type != null ? String(r.ticket_type) : null,
    raised_by_name: typeof r.raised_by_name === "string" ? r.raised_by_name : null,
    raised_by_type: r.raised_by_type != null ? String(r.raised_by_type) : null,
    ticket_source: r.ticket_source != null ? String(r.ticket_source) : null,
    metadata: r.metadata,
    attachments: r.attachments,
  };
}

/**
 * Tickets for this store that are order-related or mention an order ID in the body.
 */
export async function loadOrderRelatedTicketsForStore(
  db: { from: (table: string) => any },
  storeInternalId: number,
  storeOrderIds: number[],
): Promise<UnifiedTicketComplaintRow[]> {
  const seen = new Set<number>();
  const out: UnifiedTicketComplaintRow[] = [];
  const push = (row: UnifiedTicketComplaintRow | null) => {
    if (!row || seen.has(row.id) || !ticketMentionsOrder(row)) return;
    seen.add(row.id);
    out.push(row);
  };

  const byStore = await db
    .from("unified_tickets")
    .select(TICKET_COLS)
    .eq("merchant_store_id", storeInternalId)
    .eq("raised_by_type", "CUSTOMER")
    .order("created_at", { ascending: false })
    .limit(200);
  for (const raw of byStore.data ?? []) push(asTicketRow(raw));

  const ids = storeOrderIds.filter((id) => Number.isInteger(id) && id > 0).slice(0, 200);
  if (ids.length > 0) {
    const byOrder = await db
      .from("unified_tickets")
      .select(TICKET_COLS)
      .in("order_id", ids)
      .eq("raised_by_type", "CUSTOMER")
      .order("created_at", { ascending: false })
      .limit(200);
    for (const raw of byOrder.data ?? []) push(asTicketRow(raw));
  }

  return out;
}

export async function mergeTicketMessageAttachments(
  db: { from: (table: string) => any },
  tickets: UnifiedTicketComplaintRow[],
): Promise<void> {
  const ids = tickets.map((t) => t.id).filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return;
  const { data } = await db
    .from("unified_ticket_messages")
    .select("ticket_id, attachments")
    .in("ticket_id", ids);
  const extraByTicket = new Map<number, unknown[]>();
  for (const raw of data ?? []) {
    if (raw == null || typeof raw !== "object") continue;
    const row = raw as { ticket_id?: unknown; attachments?: unknown };
    const tid = Number(row.ticket_id);
    if (!Number.isInteger(tid) || tid < 1) continue;
    const prev = extraByTicket.get(tid) ?? [];
    extraByTicket.set(tid, [...prev, row.attachments]);
  }
  for (const ticket of tickets) {
    const extra = extraByTicket.get(ticket.id);
    if (!extra?.length) continue;
    const existing = Array.isArray(ticket.attachments)
      ? ticket.attachments
      : ticket.attachments != null
        ? [ticket.attachments]
        : [];
    ticket.attachments = [...existing, ...extra];
  }
}
