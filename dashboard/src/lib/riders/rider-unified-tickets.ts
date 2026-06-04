import { getSql } from "@/lib/db/client";

export type RiderUnifiedTicketFilters = {
  limit?: number;
  offset?: number;
  from?: string;
  to?: string;
  status?: string;
  category?: string;
  priority?: string;
  orderRelated?: string;
  q?: string;
};

export type RiderUnifiedTicketListItem = {
  id: number;
  ticketId: string;
  orderId?: number;
  category: string;
  priority: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
  resolvedAt?: string;
};

type UnifiedTicketRow = {
  id: number;
  ticket_id: string;
  order_id: number | null;
  ticket_category: string;
  priority: string;
  subject: string;
  description: string;
  status: string;
  created_at: Date;
  resolved_at: Date | null;
};

export function mapTicketsStatusFilter(raw: string | undefined): string | null {
  if (!raw || raw === "all") return null;
  const m: Record<string, string> = {
    open: "OPEN",
    in_progress: "IN_PROGRESS",
    resolved: "RESOLVED",
    closed: "CLOSED",
  };
  return m[raw] ?? raw.toUpperCase();
}

export function mapTicketsCategoryFilter(raw: string | undefined): string | null {
  if (!raw || raw === "all") return null;
  const m: Record<string, string> = {
    payment: "PAYMENT",
    order: "ORDER",
    technical: "TECHNICAL",
    account: "ACCOUNT",
    delivery: "DELIVERY",
    refund: "REFUND",
    earnings: "EARNINGS",
    complaint: "COMPLAINT",
    other: "OTHER",
  };
  return m[raw.toLowerCase()] ?? raw.toUpperCase();
}

export function mapTicketsPriorityFilter(raw: string | undefined): string | null {
  if (!raw || raw === "all") return null;
  return raw.toUpperCase();
}

function mapRow(row: UnifiedTicketRow): RiderUnifiedTicketListItem {
  return {
    id: Number(row.id),
    ticketId: String(row.ticket_id ?? ""),
    orderId: row.order_id != null ? Number(row.order_id) : undefined,
    category: String(row.ticket_category ?? "").toLowerCase(),
    priority: String(row.priority ?? "").toLowerCase(),
    subject: row.subject ?? "",
    message: row.description ?? "",
    status: String(row.status ?? "").toLowerCase(),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    resolvedAt:
      row.resolved_at instanceof Date
        ? row.resolved_at.toISOString()
        : row.resolved_at
          ? String(row.resolved_at)
          : undefined,
  };
}

export async function fetchRiderUnifiedTickets(
  riderId: number,
  filters: RiderUnifiedTicketFilters,
): Promise<{ tickets: RiderUnifiedTicketListItem[]; total: number }> {
  const sql = getSql();
  const limit = Math.min(100, Math.max(1, filters.limit ?? 30));
  const offset = Math.max(0, filters.offset ?? 0);
  const statusEnum = mapTicketsStatusFilter(filters.status);
  const categoryEnum = mapTicketsCategoryFilter(filters.category);
  const priorityEnum = mapTicketsPriorityFilter(filters.priority);
  const fromDate = filters.from ? new Date(filters.from) : null;
  const toDate = filters.to ? new Date(filters.to) : null;
  const q = (filters.q ?? "").trim();
  const qNum = q && /^\d+$/.test(q) ? Number(q) : null;

  const [{ count }] = (await sql`
    SELECT count(*)::int AS count
    FROM public.unified_tickets ut
    WHERE ut.rider_id = ${riderId}
      AND ut.ticket_source = 'RIDER'::unified_ticket_source
      AND ut.raised_by_type = 'RIDER'::unified_ticket_source
      ${filters.orderRelated === "yes" ? sql`AND ut.order_id IS NOT NULL` : sql``}
      ${filters.orderRelated === "no" ? sql`AND ut.order_id IS NULL` : sql``}
      ${fromDate ? sql`AND ut.created_at >= ${fromDate}` : sql``}
      ${toDate ? sql`AND ut.created_at <= ${toDate}` : sql``}
      ${statusEnum ? sql`AND ut.status = ${statusEnum}::unified_ticket_status` : sql``}
      ${categoryEnum ? sql`AND ut.ticket_category = ${categoryEnum}::unified_ticket_category` : sql``}
      ${priorityEnum ? sql`AND ut.priority = ${priorityEnum}::unified_ticket_priority` : sql``}
      ${
        q
          ? qNum != null
            ? sql`AND (ut.id = ${qNum} OR ut.order_id = ${qNum} OR ut.ticket_id ILIKE ${`%${q}%`})`
            : sql`AND (ut.subject ILIKE ${`%${q}%`} OR ut.description ILIKE ${`%${q}%`} OR ut.ticket_id ILIKE ${`%${q}%`})`
          : sql``
      }
  `) as Array<{ count: number }>;

  const rows = (await sql`
    SELECT
      ut.id,
      ut.ticket_id,
      ut.order_id,
      ut.ticket_category::text AS ticket_category,
      ut.priority::text AS priority,
      ut.subject,
      ut.description,
      ut.status::text AS status,
      ut.created_at,
      ut.resolved_at
    FROM public.unified_tickets ut
    WHERE ut.rider_id = ${riderId}
      AND ut.ticket_source = 'RIDER'::unified_ticket_source
      AND ut.raised_by_type = 'RIDER'::unified_ticket_source
      ${filters.orderRelated === "yes" ? sql`AND ut.order_id IS NOT NULL` : sql``}
      ${filters.orderRelated === "no" ? sql`AND ut.order_id IS NULL` : sql``}
      ${fromDate ? sql`AND ut.created_at >= ${fromDate}` : sql``}
      ${toDate ? sql`AND ut.created_at <= ${toDate}` : sql``}
      ${statusEnum ? sql`AND ut.status = ${statusEnum}::unified_ticket_status` : sql``}
      ${categoryEnum ? sql`AND ut.ticket_category = ${categoryEnum}::unified_ticket_category` : sql``}
      ${priorityEnum ? sql`AND ut.priority = ${priorityEnum}::unified_ticket_priority` : sql``}
      ${
        q
          ? qNum != null
            ? sql`AND (ut.id = ${qNum} OR ut.order_id = ${qNum} OR ut.ticket_id ILIKE ${`%${q}%`})`
            : sql`AND (ut.subject ILIKE ${`%${q}%`} OR ut.description ILIKE ${`%${q}%`} OR ut.ticket_id ILIKE ${`%${q}%`})`
          : sql``
      }
    ORDER BY ut.created_at DESC, ut.id DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `) as UnifiedTicketRow[];

  return { tickets: rows.map(mapRow), total: Number(count) || 0 };
}
