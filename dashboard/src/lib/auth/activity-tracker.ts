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
    
    // Try to insert into access_activity_logs table
    // If table doesn't exist, this will fail gracefully
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
        response_data,
        entity_type,
        entity_id,
        created_at
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
        ${data.request_params ? JSON.stringify(data.request_params) : null},
        ${data.response_data ? JSON.stringify(data.response_data) : null},
        ${data.entity_type || null},
        ${data.entity_id || null},
        NOW()
      )
    `;
  } catch (error) {
    // Fallback to console logging if table doesn't exist
    console.log("[Activity Log]", {
      timestamp: new Date().toISOString(),
      ...data,
    });
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
