/**
 * Action Tracking Middleware
 * 
 * Wrapper utilities to automatically log actions to audit log
 */

import { NextRequest } from "next/server";
import { logActionByAuth, getIpAddress, getUserAgent } from "./logger";
import type { DashboardType, ActionType } from "../db/schema";

export interface ActionContext {
  resourceType?: string;
  resourceId?: string;
  actionDetails?: Record<string, any>;
  previousValues?: Record<string, any>;
  newValues?: Record<string, any>;
}

/**
 * Wrap an API route handler to automatically log actions
 * 
 * Usage:
 * ```typescript
 * export async function POST(request: NextRequest) {
 *   return withAuditLog(request, "ORDER", "CREATE", async (session) => {
 *     // Your handler logic here
 *     return NextResponse.json({ success: true });
 *   });
 * }
 * ```
 */
export async function withAuditLog<T>(
  request: NextRequest,
  dashboardType: DashboardType,
  actionType: ActionType,
  handler: (session: { userId: string; email: string }, context: ActionContext) => Promise<T>,
  context: ActionContext = {}
): Promise<T> {
  const { createServerSupabaseClient } = await import("../supabase/server");
  const supabase = await createServerSupabaseClient();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session || !session.user.email) {
    throw new Error("Not authenticated");
  }

  const startTime = Date.now();
  let actionStatus: "SUCCESS" | "FAILED" = "SUCCESS";
  let errorMessage: string | undefined;

  try {
    // Execute handler
    const result = await handler(
      { userId: session.user.id, email: session.user.email },
      context
    );

    // Log success
    await logActionByAuth(
      session.user.id,
      session.user.email,
      dashboardType,
      actionType,
      {
        ...context,
        ipAddress: getIpAddress(request),
        userAgent: getUserAgent(request),
        requestPath: request.nextUrl.pathname,
        requestMethod: request.method,
        actionStatus: "SUCCESS",
      }
    );

    return result;
  } catch (error) {
    actionStatus = "FAILED";
    errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Log failure
    await logActionByAuth(
      session.user.id,
      session.user.email,
      dashboardType,
      actionType,
      {
        ...context,
        ipAddress: getIpAddress(request),
        userAgent: getUserAgent(request),
        requestPath: request.nextUrl.pathname,
        requestMethod: request.method,
        actionStatus: "FAILED",
        errorMessage,
      }
    );

    throw error;
  }
}

/**
 * Extract action context from request body
 * Helper to build context object from common request patterns
 */
export function extractActionContext(
  body: any,
  resourceIdField: string = "id"
): ActionContext {
  return {
    resourceType: body.resourceType || body.type,
    resourceId: body[resourceIdField] || body.id,
    actionDetails: body,
  };
}

/**
 * Create context with before/after values for updates
 */
export function createUpdateContext(
  previousValues: Record<string, any>,
  newValues: Record<string, any>,
  resourceId?: string,
  resourceType?: string
): ActionContext {
  return {
    resourceType,
    resourceId,
    previousValues,
    newValues,
    actionDetails: {
      changedFields: Object.keys(newValues).filter(
        (key) => previousValues[key] !== newValues[key]
      ),
    },
  };
}
