/**
 * PATCH /api/merchant/stores/[id]/wallet-requests/[requestId]
 * Body: {
 *   action: "APPROVE" | "REJECT",
 *   review_note?: string,          // reject / internal note only
 *   ledger_remark?: string,        // REQUIRED on APPROVE — written to ledger description
 *   amount?: number,               // optional override of requested amount on APPROVE
 * }
 *
 * ONLY SUPER_ADMIN or ADMIN can approve/reject.
 * Wallet / ledger update ONLY on APPROVE (never on submit or reject).
 * Agent `reason` is never written to merchant_wallet_ledger.description.
 *
 * DELETE — remove a PENDING request from DB (requester or admin). No wallet impact.
 */
import { NextRequest, NextResponse } from "next/server";
import { authFailureResponse, getAuthenticatedApiUser } from "@/lib/auth/api-session";
import { resolveSystemUserForSupabaseAuth } from "@/lib/auth/user-mapping";
import { getMerchantAccess } from "@/lib/permissions/merchant-access";
import { logActionByAuth, getIpAddress, getUserAgent } from "@/lib/audit/logger";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

async function requireAuthedUser(request: NextRequest) {
  const auth = await getAuthenticatedApiUser(request);
  if (!auth.ok) return { ok: false as const, response: authFailureResponse(auth) };
  let email = (auth.user.email ?? "").trim();
  if (!email) {
    const mapped = await resolveSystemUserForSupabaseAuth(auth.user.id, undefined);
    email = (mapped?.email ?? "").trim();
  }
  if (!email) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 }),
    };
  }
  return { ok: true as const, user: { id: auth.user.id, email } };
}

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

    const authed = await requireAuthedUser(request);
    if (!authed.ok) return authed.response;
    const user = authed.user;

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
    const ledgerRemark = String(body.ledger_remark ?? body.ledgerRemark ?? "").trim();
    const amountOverrideRaw = body.amount ?? body.approved_amount ?? null;
    const amountOverride =
      amountOverrideRaw != null && String(amountOverrideRaw).trim() !== ""
        ? parseFloat(String(amountOverrideRaw))
        : null;

    if (!["APPROVE", "REJECT"].includes(action)) {
      return NextResponse.json({ success: false, error: "action must be APPROVE or REJECT" }, { status: 400 });
    }

    const sql = getSql();

    // Fetch the request (include metadata so linked Order ID reaches the ledger)
    const [req] = await sql`
      SELECT id, wallet_id, merchant_store_id, direction, amount, reason, category, status, metadata
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

    // APPROVE: execute the wallet operation — only path that touches wallet / ledger
    if (!ledgerRemark || ledgerRemark.length < 5) {
      return NextResponse.json(
        {
          success: false,
          error: "ledger_remark is required on approve (min 5 chars). Agent request reason is not used on the ledger.",
        },
        { status: 400 }
      );
    }

    const walletId = Number(r.wallet_id);
    const requestedAmount = Number(r.amount);
    const amount =
      amountOverride != null && Number.isFinite(amountOverride) && amountOverride > 0
        ? amountOverride
        : requestedAmount;
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ success: false, error: "amount must be positive" }, { status: 400 });
    }
    const direction = String(r.direction);
    const category = String(r.category) as string;
    const idempotencyKey = `mwcr_${reqId}`;
    // Ledger description = admin ledger_remark only — never agent `reason`.
    const description = ledgerRemark;

    const reqMeta =
      r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
        ? (r.metadata as Record<string, unknown>)
        : {};
    const linkedOrderRaw = reqMeta.order_id ?? reqMeta.orders_core_id ?? null;
    let linkedCoreOrderId: number | null = null;
    let linkedFormattedOrderId: string | null = null;
    if (linkedOrderRaw != null && String(linkedOrderRaw).trim() !== "") {
      const raw = String(linkedOrderRaw).trim().replace(/^#/, "");
      const asNum = parseInt(raw.replace(/\D/g, ""), 10);
      // Resolve public order id (GMF…) + orders_core PK for ledger display.
      const gmfCandidate = Number.isFinite(asNum) ? `GMF${asNum}` : raw.toUpperCase();
      const [coreHit] = await sql`
        SELECT id, order_id::text AS order_id, formatted_order_id
        FROM orders_core
        WHERE merchant_store_id = ${storeId}
          AND (
            id = ${Number.isFinite(asNum) ? asNum : -1}
            OR REPLACE(UPPER(COALESCE(formatted_order_id, '')), '#', '') = ${raw.toUpperCase()}
            OR REPLACE(UPPER(COALESCE(order_id, '')), '#', '') = ${raw.toUpperCase()}
            OR REPLACE(UPPER(COALESCE(formatted_order_id, '')), '#', '') = ${gmfCandidate}
          )
        ORDER BY
          CASE
            WHEN id = ${Number.isFinite(asNum) ? asNum : -1} THEN 0
            WHEN REPLACE(UPPER(COALESCE(formatted_order_id, '')), '#', '') = ${raw.toUpperCase()} THEN 1
            WHEN REPLACE(UPPER(COALESCE(formatted_order_id, '')), '#', '') = ${gmfCandidate} THEN 2
            ELSE 3
          END
        LIMIT 1
      `;
      if (coreHit) {
        linkedCoreOrderId = Number((coreHit as { id: number }).id);
        const fmt = String(
          (coreHit as { formatted_order_id?: string | null }).formatted_order_id ??
            (coreHit as { order_id?: string | null }).order_id ??
            ""
        )
          .trim()
          .replace(/^#/, "");
        linkedFormattedOrderId = fmt || null;
      } else if (Number.isFinite(asNum) && asNum > 0) {
        linkedCoreOrderId = asNum;
      }
    }

    const ledgerMetadata: Record<string, unknown> = {
      wallet_credit_request_id: reqId,
      approved_by: access.agentEmail,
      ledger_remark: ledgerRemark,
      agent_request_reason: String(r.reason ?? ""),
      requested_amount: requestedAmount,
      approved_amount: amount,
      ...(linkedCoreOrderId != null ? { orders_core_id: linkedCoreOrderId, order_id: linkedCoreOrderId } : {}),
      ...(linkedFormattedOrderId
        ? { formatted_order_id: linkedFormattedOrderId }
        : {}),
    };

    let ledgerId: number;
    try {
      if (direction === "CREDIT") {
        const [result] = await sql`
          SELECT merchant_wallet_credit(
            ${walletId}, ${amount}, ${category}::wallet_transaction_category,
            'AVAILABLE'::wallet_balance_type,
            'ADMIN'::wallet_reference_type,
            ${reqId}, ${idempotencyKey}, ${description},
            ${JSON.stringify(ledgerMetadata)}::jsonb
          ) AS ledger_id
        `;
        ledgerId = Number((result as { ledger_id: unknown }).ledger_id);
      } else {
        const [result] = await sql`
          SELECT merchant_wallet_debit(
            ${walletId}, ${amount}, ${category}::wallet_transaction_category,
            'AVAILABLE'::wallet_balance_type,
            'ADMIN'::wallet_reference_type,
            ${reqId}, ${idempotencyKey}, ${description},
            ${JSON.stringify(ledgerMetadata)}::jsonb
          ) AS ledger_id
        `;
        ledgerId = Number((result as { ledger_id: unknown }).ledger_id);
      }
      // merchant_wallet_ledger is append-only/immutable — never UPDATE after insert.
      // description + metadata (incl. order ids) are written only on INSERT via the RPC.
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
          metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
            ledger_remark: ledgerRemark,
            approved_amount: amount,
            agent_request_reason: String(r.reason ?? ""),
          })}::jsonb,
          updated_at = NOW()
      WHERE id = ${reqId}
    `;

    // Persist dedicated columns when migration 0637 has been applied.
    try {
      await sql`
        UPDATE merchant_wallet_credit_requests
        SET ledger_remark = ${ledgerRemark},
            approved_amount = ${amount}
        WHERE id = ${reqId}
      `;
    } catch {
      // Columns may not exist yet — metadata already holds the values.
    }

    await logActionByAuth(user.id, user.email, "MERCHANT", "REQUEST_APPROVE", {
      resourceType: "MERCHANT_WALLET_CREDIT_REQUEST",
      resourceId: String(reqId),
      previousValues: { status: "PENDING" },
      newValues: {
        status: "APPROVED",
        ledger_id: ledgerId,
        merchant_store_id: storeId,
        direction,
        requested_amount: requestedAmount,
        approved_amount: amount,
        ledger_remark: ledgerRemark,
        review_note: reviewNote || null,
        reviewed_by: access.agentEmail,
      },
      ipAddress: ip,
      userAgent: ua,
      requestPath: request.nextUrl.pathname,
      requestMethod: "PATCH",
      actionStatus: "SUCCESS",
    });

    return NextResponse.json({
      success: true,
      status: "APPROVED",
      ledger_id: ledgerId,
      approved_amount: amount,
      ledger_remark: ledgerRemark,
    });
  } catch (e) {
    console.error("[PATCH wallet-requests/[requestId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE a PENDING wallet adjustment request only.
 * Hard-deletes that single row — no wallet / ledger impact; other requests untouched.
 */
export async function DELETE(
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

    const authed = await requireAuthedUser(request);
    if (!authed.ok) return authed.response;
    const user = authed.user;

    const ip = getIpAddress(request);
    const ua = getUserAgent(request);

    const access = await getMerchantAccess(user.id, user.email);
    if (!access) {
      return NextResponse.json({ success: false, error: "Merchant access required" }, { status: 403 });
    }

    const sql = getSql();
    const [req] = await sql`
      SELECT id, status, direction, amount, reason,
             requested_by_system_user_id, requested_by_email, merchant_store_id
      FROM merchant_wallet_credit_requests
      WHERE id = ${reqId} AND merchant_store_id = ${storeId}
    `;
    if (!req) {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }
    const r = req as {
      id: number;
      status: string;
      direction: string;
      amount: number;
      reason: string;
      requested_by_system_user_id: number | null;
      requested_by_email: string | null;
    };

    if (String(r.status).toUpperCase() !== "PENDING") {
      return NextResponse.json(
        { success: false, error: "Only pending requests can be deleted" },
        { status: 400 }
      );
    }

    const isOwner =
      (r.requested_by_system_user_id != null &&
        Number(r.requested_by_system_user_id) === Number(access.systemUserId)) ||
      (r.requested_by_email &&
        access.agentEmail &&
        String(r.requested_by_email).toLowerCase() === String(access.agentEmail).toLowerCase());

    if (!access.isSuperAdmin && !access.isAdmin && !isOwner) {
      return NextResponse.json(
        { success: false, error: "You can only delete your own pending requests" },
        { status: 403 }
      );
    }

    // Delete exactly this pending row — never touch other requests.
    const deleted = await sql`
      DELETE FROM merchant_wallet_credit_requests
      WHERE id = ${reqId}
        AND merchant_store_id = ${storeId}
        AND status = 'PENDING'
      RETURNING id
    `;
    if (!deleted.length) {
      return NextResponse.json(
        { success: false, error: "Request could not be deleted (status may have changed)" },
        { status: 409 }
      );
    }

    await logActionByAuth(user.id, user.email, "MERCHANT", "DELETE", {
      resourceType: "MERCHANT_WALLET_CREDIT_REQUEST",
      resourceId: String(reqId),
      previousValues: {
        status: "PENDING",
        direction: r.direction,
        amount: Number(r.amount),
        reason: r.reason,
        merchant_store_id: storeId,
      },
      ipAddress: ip,
      userAgent: ua,
      requestPath: request.nextUrl.pathname,
      requestMethod: "DELETE",
      actionStatus: "SUCCESS",
    });

    return NextResponse.json({ success: true, deleted_id: reqId });
  } catch (e) {
    console.error("[DELETE wallet-requests/[requestId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
