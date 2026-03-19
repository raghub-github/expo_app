/**
 * Activity Tracking Service
 * Tracks all user actions for audit and monitoring
 */

import { getDb } from "../db/client";
import { sql } from "drizzle-orm";

export interface ActivityLog {
  system_user_id: number;
  access_type: string;
  page_name?: string;
  api_endpoint?: string;
  http_method?: string;
  action_performed: string;
  action_result: string;
  ip_address?: string;
  device_info?: string;
  session_id?: number;
  request_params?: any;
  response_data?: any;
  entity_type?: string;
  entity_id?: string;
}

/**
 * Log activity to database
 * Note: This assumes access_activity_logs table exists in the database
 * If not, we'll log to console as fallback
 */
export async function logActivity(data: ActivityLog) {
  try {
    const { getSql } = await import("../db/client");
    const sql = getSql();
    
    // access_activity_logs table (0017) has: id, system_user_id, access_type, page_name, api_endpoint,
    // http_method, action_performed, action_result, ip_address, device_info, session_id,
    // response_time_ms, request_params, response_data, created_at. No entity_type/entity_id.
    const requestPayload =
      data.request_params != null
        ? typeof data.request_params === "object" && !Array.isArray(data.request_params)
          ? { ...data.request_params, ...(data.entity_type != null && { entity_type: data.entity_type }), ...(data.entity_id != null && { entity_id: data.entity_id }) }
          : data.request_params
        : (data.entity_type != null || data.entity_id != null)
          ? { entity_type: data.entity_type ?? null, entity_id: data.entity_id ?? null }
          : null;
    const requestParamsStr =
      requestPayload != null
        ? (() => {
            try {
              return JSON.stringify(requestPayload);
            } catch {
              return null;
            }
          })()
        : null;
    const responseDataStr =
      data.response_data != null
        ? (() => {
            try {
              return typeof data.response_data === "string" ? data.response_data : JSON.stringify(data.response_data);
            } catch {
              return null;
            }
          })()
        : null;

    await sql`
      INSERT INTO access_activity_logs (
        system_user_id,
        access_type,
        page_name,
        api_endpoint,
        http_method,
        action_performed,
        action_result,
        ip_address,
        device_info,
        session_id,
        request_params,
        response_data
      ) VALUES (
        ${data.system_user_id},
        ${data.access_type},
        ${data.page_name || null},
        ${data.api_endpoint || null},
        ${data.http_method || null},
        ${data.action_performed},
        ${data.action_result},
        ${data.ip_address || null},
        ${data.device_info || null},
        ${data.session_id || null},
        ${requestParamsStr ?? "{}"},
        ${responseDataStr ?? "{}"}
      )
    `;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[Activity Log] DB insert failed (table may be missing):", (error as Error)?.message ?? error);
    }
  }
}

/**
 * Log page visit
 */
export async function logPageVisit(
  userId: number,
  pagePath: string,
  sessionId?: number,
  ipAddress?: string
) {
  await logActivity({
    system_user_id: userId,
    access_type: "PAGE_VISIT",
    page_name: pagePath,
    action_performed: "VIEW",
    action_result: "SUCCESS",
    session_id: sessionId,
    ip_address: ipAddress,
  });
}

/**
 * Log API call
 */
export async function logAPICall(
  userId: number,
  endpoint: string,
  method: string,
  success: boolean,
  params?: any,
  responseData?: any,
  ipAddress?: string
) {
  await logActivity({
    system_user_id: userId,
    access_type: "API_CALL",
    api_endpoint: endpoint,
    http_method: method,
    action_performed: method,
    action_result: success ? "SUCCESS" : "FAILED",
    request_params: params,
    response_data: responseData,
    ip_address: ipAddress,
  });
}

/**
 * Log user action (create, update, delete)
 */
export async function logUserAction(
  userId: number,
  action: string,
  entityType: string,
  entityId: string,
  success: boolean,
  details?: any,
  ipAddress?: string
) {
  await logActivity({
    system_user_id: userId,
    access_type: "USER_ACTION",
    action_performed: action,
    action_result: success ? "SUCCESS" : "FAILED",
    entity_type: entityType,
    entity_id: entityId,
    request_params: details,
    ip_address: ipAddress,
  });
}

/**
 * Log permission change
 */
export async function logPermissionChange(
  userId: number,
  targetUserId: number,
  changeType: string,
  details: any,
  ipAddress?: string
) {
  await logActivity({
    system_user_id: userId,
    access_type: "PERMISSION_CHANGE",
    action_performed: changeType,
    action_result: "SUCCESS",
    entity_type: "USER",
    entity_id: targetUserId.toString(),
    request_params: details,
    ip_address: ipAddress,
  });
}
