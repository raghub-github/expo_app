/**
 * GET /api/customers/[id]/unified-tickets
 * List unified_tickets rows for the customer (internal customers.id).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/permissions/engine";
import { getCustomerById, getCustomerByCustomerId } from "@/lib/db/operations/customers";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    const hasPermission = await checkPermission(
      user.id,
      user.email ?? "",
      "CUSTOMERS",
      "VIEW"
    );

    if (!hasPermission) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const numericId = parseInt(id, 10);
    const customer =
      !isNaN(numericId) && numericId.toString() === id
        ? await getCustomerById(numericId)
        : await getCustomerByCustomerId(id);

    if (!customer) {
      return NextResponse.json(
        { success: false, error: "Customer not found" },
        { status: 404 }
      );
    }

    const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") || "50", 10))
    );
    const offset = (page - 1) * limit;

    const sql = getSql();

    const countRows = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM public.unified_tickets
      WHERE customer_id = ${customer.id}
    `;
    const total = Number(countRows[0]?.count ?? 0);

    const rows = await sql<
      {
        id: bigint | number;
        ticket_id: string;
        status: string;
        priority: string;
        service_type: string;
        subject: string;
        created_at: Date;
      }[]
    >`
      SELECT
        id,
        ticket_id,
        status::text AS status,
        priority::text AS priority,
        service_type::text AS service_type,
        subject,
        created_at
      FROM public.unified_tickets
      WHERE customer_id = ${customer.id}
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const data = rows.map((r) => ({
      id: typeof r.id === "bigint" ? Number(r.id) : Number(r.id),
      ticketId: r.ticket_id,
      status: r.status,
      priority: r.priority,
      serviceType: r.service_type,
      subject: r.subject,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
      },
    });
  } catch (e) {
    console.error("GET /api/customers/[id]/unified-tickets", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
