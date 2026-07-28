/**
 * GET /api/customers/[id]/wallet-transactions
 * List customer_wallet_transactions for the customer (internal id or GM… customer_id).
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
      FROM public.customer_wallet_transactions
      WHERE customer_id = ${customer.id}
    `;
    const total = Number(countRows[0]?.count ?? 0);

    const rows = await sql<
      {
        id: bigint | number;
        transaction_id: string;
        transaction_type: string;
        amount: string | number;
        balance_before: string | number;
        balance_after: string | number;
        description: string;
        status: string | null;
        reference_id: string | null;
        reference_type: string | null;
        created_at: Date;
      }[]
    >`
      SELECT
        id,
        transaction_id,
        transaction_type::text AS transaction_type,
        amount,
        balance_before,
        balance_after,
        description,
        status,
        reference_id,
        reference_type,
        created_at
      FROM public.customer_wallet_transactions
      WHERE customer_id = ${customer.id}
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        id: Number(r.id),
        transactionId: r.transaction_id,
        transactionType: r.transaction_type,
        amount: r.amount,
        balanceBefore: r.balance_before,
        balanceAfter: r.balance_after,
        description: r.description,
        status: r.status,
        referenceId: r.reference_id,
        referenceType: r.reference_type,
        createdAt: r.created_at,
      })),
      pagination: { page, limit, total },
    });
  } catch (e) {
    console.error("GET /api/customers/[id]/wallet-transactions", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
