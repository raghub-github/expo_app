/**
 * GET /api/riders/[id]/withdrawals – rider withdrawals with filters (status, date range)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riders, withdrawalRequests, riderPaymentMethods } from "@/lib/db/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    const hasRiderAccess = await hasDashboardAccessByAuth(user.id, user.email ?? "", "RIDER");
    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions." }, { status: 403 });
    }

    const { id } = await params;
    const riderId = parseInt(id);
    if (isNaN(riderId)) {
      return NextResponse.json({ success: false, error: "Invalid rider ID" }, { status: 400 });
    }

    const db = getDb();
    const [riderRow] = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
    if (!riderRow) {
      return NextResponse.json({ success: false, error: "Rider not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "30", 10) || 30));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const status = searchParams.get("status");
    const q = (searchParams.get("q") || "").trim();

    const conditions: any[] = [eq(withdrawalRequests.riderId, riderId)];
    if (status && status !== "all") {
      conditions.push(eq(withdrawalRequests.status, status as any));
    }
    if (from) conditions.push(gte(withdrawalRequests.createdAt, new Date(from)));
    if (to) conditions.push(lte(withdrawalRequests.createdAt, new Date(to)));
    if (q) {
      const num = parseInt(q, 10);
      if (!Number.isNaN(num) && String(num) === q) {
        conditions.push(eq(withdrawalRequests.id, num));
      } else {
        conditions.push(eq(withdrawalRequests.amount, q));
      }
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(withdrawalRequests)
      .where(whereClause);
    const rows = await db
      .select({
        id: withdrawalRequests.id,
        riderId: withdrawalRequests.riderId,
        paymentMethodId: withdrawalRequests.paymentMethodId,
        amount: withdrawalRequests.amount,
        status: withdrawalRequests.status,
        bankAcc: withdrawalRequests.bankAcc,
        ifsc: withdrawalRequests.ifsc,
        accountHolderName: withdrawalRequests.accountHolderName,
        upiId: withdrawalRequests.upiId,
        transactionId: withdrawalRequests.transactionId,
        failureReason: withdrawalRequests.failureReason,
        processedAt: withdrawalRequests.processedAt,
        createdAt: withdrawalRequests.createdAt,
        updatedAt: withdrawalRequests.updatedAt,
        pmAccountHolderName: riderPaymentMethods.accountHolderName,
        pmBankName: riderPaymentMethods.bankName,
        pmIfsc: riderPaymentMethods.ifsc,
        pmBranch: riderPaymentMethods.branch,
        pmUpiId: riderPaymentMethods.upiId,
        pmMethodType: riderPaymentMethods.methodType,
      })
      .from(withdrawalRequests)
      .leftJoin(riderPaymentMethods, eq(withdrawalRequests.paymentMethodId, riderPaymentMethods.id))
      .where(whereClause)
      .orderBy(desc(withdrawalRequests.createdAt))
      .limit(Number.isNaN(limit) ? 30 : limit)
      .offset(offset);

    const withdrawals = rows.map((r) => ({
      id: r.id,
      riderId: r.riderId,
      paymentMethodId: r.paymentMethodId,
      amount: r.amount,
      status: r.status,
      bankAcc: r.bankAcc,
      ifsc: r.ifsc,
      accountHolderName: r.accountHolderName,
      upiId: r.upiId,
      transactionId: r.transactionId,
      failureReason: r.failureReason,
      processedAt: r.processedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      paymentMethodDetails:
        r.pmBankName != null || r.pmUpiId != null || r.pmAccountHolderName != null || r.pmMethodType != null
          ? {
              accountHolderName: r.pmAccountHolderName ?? r.accountHolderName,
              bankName: r.pmBankName,
              ifsc: r.pmIfsc ?? r.ifsc,
              branch: r.pmBranch,
              upiId: r.pmUpiId ?? r.upiId,
              bankAccMasked: r.bankAcc,
              methodType: r.pmMethodType ?? null,
            }
          : {
              accountHolderName: r.accountHolderName,
              bankName: null,
              ifsc: r.ifsc,
              branch: null,
              upiId: r.upiId,
              bankAccMasked: r.bankAcc,
              methodType: (r.ifsc || r.bankAcc) && !r.upiId ? "bank" : r.upiId ? "upi" : null,
            },
    }));

    return NextResponse.json({ success: true, data: { withdrawals, total: Number(total) ?? 0 } });
  } catch (error) {
    console.error("[GET /api/riders/[id]/withdrawals] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
