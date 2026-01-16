/**
 * Action Audit Logging Utility
 * 
 * Logs all actions performed by agents for audit and compliance purposes.
 * This utility should be called for every significant action in the system.
 */

import { getDb } from "../db/client";
import { actionAuditLog } from "../db/schema";
import { getSystemUserByEmail } from "../db/operations/users";
import type { DashboardType, ActionType, ActionStatus } from "../db/schema";

export interface ActionAuditData {
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
  actionStatus?: ActionStatus;
  errorMessage?: string;
}

/**
 * Log an action to the audit log
 * This function should be called for every significant action in the system.
 * 
 * @param data - Action audit data
 * @returns Promise<number> - ID of the created audit log entry
 */
export async function logAction(data: ActionAuditData): Promise<number | null> {
  try {
    const db = getDb();
    
    const result = await db
      .insert(actionAuditLog)
      .values({
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
      })
      .returning({ id: actionAuditLog.id });

    return result[0]?.id || null;
  } catch (error) {
    // Don't throw errors - audit logging should never break the main flow
    console.error("[logAction] Error logging action:", error);
    return null;
  }
}

/**
 * Log an action from a request context
 * Extracts agent information from session and request context
 * 
 * @param email - Agent email from session
 * @param dashboardType - Dashboard where action occurred
 * @param actionType - Type of action
 * @param options - Additional options
 * @returns Promise<number | null> - ID of the created audit log entry
 */
export async function logActionFromRequest(
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
    actionStatus?: ActionStatus;
    errorMessage?: string;
  } = {}
): Promise<number | null> {
  try {
    // Get agent information
    const agent = await getSystemUserByEmail(email);
    if (!agent) {
      console.warn("[logActionFromRequest] Agent not found for email:", email);
      return null;
    }

    return logAction({
      agentId: agent.id,
      agentEmail: email,
      agentName: agent.fullName,
      agentRole: agent.primaryRole,
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
    console.error("[logActionFromRequest] Error logging action:", error);
    return null;
  }
}

/**
 * Log a successful action
 */
export async function logSuccessAction(
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
): Promise<number | null> {
  return logActionFromRequest(email, dashboardType, actionType, {
    ...options,
    actionStatus: "SUCCESS",
  });
}

/**
 * Log a failed action
 */
export async function logFailedAction(
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
): Promise<number | null> {
  return logActionFromRequest(email, dashboardType, actionType, {
    ...options,
    actionStatus: "FAILED",
    errorMessage,
  });
}
