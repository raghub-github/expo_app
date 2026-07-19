/**
 * GET /api/orders/[orderId]/refunds – list refunds for an order.
 * POST /api/orders/[orderId]/refunds – create a refund record.
 * POST requires ORDER_REFUND + ORDER_CANCEL access.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canRefundOrder } from "@/lib/permissions/actions";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { createOrderRefund, listOrderRefunds, type RefundTypeDb } from "@/lib/db/operations/order-refunds";
import {
  loadOrderRefundGuardState,
  evaluateRefundGuard,
  type RefundGuardAction,
} from "@/lib/db/operations/order-refund-guard";
import { recordOrderCancellation } from "@/lib/db/operations/orders-core";
import { getSql } from "@/lib/db/client";
import {
  executeOrderCancellationFinancials,
  executePartialRefundFinancials,
  lookupOrderContext,
} from "@/lib/financial-rule-executor";
import { refundFieldsFromEngineResult, resolvePaymentCancellationMilestone } from "@gatimitra/financial-rules";
import { dashboardCancellationFromCatalog } from "@/lib/orders/merchant-cancellation-fields";
import { resolveCancellationCatalogForOrder } from "@/lib/db/operations/order-cancellation-reason-catalog";
import { applyRiderCancellationPenalty } from "@/lib/orders/apply-rider-cancellation-penalty";
import { applyMerchantOrderCancellationLedger } from "@/lib/orders/apply-merchant-cancellation-debit";

export const runtime = "nodejs";

function parseOrderId(param: string | undefined): number | null {
  if (!param) return null;
  const id = Number(param);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function maybeApplyMerchantCancellationDebit(args: {
  orderId: number;
  merchantDebit: unknown;
  partialAmount?: number | null;
  actorSystemUserId: number | null;
}) {
  const partialAmount =
    typeof args.partialAmount === "number" && Number.isFinite(args.partialAmount)
      ? args.partialAmount
      : Number(args.partialAmount);
  return applyMerchantOrderCancellationLedger({
    orderCoreId: args.orderId,
    merchantDebit: typeof args.merchantDebit === "string" ? args.merchantDebit : null,
    partialAmount: Number.isFinite(partialAmount) && partialAmount > 0 ? partialAmount : null,
    actorSystemUserId: args.actorSystemUserId,
    source: "order_refund",
  });
}

/**
 * Extract actor identity + client fingerprint from the Next.js request so the
 * backend refund executor can stamp it onto the audit trail. Headers may be
 * absent (curl / server-side calls) — we don't fail; we just pass null.
 */
function actorContextFromRequest(
  request: NextRequest,
  systemUser: { id?: number | null; primaryRole?: string | null; fullName?: string | null; email?: string | null } | null,
  user: { email?: string | null } | null
): {
  actorSystemUserId: number | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  actorIp: string | null;
  actorUserAgent: string | null;
} {
  // X-Forwarded-For may include multiple hops — take the first (client).
  const xff = request.headers.get("x-forwarded-for") ?? "";
  const ip = xff.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
  const ua = request.headers.get("user-agent") || null;
  return {
    actorSystemUserId: systemUser?.id != null ? Number(systemUser.id) : null,
    actorEmail: (user?.email ?? systemUser?.email ?? null) || null,
    actorName: systemUser?.fullName ?? null,
    actorRole: systemUser?.primaryRole ?? null,
    actorIp: ip,
    actorUserAgent: ua,
  };
}

/**
 * Fire-and-observe: call the backend refund executor with the freshly-inserted
 * order_refunds.id. Executor routes the refund to Razorpay / customer wallet /
 * COD-noop and stamps execution_status + actor snapshot onto the row.
 *
 * We DON'T fail the whole request if the executor fails — the refund row is
 * already saved (audit trail intact) and ops can re-run via the internal
 * endpoint. But we return the executor result inline so the dashboard UI
 * can render "Refund processing on Razorpay" vs "Refunded to wallet".
 */
