/**
 * Action Audit Logging Utility
 * 
 * This module provides functions to log all actions performed by agents
 * to the action_audit_log table for audit and compliance purposes.
 */

import { getDb } from "../db/client";
import { actionAuditLog } from "../db/schema";
import { getSystemUserByEmail, getSystemUserByAuthId } from "../auth/user-mapping";
import type { DashboardType, ActionType } from "../db/schema";

export interface ActionLogData {
  agentId: number;
  agentEmail: string;
  agentName?: string;
  agentRole?: string;
  dashboardType: DashboardType;
  actionType: ActionType;
  resourceType?: string;
  resourceId?: string;
  actionDetails?: Record<string, any>;
  previousValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  requestPath?: string;
  requestMethod?: string;
  actionStatus?: "SUCCESS" | "FAILED" | "PENDING";
  errorMessage?: string;
}

/**
 * Log an action to the audit log
 */
export async function logAction(data: ActionLogData): Promise<void> {
  const db = getDb();
  
  try {
    await db.insert(actionAuditLog).values({
      agentId: data.agentId,
      agentEmail: data.agentEmail,
      agentName: data.agentName,
      agentRole: data.agentRole,
      dashboardType: data.dashboardType,
      actionType: data.actionType,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      actionDetails: data.actionDetails || {},
      previousValues: data.previousValues,
      newValues: data.newValues,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      requestPath: data.requestPath,
      requestMethod: data.requestMethod,
      actionStatus: data.actionStatus || "SUCCESS",
      errorMessage: data.errorMessage,
      createdAt: new Date(),
    });
  } catch (error) {
    // Don't throw - audit logging should never break the main flow
    console.error("Error logging action to audit log:", error);
  }
}

/**
 * Log an action using Supabase auth credentials
 * Convenience function that gets system user info first
 */
export async function logActionByAuth(
  supabaseAuthId: string,
  email: string,
  dashboardType: DashboardType,
  actionType: ActionType,
  options: {
    resourceType?: string;
    resourceId?: string;
    actionDetails?: Record<string, any>;
    previousValues?: Record<string, any>;
    newValues?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    requestPath?: string;
    requestMethod?: string;
    actionStatus?: "SUCCESS" | "FAILED" | "PENDING";
    errorMessage?: string;
  } = {}
): Promise<void> {
  try {
    // Get system user
    let systemUser = await getSystemUserByAuthId(supabaseAuthId);
    if (!systemUser) {
      systemUser = await getSystemUserByEmail(email);
    }

    if (!systemUser) {
      console.warn("Cannot log action: system user not found", { email, supabaseAuthId });
      return;
    }

    const agentName =
      (systemUser as any).fullName ??
      (systemUser as any).full_name ??
      (systemUser as any).fullName;
    const agentRole =
      (systemUser as any).primaryRole ??
      (systemUser as any).primary_role ??
      (systemUser as any).primaryRole;

    await logAction({
      agentId: systemUser.id,
      agentEmail: email,
      agentName,
      agentRole,
      dashboardType,
      actionType,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      actionDetails: options.actionDetails,
      previousValues: options.previousValues,
      newValues: options.newValues,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      requestPath: options.requestPath,
      requestMethod: options.requestMethod,
      actionStatus: options.actionStatus || "SUCCESS",
      errorMessage: options.errorMessage,
    });
  } catch (error) {
    console.error("Error logging action by auth:", error);
  }
}

/**
 * Log a successful action
 */
export async function logSuccessAction(
  supabaseAuthId: string,
  email: string,
  dashboardType: DashboardType,
  actionType: ActionType,
  options: {
    resourceType?: string;
    resourceId?: string;
    actionDetails?: Record<string, any>;
    previousValues?: Record<string, any>;
    newValues?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    requestPath?: string;
    requestMethod?: string;
  } = {}
): Promise<void> {
  await logActionByAuth(supabaseAuthId, email, dashboardType, actionType, {
    ...options,
    actionStatus: "SUCCESS",
  });
}

/**
 * Log a failed action
 */
export async function logFailedAction(
  supabaseAuthId: string,
  email: string,
  dashboardType: DashboardType,
  actionType: ActionType,
  errorMessage: string,
  options: {
    resourceType?: string;
    resourceId?: string;
    actionDetails?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    requestPath?: string;
    requestMethod?: string;
  } = {}
): Promise<void> {
  await logActionByAuth(supabaseAuthId, email, dashboardType, actionType, {
    ...options,
    actionStatus: "FAILED",
    errorMessage,
  });
}

/**
 * Extract IP address from NextRequest
 */
export function getIpAddress(request: Request): string | undefined {
  // Try various headers that might contain the IP
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }
  
  return undefined;
}

/**
 * Extract user agent from NextRequest
 */
export function getUserAgent(request: Request): string | undefined {
  return request.headers.get("user-agent") || undefined;
}
