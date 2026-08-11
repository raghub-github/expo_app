/**
 * GET /api/tickets/[id]/merge-candidates
 * Tickets on the same order as this ticket (for merge modal checkboxes).
 *
 * Matching is resilient: numeric order_id, orders_core.formatted_order_id,
 * and metadata.formatted_order_id (merchant/customer help flows).
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

function parseTicketId(param: string | undefined): number | null {
  if (!param) return null;
  const id = Number(param);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "bigint" ? Number(v) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeFormattedOrderId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/^#/, "").toUpperCase();
  return s.length > 0 ? s : null;
}

function formattedFromMetadata(metadata: unknown): string | null {
  if (metadata == null) return null;
  let obj: Record<string, unknown>;
  if (typeof metadata === "string") {
    try {
      obj = JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof metadata === "object" && !Array.isArray(metadata)) {
    obj = metadata as Record<string, unknown>;
  } else {
    return null;
  }
  const top = normalizeFormattedOrderId(obj.formatted_order_id);
  if (top) return top;
  const live = obj.live_order_support;
  if (live != null && typeof live === "object" && !Array.isArray(live)) {
    const nested = normalizeFormattedOrderId((live as Record<string, unknown>).formatted_order_id);
    if (nested) return nested;
  }
  return null;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedApiUser(_request);
    if (!auth.ok) return authFailureResponse(auth);
    const { user } = auth;

    const systemUser = await getSystemUserByEmail(user.email!);
    if (!systemUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const canView =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "TICKET"));
    if (!canView) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const { id: idParam } = await context.params;
    const ticketId = parseTicketId(idParam);
    if (!ticketId) {
      return NextResponse.json({ success: false, error: "Invalid ticket id" }, { status: 400 });
    }

    const sql = getSql();
    const primaryRows = await sql`
      SELECT ut.id, ut.order_id, ut.metadata, oc.formatted_order_id
      FROM public.unified_tickets ut
      LEFT JOIN public.orders_core oc ON oc.id = ut.order_id
      WHERE ut.id = ${ticketId}
      LIMIT 1
    `;
    const primary = primaryRows[0] as
      | {
          id: number | string;
          order_id: unknown;
          metadata: unknown;
          formatted_order_id: string | null;
        }
      | undefined;
    if (!primary) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }

    let orderId = toNum(primary.order_id);
    let orderFormattedId =
      normalizeFormattedOrderId(primary.formatted_order_id) ?? formattedFromMetadata(primary.metadata);

    // If order_id is missing but we have a display order id, resolve to orders_core.id.
    if (orderId == null && orderFormattedId) {
      const resolved = await sql`
        SELECT id, formatted_order_id
        FROM public.orders_core
        WHERE UPPER(TRIM(COALESCE(formatted_order_id, ''))) = ${orderFormattedId}
           OR UPPER(TRIM(COALESCE(order_id, ''))) = ${orderFormattedId}
           OR UPPER(TRIM(COALESCE(formatted_order_id, ''))) = ${orderFormattedId.replace(/-/g, "")}
           OR UPPER(TRIM(REPLACE(COALESCE(formatted_order_id, ''), '-', ''))) = ${orderFormattedId.replace(/-/g, "")}
        LIMIT 1
      `;
      const hit = resolved[0] as { id: unknown; formatted_order_id: string | null } | undefined;
      if (hit) {
        orderId = toNum(hit.id);
        orderFormattedId =
          normalizeFormattedOrderId(hit.formatted_order_id) ?? orderFormattedId;
      }
    }

    if (orderId == null && !orderFormattedId) {
      return NextResponse.json({
        success: true,
        data: [],
        orderId: null,
        orderFormattedId: null,
      });
    }

    const formattedCompact = orderFormattedId ? orderFormattedId.replace(/-/g, "") : null;

    const rows = await sql`
      SELECT ut.id, ut.ticket_id, ut.status, ut.subject, ut.parent_ticket_id
      FROM public.unified_tickets ut
      LEFT JOIN public.orders_core oc ON oc.id = ut.order_id
      WHERE
        (${orderId}::bigint IS NOT NULL AND ut.order_id = ${orderId})
        OR (
          ${orderFormattedId}::text IS NOT NULL
          AND (
            UPPER(TRIM(COALESCE(oc.formatted_order_id, ''))) = ${orderFormattedId}
            OR UPPER(TRIM(REPLACE(COALESCE(oc.formatted_order_id, ''), '-', ''))) = ${formattedCompact}
            OR UPPER(TRIM(COALESCE(ut.metadata->>'formatted_order_id', ''))) = ${orderFormattedId}
            OR UPPER(TRIM(REPLACE(COALESCE(ut.metadata->>'formatted_order_id', ''), '-', ''))) = ${formattedCompact}
            OR UPPER(TRIM(COALESCE(ut.metadata->'live_order_support'->>'formatted_order_id', ''))) = ${orderFormattedId}
            OR UPPER(TRIM(REPLACE(COALESCE(ut.metadata->'live_order_support'->>'formatted_order_id', ''), '-', ''))) = ${formattedCompact}
          )
        )
      ORDER BY ut.created_at DESC
      LIMIT 100
    `;

    const tickets = (rows as Array<Record<string, unknown>>).map((t) => ({
      id: Number(t.id),
      ticketNumber: String(t.ticket_id ?? ""),
      subject: String(t.subject ?? ""),
      status: String(t.status ?? "").toUpperCase(),
      parentTicketId: t.parent_ticket_id != null ? Number(t.parent_ticket_id) : null,
    }));

    return NextResponse.json({
      success: true,
      data: tickets,
      orderId,
      orderFormattedId,
    });
  } catch (error) {
    console.error("[GET /api/tickets/[id]/merge-candidates]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load merge candidates" },
      { status: 500 }
    );
  }
}
