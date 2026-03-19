/**
 * GET /api/merchant/wallet-requests
 * List ALL wallet credit/debit requests across all stores (for main merchant page sidebar).
 * Supports ?status=PENDING&limit=20&offset=0
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMerchantAccess } from "@/lib/permissions/merchant-access";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const access = await getMerchantAccess(user.id, user.email);
    if (!access) {
      return NextResponse.json({ success: false, error: "Merchant access required" }, { status: 403 });
    }

    const status = request.nextUrl.searchParams.get("status");
    const direction = request.nextUrl.searchParams.get("direction");
    const search = (request.nextUrl.searchParams.get("search") ?? "").trim();
    const from = (request.nextUrl.searchParams.get("from") ?? "").trim(); // YYYY-MM-DD
    const to = (request.nextUrl.searchParams.get("to") ?? "").trim(); // YYYY-MM-DD
    const limit = Math.min(50, Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? "20", 10) || 20));
    const offset = Math.max(0, parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10) || 0);

    const sql = getSql();
    let areaManagerId: number | null = null;
    if (!access.isSuperAdmin && !access.isAdmin) {
      const am = await getAreaManagerByUserId(access.systemUserId);
      if (am) areaManagerId = am.id;
    }

    const storeFilter = areaManagerId != null
      ? sql`AND ms.area_manager_id = ${areaManagerId}`
      : sql``;

    const directionFilter =
      direction === "CREDIT" || direction === "DEBIT"
        ? sql`AND mwcr.direction = ${direction}`
        : sql``;

    const searchLike = search ? `%${search}%` : null;
    const searchFilter = searchLike
      ? sql`AND (
          ms.store_name ILIKE ${searchLike}
          OR ms.store_id ILIKE ${searchLike}
          OR mwcr.reason ILIKE ${searchLike}
          OR COALESCE(mwcr.requested_by_email, '') ILIKE ${searchLike}
          OR COALESCE(mwcr.requested_by_name, '') ILIKE ${searchLike}
          OR COALESCE(mwcr.reviewed_by_email, '') ILIKE ${searchLike}
          OR COALESCE(mwcr.reviewed_by_name, '') ILIKE ${searchLike}
          OR COALESCE(mwcr.metadata->>'order_id', '') ILIKE ${searchLike}
        )`
      : sql``;

    const fromTs = /^\d{4}-\d{2}-\d{2}$/.test(from) ? `${from}T00:00:00.000Z` : null;
    const toTs = /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : null;
    const dateFilter =
      fromTs || toTs
        ? sql`AND (${fromTs}::timestamptz IS NULL OR mwcr.requested_at >= ${fromTs})
              AND (${toTs}::timestamptz IS NULL OR mwcr.requested_at <= ${toTs})`
        : sql``;

    const rows = await sql`
      SELECT mwcr.id, mwcr.wallet_id, mwcr.merchant_store_id, mwcr.direction, mwcr.amount, mwcr.reason, mwcr.category, mwcr.status,
             mwcr.requested_by_email, mwcr.requested_by_name, mwcr.requested_at,
             mwcr.reviewed_by_email, mwcr.reviewed_by_name, mwcr.reviewed_at, mwcr.review_note,
             mwcr.metadata,
             ms.store_id AS store_code, ms.store_name
      FROM merchant_wallet_credit_requests mwcr
      JOIN merchant_stores ms ON ms.id = mwcr.merchant_store_id
      WHERE 1=1 ${storeFilter}
        AND (${status ?? null}::text IS NULL OR mwcr.status = ${status ?? null})
        ${directionFilter}
        ${searchFilter}
        ${dateFilter}
      ORDER BY mwcr.requested_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [countRow] = await sql`
      SELECT COUNT(*)::int AS total
      FROM merchant_wallet_credit_requests mwcr
      JOIN merchant_stores ms ON ms.id = mwcr.merchant_store_id
      WHERE 1=1 ${storeFilter}
        AND (${status ?? null}::text IS NULL OR mwcr.status = ${status ?? null})
        ${directionFilter}
        ${searchFilter}
        ${dateFilter}
    `;

    const requests = (rows as any[]).map((r) => ({
      id: r.id,
      wallet_id: r.wallet_id,
      merchant_store_id: r.merchant_store_id,
      store_code: r.store_code,
      store_name: r.store_name,
      direction: r.direction,
      amount: Number(r.amount),
      reason: r.reason,
      category: r.category,
      status: r.status,
      requested_by_email: r.requested_by_email,
      requested_by_name: r.requested_by_name,
      requested_at: r.requested_at,
      reviewed_by_email: r.reviewed_by_email,
      reviewed_by_name: r.reviewed_by_name,
      reviewed_at: r.reviewed_at,
      review_note: r.review_note,
      order_id: r.metadata?.order_id ?? null,
    }));

    return NextResponse.json({
      success: true,
      requests,
      total: Number((countRow as any)?.total ?? 0),
      limit,
      offset,
    });
  } catch (e) {
    console.error("[GET /api/merchant/wallet-requests]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
