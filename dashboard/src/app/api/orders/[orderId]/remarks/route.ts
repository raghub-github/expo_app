import { NextRequest, NextResponse } from "next/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { createOrderRemark, listOrderRemarks } from "@/lib/db/operations/order-remarks";
import { stampOrderRoutedTo } from "@/lib/orders/stamp-order-routed-to";

export const runtime = "nodejs";

function parseOrderId(param: string | undefined): number | null {
  if (!param) return null;
  const id = Number(param);
  return Number.isFinite(id) ? id : null;
}

export async function GET(
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

    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) {
      return authFailureResponse(auth);
    }
    const { user } = auth;

    const allowed =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_FOOD")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_PERSON_RIDE"));

    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient permissions. Access to Orders dashboard required.",
        },
        { status: 403 }
      );
    }

    const remarks = await listOrderRemarks(orderId);

    return NextResponse.json({
      success: true,
      data: remarks,
    });
  } catch (error) {
    console.error("[GET /api/orders/[orderId]/remarks] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
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

    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) {
      return authFailureResponse(auth);
    }
    const { user } = auth;

    const allowed =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_FOOD")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_PERSON_RIDE"));

    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient permissions. Access to Orders dashboard required.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const rawRemark: string = (body.remark ?? "").toString();
    const remarkCategory: string | null =
      typeof body.remarkCategory === "string" && body.remarkCategory.trim()
        ? body.remarkCategory.trim()
        : null;
    const remarkPriority: string | null =
      typeof body.remarkPriority === "string" && body.remarkPriority.trim()
        ? body.remarkPriority.trim()
        : "normal";
    const isInternal: boolean | undefined =
      typeof body.isInternal === "boolean" ? body.isInternal : undefined;

    const remark = rawRemark.trim();
    if (!remark) {
      return NextResponse.json(
        { success: false, error: "Remark text is required" },
        { status: 400 }
      );
    }

    const systemUser = await getSystemUserByEmail(user.email);
    const actorId = systemUser?.id ?? null;
    const actorName = systemUser?.full_name?.trim() || user.email || null;
    const actorType = systemUser?.primary_role ?? "AGENT";

    const created = await createOrderRemark({
      orderId,
      actorType,
      actorId,
      actorName,
      remark,
      remarkCategory,
      remarkPriority,
      isInternal,
      visibleTo: null,
      remarkMetadata: {
        ...(body.remarkMetadata ?? {}),
        actorEmail: user.email ?? null,
      },
    });

    await stampOrderRoutedTo({
      orderId,
      systemUserId: actorId,
      actorEmail: user.email ?? null,
      actorName,
      actorRole: actorType,
      action: "remark",
      actionRefTable: "order_remarks",
      actionRefId: created?.id ?? null,
      metadata: { remarkCategory, remarkPriority },
    });

    return NextResponse.json({
      success: true,
      data: created,
      routedToEmail: user.email ?? null,
      routedToName: actorName,
    });
  } catch (error) {
    console.error("[POST /api/orders/[orderId]/remarks] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

