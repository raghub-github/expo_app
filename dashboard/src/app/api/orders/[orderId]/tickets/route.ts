/**
 * GET /api/orders/[orderId]/tickets
 * List tickets linked to this order (unified_tickets where order_id = orderId).
 * Uses ORDER_FOOD access so anyone who can view the order can see its tickets.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

function parseOrderId(param: string | undefined): number | null {
  if (!param) return null;
  const id = Number(param);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId: orderIdParam } = await context.params;
    const orderId = parseOrderId(orderIdParam);
    if (!orderId) {
      return NextResponse.json(
        { success: false, error: "Invalid order id" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const canView =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_FOOD"));
    if (!canView) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions to view order tickets." },
        { status: 403 }
      );
    }

    const sqlClient = getSql();
    type OrderTicketRow = {
      id: number;
      ticket_id: string;
      status: string;
      subject: string;
      created_at: string;
      raised_by_type: string;
      resolved_by: number | null;
      resolved_by_name: string | null;
      resolver_name: string | null;
      resolver_email: string | null;
    };
    let rows: OrderTicketRow[] = [];
    try {
      const result = await sqlClient`
        SELECT ut.id, ut.ticket_id, ut.status, ut.subject, ut.created_at, ut.raised_by_type,
          ut.resolved_by, ut.resolved_by_name,
          COALESCE(ut.resolved_by_name, su.full_name) AS resolver_name,
          su.email AS resolver_email
        FROM public.unified_tickets ut
        LEFT JOIN public.system_users su ON su.id = ut.resolved_by
        WHERE ut.order_id = ${orderId}
        ORDER BY ut.created_at DESC
        LIMIT 100
      `;
      rows = result as unknown as OrderTicketRow[];
    } catch (e) {
      console.error("[GET /api/orders/[orderId]/tickets] Query error:", e);
      return NextResponse.json(
        { success: false, error: "Failed to fetch tickets" },
        { status: 500 }
      );
    }

    const tickets = rows.map((t) => ({
      id: t.id,
      ticketNumber: t.ticket_id ?? "",
      status: (t.status ?? "").toLowerCase().replace(/_/g, " "),
      subject: t.subject ?? "",
      createdAt: t.created_at ?? "",
      ticketSource: (t.raised_by_type ?? "").toLowerCase().replace(/_/g, " "),
      resolvedByName: t.resolved_by != null && t.resolver_name ? String(t.resolver_name).trim() : null,
      resolvedByEmail: t.resolved_by != null && t.resolver_email ? String(t.resolver_email).trim() : null,
    }));

    return NextResponse.json({ success: true, data: tickets });
  } catch (error) {
    console.error("[GET /api/orders/[orderId]/tickets] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list tickets",
      },
      { status: 500 }
    );
  }
}
