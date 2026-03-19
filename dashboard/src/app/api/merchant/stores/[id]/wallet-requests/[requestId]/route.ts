/**
 * PATCH /api/merchant/stores/[id]/wallet-requests/[requestId]
 * Body: { action: "APPROVE" | "REJECT", review_note?: string }
 *
 * ONLY SUPER_ADMIN or ADMIN can approve/reject.
 * On approval: calls merchant_wallet_credit or merchant_wallet_debit RPC atomically.
 * All actions audited.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMerchantAccess, PermissionDeniedError } from "@/lib/permissions/merchant-access";
import { logActionByAuth, getIpAddress, getUserAgent } from "@/lib/audit/logger";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  try {
    const { id, requestId } = await params;
    const storeId = parseInt(id, 10);
    const reqId = parseInt(requestId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(reqId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const ip = getIpAddress(request);
    const ua = getUserAgent(request);

    const access = await getMerchantAccess(user.id, user.email);
    if (!access) {
      return NextResponse.json({ success: false, error: "Merchant access required" }, { status: 403 });
    }

    // Only SUPER_ADMIN or ADMIN can approve/reject
    if (!access.isSuperAdmin && !access.isAdmin) {
      await logActionByAuth(user.id, user.email, "MERCHANT", "REQUEST_APPROVE", {
        resourceType: "MERCHANT_WALLET_CREDIT_REQUEST",
        resourceId: String(reqId),
        actionStatus: "FAILED",
        errorMessage: "Only admin or super admin can approve/reject wallet requests",
        ipAddress: ip,
        userAgent: ua,
        requestPath: request.nextUrl.pathname,
        requestMethod: "PATCH",
      });
      return NextResponse.json({
        success: false,
        error: "Only admin or super admin can approve/reject wallet credit/debit requests",
      }, { status: 403 });
    }

    const body = await request.json();
    const action = String(body.action ?? "").toUpperCase();
    const reviewNote = String(body.review_note ?? "").trim();

    if (!["APPROVE", "REJECT"].includes(action)) {
      return NextResponse.json({ success: false, error: "action must be APPROVE or REJECT" }, { status: 400 });
    }

    const sql = getSql();

    // Fetch the request
    const [req] = await sql`
      SELECT id, wallet_id, merchant_store_id, direction, amount, reason, category, status
      FROM merchant_wallet_credit_requests
      WHERE id = ${reqId} AND merchant_store_id = ${storeId}
    `;
    if (!req) {
      const logActionType: "REQUEST_APPROVE" | "REQUEST_REJECT" = action === "APPROVE" ? "REQUEST_APPROVE" : "REQUEST_REJECT";
      await logActionByAuth(user.id, user.email, "MERCHANT", logActionType, {
        resourceType: "MERCHANT_WALLET_CREDIT_REQUEST",
        resourceId: String(reqId),
        actionStatus: "FAILED",
        errorMessage: "Request not found",
        ipAddress: ip,
        userAgent: ua,
        requestPath: request.nextUrl.pathname,
        requestMethod: "PATCH",
      });
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }
    const r = req as any;
    if (r.status !== "PENDING") {
      const logActionType: "REQUEST_APPROVE" | "REQUEST_REJECT" = action === "APPROVE" ? "REQUEST_APPROVE" : "REQUEST_REJECT";
      await logActionByAuth(user.id, user.email, "MERCHANT", logActionType, {
        resourceType: "MERCHANT_WALLET_CREDIT_REQUEST",
        resourceId: String(reqId),
        previousValues: { status: r.status },
        actionStatus: "FAILED",
        errorMessage: `Request already ${r.status}`,
        ipAddress: ip,
        userAgent: ua,
        requestPath: request.nextUrl.pathname,
        requestMethod: "PATCH",
      });
      return NextResponse.json({ success: false, error: `Request already ${r.status}` }, { status: 400 });
    }

    if (action === "REJECT") {
      await sql`
        UPDATE merchant_wallet_credit_requests
        SET status = 'REJECTED',
            reviewed_by_system_user_id = ${access.systemUserId},
            reviewed_by_email = ${access.agentEmail},
            reviewed_by_name = ${access.agentName},
            reviewed_at = NOW(),
            review_note = ${reviewNote || null},
            updated_at = NOW()
        WHERE id = ${reqId}
      `;

      await logActionByAuth(user.id, user.email, "MERCHANT", "REQUEST_REJECT", {
        resourceType: "MERCHANT_WALLET_CREDIT_REQUEST",
        resourceId: String(reqId),
        previousValues: { status: "PENDING" },
        newValues: {
          status: "REJECTED",
          review_note: reviewNote || null,
          merchant_store_id: storeId,
          direction: r.direction,
          amount: Number(r.amount),
          reviewed_by: access.agentEmail,
        },
        ipAddress: ip,
        userAgent: ua,
        requestPath: request.nextUrl.pathname,
        requestMethod: "PATCH",
        actionStatus: "SUCCESS",
      });

      return NextResponse.json({ success: true, status: "REJECTED" });
    }

    // APPROVE: execute the wallet operation
    const walletId = Number(r.wallet_id);
    const amount = Number(r.amount);
    const direction = String(r.direction);
    const category = String(r.category) as string;
    const idempotencyKey = `mwcr_${reqId}`;
    const description = `${direction === "CREDIT" ? "Manual credit" : "Manual debit"}: ${r.reason} (request #${reqId})`;

    let ledgerId: number;
    try {
      if (direction === "CREDIT") {
        const [result] = await sql`
          SELECT merchant_wallet_credit(
            ${walletId}, ${amount}, ${category}::wallet_transaction_category,
            'AVAILABLE'::wallet_balance_type,
            'ADMIN'::wallet_reference_type,
            ${reqId}, ${idempotencyKey}, ${description},
            ${JSON.stringify({ wallet_credit_request_id: reqId, approved_by: access.agentEmail })}::jsonb
          ) AS ledger_id
        `;
        ledgerId = Number((result as any).ledger_id);
      } else {
        const [result] = await sql`
          SELECT merchant_wallet_debit(
            ${walletId}, ${amount}, ${category}::wallet_transaction_category,
            'AVAILABLE'::wallet_balance_type,
            'ADMIN'::wallet_reference_type,
            ${reqId}, ${idempotencyKey}, ${description},
            ${JSON.stringify({ wallet_credit_request_id: reqId, approved_by: access.agentEmail })}::jsonb
          ) AS ledger_id
        `;
        ledgerId = Number((result as any).ledger_id);
      }
    } catch (walletErr: any) {
      await sql`
        UPDATE merchant_wallet_credit_requests
        SET review_note = ${'Wallet operation failed: ' + (walletErr?.message ?? 'Unknown error')},
            updated_at = NOW()
        WHERE id = ${reqId}
      `;

      await logActionByAuth(user.id, user.email, "MERCHANT", "REQUEST_APPROVE", {
        resourceType: "MERCHANT_WALLET_CREDIT_REQUEST",
        resourceId: String(reqId),
        previousValues: { status: "PENDING", direction: r.direction, amount: Number(r.amount) },
        actionStatus: "FAILED",
        errorMessage: walletErr?.message,
        ipAddress: ip,
        userAgent: ua,
        requestPath: request.nextUrl.pathname,
        requestMethod: "PATCH",
      });

      return NextResponse.json({
        success: false,
        error: `Wallet operation failed: ${walletErr?.message ?? "Unknown error"}`,
      }, { status: 500 });
    }

    await sql`
      UPDATE merchant_wallet_credit_requests
      SET status = 'APPROVED',
          reviewed_by_system_user_id = ${access.systemUserId},
          reviewed_by_email = ${access.agentEmail},
          reviewed_by_name = ${access.agentName},
          reviewed_at = NOW(),
          review_note = ${reviewNote || null},
          approved_ledger_id = ${ledgerId},
          updated_at = NOW()
      WHERE id = ${reqId}
    `;

    await logActionByAuth(user.id, user.email, "MERCHANT", "REQUEST_APPROVE", {
      resourceType: "MERCHANT_WALLET_CREDIT_REQUEST",
      resourceId: String(reqId),
      previousValues: { status: "PENDING" },
      newValues: {
        status: "APPROVED",
        ledger_id: ledgerId,
        merchant_store_id: storeId,
        direction,
        amount,
        review_note: reviewNote || null,
        reviewed_by: access.agentEmail,
      },
      ipAddress: ip,
      userAgent: ua,
      requestPath: request.nextUrl.pathname,
      requestMethod: "PATCH",
      actionStatus: "SUCCESS",
    });

    return NextResponse.json({ success: true, status: "APPROVED", ledger_id: ledgerId });
  } catch (e) {
    console.error("[PATCH wallet-requests/[requestId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
