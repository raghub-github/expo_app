/**
 * GET  /api/merchant/stores/[id]/wallet-requests — list wallet credit/debit requests
 * POST /api/merchant/stores/[id]/wallet-requests — create a new wallet credit/debit request
 *
 * Normal agents can CREATE requests (if can_request_wallet_adjustment).
 * Only SUPER_ADMIN / ADMIN can approve or reject (separate route).
 * Every action is audited to action_audit_log.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMerchantAccess, requireMerchantPermission, PermissionDeniedError } from "@/lib/permissions/merchant-access";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { logActionByAuth } from "@/lib/audit/logger";
import { getIpAddress, getUserAgent } from "@/lib/audit/logger";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const access = await getMerchantAccess(user.id, user.email);
    if (!access) {
      return NextResponse.json({ success: false, error: "Merchant access required" }, { status: 403 });
    }

    const sql = getSql();
    const status = request.nextUrl.searchParams.get("status");
    const direction = request.nextUrl.searchParams.get("direction");
    const search = (request.nextUrl.searchParams.get("search") ?? "").trim();
    const from = (request.nextUrl.searchParams.get("from") ?? "").trim(); // YYYY-MM-DD
    const to = (request.nextUrl.searchParams.get("to") ?? "").trim(); // YYYY-MM-DD
    const limit = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10) || 50));
    const offset = Math.max(0, parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10) || 0);

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
             mwcr.approved_ledger_id, mwcr.metadata, mwcr.created_at,
             ms.store_id AS store_code, ms.store_name
      FROM merchant_wallet_credit_requests mwcr
      JOIN merchant_stores ms ON ms.id = mwcr.merchant_store_id
      WHERE mwcr.merchant_store_id = ${storeId}
        AND (${status ?? null}::text IS NULL OR mwcr.status = ${status ?? null})
        ${directionFilter}
        ${searchFilter}
        ${dateFilter}
      ORDER BY mwcr.requested_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countSearchFilter = searchLike
      ? sql`AND (
          reason ILIKE ${searchLike}
          OR COALESCE(requested_by_email, '') ILIKE ${searchLike}
          OR COALESCE(requested_by_name, '') ILIKE ${searchLike}
          OR COALESCE(reviewed_by_email, '') ILIKE ${searchLike}
          OR COALESCE(reviewed_by_name, '') ILIKE ${searchLike}
          OR COALESCE(metadata->>'order_id', '') ILIKE ${searchLike}
        )`
      : sql``;

    const countDateFilter =
      fromTs || toTs
        ? sql`AND (${fromTs}::timestamptz IS NULL OR requested_at >= ${fromTs})
              AND (${toTs}::timestamptz IS NULL OR requested_at <= ${toTs})`
        : sql``;

    const [countRow] = await sql`
      SELECT COUNT(*)::int AS total FROM merchant_wallet_credit_requests
      WHERE merchant_store_id = ${storeId}
        AND (${status ?? null}::text IS NULL OR status = ${status ?? null})
        AND (${direction ?? null}::text IS NULL OR direction = ${direction ?? null})
        ${countSearchFilter}
        ${countDateFilter}
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
    console.error("[GET wallet-requests]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const ip = getIpAddress(request);
    const ua = getUserAgent(request);

    let access: Awaited<ReturnType<typeof requireMerchantPermission>>;
    try {
      access = await requireMerchantPermission(user.id, user.email, "can_request_wallet_adjustment", {
        storeId, resourceType: "MERCHANT_WALLET", resourceId: String(storeId),
        requestPath: request.nextUrl.pathname, requestMethod: "POST", ip, ua,
      });
    } catch (e) {
      if (e instanceof PermissionDeniedError) {
        return NextResponse.json({ success: false, error: e.message }, { status: 403 });
      }
      throw e;
    }

    const body = await request.json();
    const direction = body.direction;
    const amount = parseFloat(String(body.amount ?? 0));
    const reason = String(body.reason ?? "").trim();
    const orderId = body.order_id != null ? parseInt(String(body.order_id), 10) : null;
    const category = body.category ?? (direction === "CREDIT" ? "MANUAL_CREDIT" : "MANUAL_DEBIT");

    const metadata: Record<string, unknown> = {};
    if (Number.isFinite(orderId) && orderId != null) metadata.order_id = orderId;

    if (!["CREDIT", "DEBIT"].includes(direction)) {
      return NextResponse.json({ success: false, error: "direction must be CREDIT or DEBIT" }, { status: 400 });
    }
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ success: false, error: "amount must be positive" }, { status: 400 });
    }
    if (!reason || reason.length < 5) {
      return NextResponse.json({ success: false, error: "reason is required (min 5 characters)" }, { status: 400 });
    }

    // Resolve wallet
    const sql = getSql();
    const [walletRow] = await sql`
      SELECT id FROM merchant_wallet WHERE merchant_store_id = ${storeId} LIMIT 1
    `;
    if (!walletRow) {
      return NextResponse.json({ success: false, error: "Wallet not found for this store" }, { status: 404 });
    }
    const walletId = Number((walletRow as any).id);

    // If this request is linked to an order, prevent duplicate requests
    // for the same order (both pending and already fulfilled).
    if (Number.isFinite(orderId) && orderId != null) {
      const [existingForOrder] = await sql`
        SELECT id, status
        FROM merchant_wallet_credit_requests
        WHERE merchant_store_id = ${storeId}
          AND (metadata->>'order_id')::bigint = ${orderId}
          AND status IN ('PENDING', 'APPROVED')
        LIMIT 1
      `;

      if (existingForOrder) {
        return NextResponse.json(
          {
            success: false,
            error: "A wallet adjustment request already exists for this order.",
            code: "DUPLICATE_ORDER_WALLET_REQUEST",
          },
          { status: 409 },
        );
      }
    }

    const [inserted] = await sql`
      INSERT INTO merchant_wallet_credit_requests (
        wallet_id, merchant_store_id, direction, amount, reason, category, status,
        requested_by_system_user_id, requested_by_email, requested_by_name, metadata
      ) VALUES (
        ${walletId}, ${storeId}, ${direction}, ${amount}, ${reason}, ${category}, 'PENDING',
        ${access.systemUserId}, ${access.agentEmail}, ${access.agentName}, ${JSON.stringify(metadata)}::jsonb
      )
      RETURNING id, direction, amount, reason, category, status, requested_at
    `;

    const insertedId = (inserted as any).id;
    await logActionByAuth(user.id, user.email, "MERCHANT", "REQUEST_CREATE", {
      resourceType: "MERCHANT_WALLET_CREDIT_REQUEST",
      resourceId: String(insertedId),
      newValues: {
        request_id: insertedId,
        store_id: storeId,
        wallet_id: walletId,
        direction,
        amount,
        reason,
        category,
        order_id: metadata.order_id ?? null,
      },
      actionDetails: { created_request_id: insertedId },
      ipAddress: ip,
      userAgent: ua,
      requestPath: request.nextUrl.pathname,
      requestMethod: "POST",
      actionStatus: "SUCCESS",
    });

    return NextResponse.json({ success: true, request: inserted });
  } catch (e) {
    console.error("[POST wallet-requests]", e);
    try {
      const supabase = await createServerSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        await logActionByAuth(user.id, user.email, "MERCHANT", "REQUEST_CREATE", {
          resourceType: "MERCHANT_WALLET_CREDIT_REQUEST",
          actionStatus: "FAILED",
          errorMessage: e instanceof Error ? e.message : "Internal error",
          requestPath: request.nextUrl.pathname,
          requestMethod: "POST",
        });
      }
    } catch {
      // ignore audit failure
    }
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
