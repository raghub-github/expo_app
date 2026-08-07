import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { NextRequest, NextResponse } from "next/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import {
  createOrderCxNotification,
  listOrderCxNotifications,
} from "@/lib/db/operations/order-cx-notifications";
import { stampOrderRoutedTo } from "@/lib/orders/stamp-order-routed-to";
import { backendFetch } from "@/lib/notif-backend";

export const runtime = "nodejs";

function parseOrderId(param: string | undefined): number | null {
  if (!param) return null;
  const id = Number(param);
  return Number.isFinite(id) ? id : null;
}

async function assertOrderAccess(userId: string, email: string) {
  return (
    (await isSuperAdmin(userId, email)) ||
    (await hasDashboardAccessByAuth(userId, email, "ORDER_FOOD"))
  );
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

    const auth = await getAuthenticatedApiUser(_request);
    if (!auth.ok) {
      return authFailureResponse(auth);
    }
    const { user } = auth;

    const allowed = await assertOrderAccess(user.id, user.email ?? "");
    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient permissions. Access to Orders dashboard required.",
        },
        { status: 403 }
      );
    }

    const notifications = await listOrderCxNotifications(orderId);

    return NextResponse.json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    console.error("[GET /api/orders/[orderId]/notifications] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Send Cx notification via backend NotificationService (queue + FCM).
 * Body: { templateCode, overrideTitle?, overrideBody?, customMessage? }
 * Legacy: { message } → treated as ADMIN_CX_CUSTOM.
 */
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

    const allowed = await assertOrderAccess(user.id, user.email ?? "");
    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient permissions. Access to Orders dashboard required.",
        },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const templateCode = String(body.templateCode ?? body.template_code ?? "").trim();
    const customMessage = (body.customMessage ?? body.message ?? "").toString().trim();
    const overrideTitle =
      body.overrideTitle != null ? String(body.overrideTitle).trim() : "";
    const overrideBody =
      body.overrideBody != null ? String(body.overrideBody).trim() : "";

    if (!templateCode && !customMessage) {
      return NextResponse.json(
        { success: false, error: "Select a notification template or enter a custom message" },
        { status: 400 }
      );
    }

    const systemUser = await getSystemUserByEmail(user.email ?? "");
    const { status, body: backendBody } = await backendFetch(
      `/v1/admin/orders/${orderId}/notifications/send`,
      {
        method: "POST",
        body: JSON.stringify({
          templateCode: templateCode || "ADMIN_CX_CUSTOM",
          overrideTitle: overrideTitle || undefined,
          overrideBody: overrideBody || undefined,
          customMessage: customMessage || undefined,
          sentByEmail: user.email ?? null,
          sentByName: systemUser?.full_name ?? user.email ?? null,
          sentByRole: systemUser?.primary_role ?? "AGENT",
        }),
      }
    );

    const payload = (backendBody ?? {}) as Record<string, unknown>;
    if (status >= 400 || payload.ok === false) {
      // Fallback: still record agent history locally if backend unreachable,
      // but never pretend a push was delivered when backend failed.
      if (status === 503 && customMessage) {
        const created = await createOrderCxNotification({
          orderId,
          message: customMessage,
          sentByEmail: user.email ?? null,
          sentByName: systemUser?.full_name ?? user.email ?? null,
          sentByRole: systemUser?.primary_role ?? "AGENT",
          notificationMetadata: {
            channel: "dashboard_manual_local_only",
            backend_unreachable: true,
          },
        });
        return NextResponse.json(
          {
            success: false,
            error:
              "Backend push service unreachable. Saved to history only — customer was not notified.",
            data: created,
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error:
            (typeof payload.message === "string" && payload.message) ||
            (typeof payload.error === "string" && payload.error) ||
            "Failed to send notification",
          details: payload,
        },
        { status: status >= 400 ? status : 502 }
      );
    }

    const title = typeof payload.title === "string" ? payload.title : "Notification";
    const bodyText = typeof payload.body === "string" ? payload.body : customMessage;
    const historyMessage = `${title}: ${bodyText}`.slice(0, 2000);
    const historyId =
      typeof payload.history_id === "number"
        ? payload.history_id
        : Number(payload.history_id) || null;

    const stamp = await stampOrderRoutedTo({
      orderId,
      systemUserId: systemUser?.id ?? null,
      actorEmail: user.email ?? null,
      actorName: systemUser?.full_name ?? user.email ?? null,
      actorRole: systemUser?.primary_role ?? "AGENT",
      action: "cx_notification",
      actionRefTable: "order_cx_agent_notifications",
      actionRefId: historyId,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: historyId,
        orderId,
        message: historyMessage,
        sentByEmail: user.email ?? null,
        sentByName: systemUser?.full_name ?? user.email ?? null,
        sentByRole: systemUser?.primary_role ?? "AGENT",
        sentAt: new Date().toISOString(),
        notificationMetadata: {
          channel: "dashboard_manual_push",
          template_code: templateCode || "ADMIN_CX_CUSTOM",
          title,
          body: bodyText,
          notification_ids: payload.notification_ids ?? [],
          backend_driven: true,
        },
      },
      queued: payload.queued,
      customer_id: payload.customer_id,
      order_id: payload.order_id,
      warning: payload.warning ?? null,
      routedToEmail: stamp.routedToEmail ?? user.email ?? null,
      routedToName: systemUser?.full_name ?? user.email ?? null,
    });
  } catch (error) {
    console.error("[POST /api/orders/[orderId]/notifications] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