async function executeOrderRefundOnBackend(args: {
  orderId: number;
  refundId: number;
  refundAmount: number;
  refundReason: string;
  actor: ReturnType<typeof actorContextFromRequest>;
}): Promise<{
  ok: boolean;
  status?: string;
  route?: string;
  razorpayRefundId?: string | null;
  customerWalletLedgerId?: number | null;
  error?: string;
} | null> {
  const base =
    process.env.BACKEND_INTERNAL_URL?.trim() ||
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    "";
  const secret = process.env.INTERNAL_API_TOKEN;
  if (!base || !secret) {
    // Surface exact env-var state so the next line in the container logs
    // tells ops which var to set.
    console.warn(
      "[order-refund] executor NOT called — env missing:",
      JSON.stringify({
        BACKEND_INTERNAL_URL: Boolean(process.env.BACKEND_INTERNAL_URL),
        BACKEND_URL: Boolean(process.env.BACKEND_URL),
        NEXT_PUBLIC_BACKEND_URL: Boolean(process.env.NEXT_PUBLIC_BACKEND_URL),
        INTERNAL_API_TOKEN: Boolean(process.env.INTERNAL_API_TOKEN),
      })
    );
    return null;
  }
  const url = `${base.replace(/\/+$/, "")}/v1/internal/orders/${args.orderId}/refund/execute`;
  try {
    const upstream = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": secret,
      },
      body: JSON.stringify({
        refundId: args.refundId,
        refundAmount: args.refundAmount,
        refundReason: args.refundReason,
        actor: args.actor,
      }),
    });
    const data = (await upstream.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: {
        status?: string;
        route?: string;
        razorpayRefundId?: string | null;
        customerWalletLedgerId?: number | null;
        failureReason?: string;
      };
      error?: string;
    };
    if (!upstream.ok) {
      // Full context for debugging in Docker/CloudWatch — includes upstream
      // status + error body so we don't have to spelunk backend logs.
      console.error("[order-refund] executor upstream failed:", {
        url,
        upstreamStatus: upstream.status,
        upstreamError: data.error,
        refundId: args.refundId,
        orderId: args.orderId,
      });
      return { ok: false, error: data.error ?? `executor_${upstream.status}` };
    }
    const r = data.result ?? {};
    return {
      ok: Boolean(data.ok),
      status: r.status,
      route: r.route,
      razorpayRefundId: r.razorpayRefundId ?? null,
      customerWalletLedgerId: r.customerWalletLedgerId ?? null,
      error: r.failureReason,
    };
  } catch (e) {
    console.error("[order-refund] executor unreachable:", {
      url,
      refundId: args.refundId,
      orderId: args.orderId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: e instanceof Error ? e.message : "executor_unreachable" };
  }
}

async function maybeApplyRiderCancellationPenalty(args: {
  orderId: number;
  catalogRow: { id: number; attribute: string };
  fault: unknown;
  cancellationReasonId: number | null;
  actorSystemUserId: number | null;
  penaltyRiderId?: number | null;
}) {
  const fault = typeof args.fault === "string" ? args.fault.trim().toLowerCase() : "";
  if (fault !== "3pl_fault" && fault !== "3pl") return null;

  const sql = getSql();
  let riderId =
    typeof args.penaltyRiderId === "number" && Number.isFinite(args.penaltyRiderId) && args.penaltyRiderId > 0
      ? args.penaltyRiderId
      : NaN;

  if (!Number.isFinite(riderId) || riderId <= 0) {
    const riderRows = await sql.unsafe<{ rider_id: number | null }[]>(
      `SELECT rider_id FROM orders_core WHERE id = $1 LIMIT 1`,
      [args.orderId]
    );
    riderId = Number(riderRows[0]?.rider_id);
  }

  if (!Number.isFinite(riderId) || riderId <= 0) return null;

  return applyRiderCancellationPenalty({
    orderCoreId: args.orderId,
    riderId,
    catalogReasonId: args.catalogRow.id,
    attribute: args.catalogRow.attribute,
    fault: fault === "3pl" ? "3pl_fault" : fault || "3pl_fault",
    cancellationReasonId: args.cancellationReasonId,
    actorSystemUserId: args.actorSystemUserId,
    source: "order_refund",
  });
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
        { success: false, error: "Insufficient permissions to view order refunds." },
        { status: 403 }
      );
    }

    const refunds = await listOrderRefunds(orderId);
    return NextResponse.json({ success: true, data: refunds });
  } catch (error) {
    console.error("[GET /api/orders/[orderId]/refunds] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list refunds",
      },
      { status: 500 }
    );
  }
}

