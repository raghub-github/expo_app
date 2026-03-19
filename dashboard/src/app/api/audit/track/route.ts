import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logActionByAuth, getIpAddress, getUserAgent } from "@/lib/audit/logger";
import { logActivity } from "@/lib/auth/activity-tracker";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import type { DashboardType, ActionType } from "@/lib/db/schema";

export const runtime = "nodejs";

const methodToActionType = (method: string): ActionType => {
  switch (method.toUpperCase()) {
    case "POST":
      return "CREATE";
    case "PUT":
    case "PATCH":
      return "UPDATE";
    case "DELETE":
      return "DELETE";
    default:
      return "VIEW";
  }
};

const resolveDashboardType = (path?: string): DashboardType => {
  if (!path) return "SYSTEM";
  const lower = path.toLowerCase();
  if (lower.includes("/rider")) return "RIDER";
  if (lower.includes("/merchant")) return "MERCHANT";
  if (lower.includes("/customer")) return "CUSTOMER";
  if (lower.includes("/order")) return "ORDER_FOOD"; // Use ORDER_FOOD as default for orders
  if (lower.includes("/ticket")) return "TICKET";
  if (lower.includes("/offer")) return "OFFER";
  if (lower.includes("/area-manager")) return "AREA_MANAGER";
  if (lower.includes("/payment")) return "PAYMENT";
  if (lower.includes("/analytics")) return "ANALYTICS";
  return "SYSTEM";
};

/** Run audit logging in background so the HTTP response is never blocked. */
async function runAuditInBackground(payload: {
  userId: string;
  email: string;
  body: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
}) {
  try {
    const { userId, email, body, ipAddress, userAgent } = payload;
    const requestPath = (body.requestPath || body.path || "") as string;
    const requestMethod = (body.requestMethod || body.method || "GET") as string;
    const dashboardType: DashboardType =
      (body.dashboardType as DashboardType) || resolveDashboardType(requestPath);
    const actionType: ActionType =
      (body.actionType as ActionType) || methodToActionType(requestMethod);

    await logActionByAuth(userId, email, dashboardType, actionType, {
      resourceType: body.resourceType as string | undefined,
      resourceId: body.resourceId as string | undefined,
      actionDetails: {
        eventType: body.eventType,
        ...(body.actionDetails as object),
      },
      ipAddress,
      userAgent,
      requestPath,
      requestMethod,
      actionStatus: (body.actionStatus as "SUCCESS" | "FAILED") || "SUCCESS",
      errorMessage: body.errorMessage as string | undefined,
    });

    const systemUser = await getSystemUserByEmail(email);
    if (systemUser) {
      await logActivity({
        system_user_id: systemUser.id,
        access_type: (body.eventType as string) || (requestPath.startsWith("/api/") ? "API_CALL" : "PAGE_VIEW"),
        page_name: requestPath.startsWith("/api/") ? undefined : requestPath,
        api_endpoint: requestPath.startsWith("/api/") ? requestPath : undefined,
        http_method: requestMethod,
        action_performed: actionType,
        action_result: (body.actionStatus as string) || "SUCCESS",
        ip_address: ipAddress,
        device_info: userAgent,
        request_params: body,
      });
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[POST /api/audit/track] Background log error:", error);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user || !user.email) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const ipAddress = getIpAddress(request) ?? "";
    const userAgent = getUserAgent(request) ?? "";

    // Respond immediately so proxy/client never block on audit
    setImmediate(() => {
      void runAuditInBackground({
        userId: user.id,
        email: user.email!,
        body,
        ipAddress,
        userAgent,
      });
    });

    return NextResponse.json({ success: true }, { status: 202 });
  } catch (error) {
    console.error("[POST /api/audit/track] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
