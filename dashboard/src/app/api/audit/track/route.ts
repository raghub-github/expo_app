import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logActionByAuth, getIpAddress, getUserAgent } from "@/lib/audit/logger";
import { logActivity } from "@/lib/auth/activity-tracker";
import { getSystemUserByAuthId, getSystemUserByEmail } from "@/lib/auth/user-mapping";
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
  if (lower.includes("/order")) return "ORDER";
  if (lower.includes("/ticket")) return "TICKET";
  if (lower.includes("/offer")) return "OFFER";
  if (lower.includes("/area-manager")) return "AREA_MANAGER";
  if (lower.includes("/payment")) return "PAYMENT";
  if (lower.includes("/analytics")) return "ANALYTICS";
  return "SYSTEM";
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session || !session.user.email) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const requestPath = body.requestPath || body.path || request.nextUrl.pathname;
    const requestMethod = body.requestMethod || body.method || "GET";
    const dashboardType: DashboardType =
      body.dashboardType || resolveDashboardType(requestPath);
    const actionType: ActionType =
      body.actionType || methodToActionType(requestMethod);

    await logActionByAuth(session.user.id, session.user.email, dashboardType, actionType, {
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      actionDetails: {
        eventType: body.eventType,
        ...body.actionDetails,
      },
      ipAddress: getIpAddress(request),
      userAgent: getUserAgent(request),
      requestPath,
      requestMethod,
      actionStatus: body.actionStatus || "SUCCESS",
      errorMessage: body.errorMessage,
    });

    // Use getSystemUserByEmail with caching (getSystemUserByAuthId returns null currently)
    const systemUser = await getSystemUserByEmail(session.user.email);

    if (systemUser) {
      await logActivity({
        system_user_id: systemUser.id,
        access_type: body.eventType || (requestPath.startsWith("/api/") ? "API_CALL" : "PAGE_VIEW"),
        page_name: requestPath.startsWith("/api/") ? undefined : requestPath,
        api_endpoint: requestPath.startsWith("/api/") ? requestPath : undefined,
        http_method: requestMethod,
        action_performed: actionType,
        action_result: body.actionStatus || "SUCCESS",
        ip_address: getIpAddress(request),
        device_info: getUserAgent(request),
        request_params: body,
      });
    }

    return NextResponse.json({ success: true });
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