function toRefundTypeDb(
  refundType: string
): RefundTypeDb {
  switch (refundType) {
    case "refund_with_cancellation":
      return "full";
    case "refund_without_cancellation":
      return "partial";
    default:
      return "partial";
  }
}

export async function POST(
  request: NextRequest,
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

    const canRefund = await canRefundOrder(
      user.id,
      user.email ?? "",
      "ORDER_FOOD"
    );
    if (!canRefund) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient permissions. Refund and cancellation access required.",
        },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const refundType = body?.refundType as string | undefined;
    const refundReason = body?.refundReason as string | undefined;
    const refundDescription = body?.refundDescription as string | undefined;
    const refundAmount = typeof body?.refundAmount === "number" ? body.refundAmount : Number(body?.refundAmount);
    const mxDebitAmount = typeof body?.mxDebitAmount === "number" ? body.mxDebitAmount : Number(body?.mxDebitAmount) || 0;
    const mxDebitReason = body?.mxDebitReason as string | undefined;
    const refundMetadata = (body?.refundMetadata ?? {}) as Record<string, unknown>;

    const attribute =
      typeof body?.attribute === "string" ? body.attribute.trim().toUpperCase() : "";
    const rejection =
      typeof body?.rejection === "string" ? body.rejection.trim() : "";
    const catalogReasonId =
      typeof body?.catalogReasonId === "number"
        ? body.catalogReasonId
        : Number(body?.catalogReasonId);

    const catalogRow = await resolveCancellationCatalogForOrder({
      catalogReasonId: Number.isFinite(catalogReasonId) ? catalogReasonId : null,
      attribute: attribute || null,
      rejection: rejection || null,
    });

    if (!catalogRow) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid cancellation reason. Select attribute and rejection option from catalog.",
        },
        { status: 400 }
      );
    }

    const refundReasonResolved =
      refundReason?.trim() || `${catalogRow.attribute} - ${catalogRow.label}`;

    const merchantCancel = dashboardCancellationFromCatalog({
      attribute: catalogRow.attribute,
      label: catalogRow.label,
      reasonCode: catalogRow.reasonCode,
      catalogReasonId: catalogRow.id,
      refundReasonFallback: refundReasonResolved,
    });

    if (!refundType || !refundReasonResolved) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing or invalid: refundType or refundReason",
        },
        { status: 400 }
      );
    }

    // ── Money-safety guard ────────────────────────────────────────────────
    // Block double-cancellation and double / over-cap refunds BEFORE any
    // ledger row is written. This is the authoritative check (the UI mirrors
    // it but can be bypassed). Returns 409 with a human-readable reason that
    // the modal surfaces as a toast.
    const guardState = await loadOrderRefundGuardState(orderId);
    const guardAmount =
      refundType === "cancel_without_refund"
        ? 0
        : Number.isFinite(refundAmount)
          ? refundAmount
          : 0;
    const guard = evaluateRefundGuard(
      guardState,
      refundType as RefundGuardAction,
      guardAmount
    );
    if (!guard.ok) {
      return NextResponse.json(
        {
          success: false,
          error: guard.message,
          code: guard.code,
          guard: {
            isCancelled: guardState.isCancelled,
            alreadyRefunded: guardState.alreadyRefunded,
            grandTotal: guardState.grandTotal,
            remainingRefundable: guardState.remainingRefundable,
            fullyRefunded: guardState.fullyRefunded,
          },
        },
        { status: 409 }
      );
    }

    const cancellationMetadata = {
      catalogReasonId: catalogRow.id,
      attribute: catalogRow.attribute,
      rejection: catalogRow.label,
      reasonCode: catalogRow.reasonCode,
      fault: body?.fault,
      merchantDebit: body?.merchantDebit,
      penaltyRiderId: body?.penaltyRiderId,
    };

    const penaltyRiderId =
      typeof body?.penaltyRiderId === "number"
        ? body.penaltyRiderId
        : Number(body?.penaltyRiderId);

    // "cancel_without_refund" does not create a refund row; only update orders_core with cancellation (refundAmount not required)
    if (refundType === "cancel_without_refund") {
      const systemUser = await getSystemUserByEmail(user.email ?? "");
      const cancelledBy = systemUser?.primaryRole ?? "admin";
      const cancelledById = systemUser?.id ?? null;
      const reasonCode = catalogRow.reasonCode.slice(0, 200);
      const reasonText = (refundDescription ?? catalogRow.label).trim().slice(0, 2000) || null;

      const orderCtx = await lookupOrderContext(orderId);
      const { orderMilestone } = resolvePaymentCancellationMilestone({
        previousStatus: orderCtx.orderStatus,
        cancelledByType: "admin",
      });
      const engineResult = await executeOrderCancellationFinancials({
        orderCoreId: orderId,
        ordersFoodId: orderCtx.ordersFoodId ?? orderId,
        coreOrderId: orderCtx.coreOrderId,
        merchantStoreId: orderCtx.merchantStoreId,
        previousStatus: orderCtx.orderStatus,
        cancelledByType: cancelledBy,
        orderGross: orderCtx.grandTotal,
        serviceType: orderCtx.serviceType,
        cancellationReasonId: catalogRow.id,
        actorSystemUserId: cancelledById,
      });

      const cancellation = await recordOrderCancellation({
        orderId,
        cancelledBy,
        cancelledById,
        reasonCode,
        reasonText,
        refundStatus: engineResult.applied
          ? refundFieldsFromEngineResult(engineResult.raw).refundStatus
          : "no_refund",
        metadata: {
          ...cancellationMetadata,
          financial_rule_engine: engineResult.raw ?? null,
          engine_applied: engineResult.applied,
        },
        catalogReasonId: catalogRow.id,
        cancelledByType: "admin",
        cancelledByLabel: merchantCancel.cancelledByLabel,
        displayReason: merchantCancel.displayReason,
        attribute: catalogRow.attribute,
        rejectionLabel: catalogRow.label,
        actionSource: "admin",
        cancelMode: "manual",
        cancellationDetails: merchantCancel.cancellationDetails,
      });
      const riderPenalty = await maybeApplyRiderCancellationPenalty({
        orderId,
        catalogRow,
        fault: body?.fault,
        cancellationReasonId: cancellation.cancellationReasonId,
        actorSystemUserId: cancelledById,
        penaltyRiderId: Number.isFinite(penaltyRiderId) ? penaltyRiderId : null,
      });
      const merchantWalletDebit = await maybeApplyMerchantCancellationDebit({
        orderId,
        merchantDebit: body?.merchantDebit,
        partialAmount:
          body?.merchantDebit === "partial_debit"
            ? mxDebitAmount > 0
              ? mxDebitAmount
              : null
            : null,
        actorSystemUserId: cancelledById,
      });
      return NextResponse.json({
        success: true,
        data: {
          action: "cancel_without_refund",
          refundId: null,
          engine: engineResult.raw ?? null,
          engine_applied: engineResult.applied,
          riderPenalty,
          merchantWalletDebit,
        },
        message: "Order cancelled via Financial Rule Engine (no refund row).",
      });
    }

    if (typeof refundAmount !== "number" || !Number.isFinite(refundAmount)) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing or invalid: refundAmount (required for refund types).",
        },
        { status: 400 }
      );
    }
    if (refundAmount <= 0) {
      return NextResponse.json(
        { success: false, error: "refundAmount must be greater than 0" },
        { status: 400 }
      );
    }

    const systemUser = await getSystemUserByEmail(user.email ?? "");
    const refundInitiatedById = systemUser?.id ?? null;
    const refundInitiatedBy = systemUser?.primaryRole ?? "agent";

    const orderCtx = await lookupOrderContext(orderId);
    const { orderMilestone } = resolvePaymentCancellationMilestone({
      previousStatus: orderCtx.orderStatus,
      cancelledByType: "admin",
      wasDelivered: refundType === "refund_with_cancellation",
    });
    const engineResult = await executePartialRefundFinancials({
      orderCoreId: orderId,
      ordersFoodId: orderCtx.ordersFoodId,
      coreOrderId: orderCtx.coreOrderId,
      orderStage: orderMilestone,
      triggeredBy: refundInitiatedBy,
      orderGross: orderCtx.grandTotal,
      refundAmount,
      cancellationReasonId: catalogRow.id,
      actorSystemUserId: refundInitiatedById,
      postDelivery: refundType === "refund_with_cancellation",
      metadata: {
        refundItems: refundMetadata.refundItems,
        refundTypeUI: refundType,
      },
    });

    const resolvedMxDebitAmount =
      typeof body?.mxDebitAmount === "number" && Number.isFinite(body.mxDebitAmount)
        ? body.mxDebitAmount
        : mxDebitAmount;

    const record = await createOrderRefund({
      orderId,
      orderPaymentId: null,
      refundType: toRefundTypeDb(refundType),
      refundReason: refundReasonResolved,
      refundDescription: refundDescription?.trim() ?? null,
      refundAmount,
      refundFee: 0,
      netRefundAmount: refundAmount,
      productType: "order",
      mxDebitAmount: resolvedMxDebitAmount > 0 ? resolvedMxDebitAmount : 0,
      mxDebitReason: mxDebitReason?.trim() ?? null,
      refundInitiatedBy,
      refundInitiatedById,
      refundMetadata: {
        ...refundMetadata,
        ...cancellationMetadata,
        refundTypeUI: refundType,
        financial_rule_engine: engineResult.raw ?? null,
        engine_applied: engineResult.applied,
      },
    });

    // When refund type is refund_with_cancellation, create cancellation reason and update orders_core
    if (refundType === "refund_with_cancellation") {
      const reasonCode = catalogRow.reasonCode.slice(0, 200);
      const reasonText = (refundDescription ?? catalogRow.label).trim().slice(0, 2000) || null;
      const cancellation = await recordOrderCancellation({
        orderId,
        cancelledBy: refundInitiatedBy,
        cancelledById: refundInitiatedById,
        reasonCode,
        reasonText,
        refundStatus: "completed",
        refundAmount,
        metadata: cancellationMetadata,
        catalogReasonId: catalogRow.id,
        cancelledByType: "admin",
        cancelledByLabel: merchantCancel.cancelledByLabel,
        displayReason: merchantCancel.displayReason,
        attribute: catalogRow.attribute,
        rejectionLabel: catalogRow.label,
        actionSource: "admin",
        cancelMode: "manual",
        cancellationDetails: merchantCancel.cancellationDetails,
      });
      const riderPenalty = await maybeApplyRiderCancellationPenalty({
        orderId,
        catalogRow,
        fault: body?.fault,
        cancellationReasonId: cancellation.cancellationReasonId,
        actorSystemUserId: refundInitiatedById,
        penaltyRiderId: Number.isFinite(penaltyRiderId) ? penaltyRiderId : null,
      });
      const merchantWalletDebit = await maybeApplyMerchantCancellationDebit({
        orderId,
        merchantDebit: body?.merchantDebit,
        partialAmount:
          body?.merchantDebit === "partial_debit"
            ? resolvedMxDebitAmount > 0
              ? resolvedMxDebitAmount
              : null
            : null,
        actorSystemUserId: refundInitiatedById,
      });
      // Execute the money movement (Razorpay / customer wallet / COD-noop).
      // Actor identity + IP + user-agent get captured on the audit row by
      // the executor. Failure here does NOT roll back the refund row — ops
      // can re-run via /v1/internal/orders/:id/refund/execute.
      const actorForExecutor = actorContextFromRequest(request, systemUser, user);
      const executor = await executeOrderRefundOnBackend({
        orderId,
        refundId: Number(record.id),
        refundAmount,
        refundReason: refundReasonResolved,
        actor: actorForExecutor,
      });

      return NextResponse.json({
        success: true,
        data: { ...record, riderPenalty, merchantWalletDebit, executor },
        message: "Refund created successfully.",
      });
    }

    const merchantWalletDebit = await maybeApplyMerchantCancellationDebit({
      orderId,
      merchantDebit: body?.merchantDebit,
      partialAmount:
        body?.merchantDebit === "partial_debit"
          ? resolvedMxDebitAmount > 0
            ? resolvedMxDebitAmount
            : null
          : null,
      actorSystemUserId: refundInitiatedById,
    });

    // Execute the money movement — see executor comment above.
    const actorForExecutor = actorContextFromRequest(request, systemUser, user);
    const executor = await executeOrderRefundOnBackend({
      orderId,
      refundId: Number(record.id),
      refundAmount,
      refundReason: refundReasonResolved,
      actor: actorForExecutor,
    });

    return NextResponse.json({
      success: true,
      data: { ...record, merchantWalletDebit, executor },
      message: "Refund created successfully.",
    });
  } catch (error) {
    console.error("[POST /api/orders/[orderId]/refunds] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create refund",
      },
      { status: 500 }
    );
  }
}
