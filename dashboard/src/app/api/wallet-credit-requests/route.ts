/**
 * GET /api/wallet-credit-requests
 * List wallet credit requests with filters. Requires VIEW on RIDER_WALLET_CREDITS.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { walletCreditRequests, riders } from "@/lib/db/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { getSystemUserIdFromAuthUser, hasDashboardAccess, isSuperAdmin } from "@/lib/permissions/engine";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const systemUserId = await getSystemUserIdFromAuthUser(user.id, user.email ?? undefined);
    if (!systemUserId) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 403 });
    }

    // Any agent with RIDER dashboard access (view or full) can see pending action data
    const canView =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await hasDashboardAccess(systemUserId, "RIDER"));
    if (!canView) {
      return NextResponse.json({ success: false, error: "Insufficient permissions. RIDER dashboard access required." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // pending | approved | rejected
    const riderIdParam = searchParams.get("riderId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const minAmount = searchParams.get("minAmount");
    const maxAmount = searchParams.get("maxAmount");
    const orderIdParam = searchParams.get("orderId");
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "30", 10));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);

    const db = getDb();

    const conditions: ReturnType<typeof eq>[] = [];
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      conditions.push(eq(walletCreditRequests.status, status));
    }
    if (riderIdParam) {
      const riderId = parseInt(riderIdParam);
      if (!isNaN(riderId)) conditions.push(eq(walletCreditRequests.riderId, riderId));
    }
    if (from) conditions.push(gte(walletCreditRequests.requestedAt, new Date(from + "T00:00:00.000Z")));
    if (to) conditions.push(lte(walletCreditRequests.requestedAt, new Date(to + "T23:59:59.999Z")));
    if (minAmount != null && minAmount !== "") {
      const n = parseFloat(minAmount);
      if (!isNaN(n)) conditions.push(sql`${walletCreditRequests.amount} >= ${n.toFixed(2)}`);
    }
    if (maxAmount != null && maxAmount !== "") {
      const n = parseFloat(maxAmount);
      if (!isNaN(n)) conditions.push(sql`${walletCreditRequests.amount} <= ${n.toFixed(2)}`);
    }
    if (orderIdParam) {
      const orderId = parseInt(orderIdParam);
      if (!isNaN(orderId)) conditions.push(eq(walletCreditRequests.orderId, orderId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const countBase = db.select({ count: sql<number>`count(*)::int` }).from(walletCreditRequests);
    const [{ count: total }] = whereClause
      ? await countBase.where(whereClause)
      : await countBase;

    const rowsQuery = db
      .select({
        id: walletCreditRequests.id,
        riderId: walletCreditRequests.riderId,
        orderId: walletCreditRequests.orderId,
        serviceType: walletCreditRequests.serviceType,
        amount: walletCreditRequests.amount,
        reason: walletCreditRequests.reason,
        status: walletCreditRequests.status,
        requestedBySystemUserId: walletCreditRequests.requestedBySystemUserId,
        requestedByEmail: walletCreditRequests.requestedByEmail,
        requestedAt: walletCreditRequests.requestedAt,
        reviewedBySystemUserId: walletCreditRequests.reviewedBySystemUserId,
        reviewedByEmail: walletCreditRequests.reviewedByEmail,
        reviewedAt: walletCreditRequests.reviewedAt,
        reviewNote: walletCreditRequests.reviewNote,
        approvedLedgerRef: walletCreditRequests.approvedLedgerRef,
      })
      .from(walletCreditRequests)
      .orderBy(desc(walletCreditRequests.requestedAt))
      .limit(Number.isNaN(limit) ? 30 : limit)
      .offset(offset);

    const rows = whereClause ? await rowsQuery.where(whereClause) : await rowsQuery;

    // Optional: include rider display (e.g. rider_id or mobile) - keep response lean
    const list = rows.map((r) => ({
      id: r.id,
      riderId: r.riderId,
      orderId: r.orderId ?? undefined,
      serviceType: r.serviceType ?? undefined,
      amount: Number(r.amount),
      reason: r.reason,
      status: r.status,
      requestedBySystemUserId: r.requestedBySystemUserId ?? undefined,
      requestedByEmail: r.requestedByEmail ?? undefined,
      requestedAt: r.requestedAt,
      reviewedByEmail: r.reviewedByEmail ?? undefined,
      reviewedAt: r.reviewedAt ?? undefined,
      reviewNote: r.reviewNote ?? undefined,
      approvedLedgerRef: r.approvedLedgerRef ?? undefined,
    }));

    return NextResponse.json({ success: true, data: list, total: Number(total) ?? 0 });
  } catch (error) {
    console.error("[GET /api/wallet-credit-requests] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to list requests" },
      { status: 500 }
    );
  }
}
