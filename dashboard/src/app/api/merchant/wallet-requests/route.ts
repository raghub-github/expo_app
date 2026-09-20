/**
 * GET /api/merchant/wallet-requests
 * List ALL wallet credit/debit requests across all stores (for main merchant page sidebar).
 * Supports ?status=PENDING&limit=20&offset=0
 */
import { NextRequest, NextResponse } from "next/server";
import { authFailureResponse, getAuthenticatedApiUser } from "@/lib/auth/api-session";
import { resolveSystemUserForSupabaseAuth } from "@/lib/auth/user-mapping";
import { getMerchantAccess } from "@/lib/permissions/merchant-access";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) return authFailureResponse(auth);
    let email = (auth.user.email ?? "").trim();
    if (!email) {
      const mapped = await resolveSystemUserForSupabaseAuth(auth.user.id, undefined);
      email = (mapped?.email ?? "").trim();
    }
    if (!email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    const user = { id: auth.user.id, email };

    const access = await getMerchantAccess(user.id, user.email);
    if (!access) {
      return NextResponse.json({ success: false, error: "Merchant access required" }, { status: 403 });
    }

    const status = request.nextUrl.searchParams.get("status");
    const direction = request.nextUrl.searchParams.get("direction");
    const search = (request.nextUrl.searchParams.get("search") ?? "").trim();
    const from = (request.nextUrl.searchParams.get("from") ?? "").trim(); // YYYY-MM-DD
    const to = (request.nextUrl.searchParams.get("to") ?? "").trim(); // YYYY-MM-DD
    const limit = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? "20", 10) || 20));
    const offset = Math.max(0, parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10) || 0);

    const sql = getSql();
    const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });

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
             ms.store_id AS store_code, ms.store_name,
             oc.id AS resolved_order_core_id,
             COALESCE(
               NULLIF(TRIM(oc.formatted_order_id), ''),
               NULLIF(TRIM(oc.order_id::text), ''),
               NULLIF(TRIM(mwcr.metadata->>'order_label'), '')
             ) AS formatted_order_id
      FROM merchant_wallet_credit_requests mwcr
      JOIN merchant_stores ms ON ms.id = mwcr.merchant_store_id
      LEFT JOIN LATERAL (
        SELECT o.id, o.formatted_order_id, o.order_id
        FROM orders_core o
        WHERE o.merchant_store_id = mwcr.merchant_store_id
          AND (
            (
              (mwcr.metadata->>'order_id') ~ '^[0-9]+$'
              AND o.id = (mwcr.metadata->>'order_id')::bigint
            )
            OR (
              NULLIF(TRIM(mwcr.metadata->>'order_label'), '') IS NOT NULL
              AND REPLACE(UPPER(COALESCE(o.formatted_order_id, '')), '#', '')
                = REPLACE(UPPER(TRIM(mwcr.metadata->>'order_label')), '#', '')
            )
            OR (
              (mwcr.metadata->>'order_id') ~ '^[0-9]+$'
              AND REPLACE(UPPER(COALESCE(o.formatted_order_id, '')), '#', '')
                = ('GMF' || (mwcr.metadata->>'order_id'))
            )
          )
        ORDER BY
          CASE
            WHEN (mwcr.metadata->>'order_id') ~ '^[0-9]+$'
              AND o.id = (mwcr.metadata->>'order_id')::bigint THEN 0
            WHEN NULLIF(TRIM(mwcr.metadata->>'order_label'), '') IS NOT NULL
              AND REPLACE(UPPER(COALESCE(o.formatted_order_id, '')), '#', '')
                = REPLACE(UPPER(TRIM(mwcr.metadata->>'order_label')), '#', '') THEN 1
            ELSE 2
          END
        LIMIT 1
      ) oc ON TRUE
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

    const requests = (rows as any[]).map((r) => {
      const meta =
        r.metadata && typeof r.metadata === "object"
          ? r.metadata
          : typeof r.metadata === "string"
            ? (() => {
                try {
                  return JSON.parse(r.metadata);
                } catch {
                  return {};
                }
              })()
            : {};
      const rawOrderId = meta?.order_id;
      const fallbackOrderId =
        rawOrderId != null && Number.isFinite(Number(rawOrderId)) ? Number(rawOrderId) : null;
      const orderCoreId =
        r.resolved_order_core_id != null && Number.isFinite(Number(r.resolved_order_core_id))
          ? Number(r.resolved_order_core_id)
          : fallbackOrderId;
      const formatted =
        (typeof r.formatted_order_id === "string" && r.formatted_order_id.trim()) ||
        (typeof meta?.order_label === "string" && meta.order_label.trim()) ||
        null;
      return {
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
        ledger_remark:
          (typeof meta?.ledger_remark === "string" && meta.ledger_remark.trim()) ||
          (r.ledger_remark != null ? String(r.ledger_remark) : null),
        approved_amount:
          meta?.approved_amount != null && Number.isFinite(Number(meta.approved_amount))
            ? Number(meta.approved_amount)
            : r.approved_amount != null && Number.isFinite(Number(r.approved_amount))
              ? Number(r.approved_amount)
              : null,
        order_id: orderCoreId,
        formatted_order_id: formatted ? String(formatted).replace(/^#/, "") : null,
      };
    });

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
