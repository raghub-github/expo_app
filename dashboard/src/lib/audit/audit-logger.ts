/**
 * Audit Logger Service
 * Logs all system changes for audit and compliance
 */

import { getSql } from "../db/client";

export interface AuditLog {
  system_user_id?: number;
  system_user_name?: string;
  module_name: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  old_data?: any;
  new_data?: any;
  changed_fields?: string[];
  ip_address?: string;
  role_at_time?: string;
}

/**
 * Log audit event to database
 */
export async function logAuditEvent(data: AuditLog) {
  try {
    const sql = getSql();
    
    await sql`
      INSERT INTO system_audit_logs (
        system_user_id,
        system_user_name,
        module_name,
        action_type,
        entity_type,
        entity_id,
        old_data,
        new_data,
        changed_fields,
        ip_address,
        role_at_time,
        created_at
      ) VALUES (
        ${data.system_user_id || null},
        ${data.system_user_name || null},
        ${data.module_name},
        ${data.action_type},
        ${data.entity_type},
        ${data.entity_id},
        ${data.old_data ? JSON.stringify(data.old_data) : null},
        ${data.new_data ? JSON.stringify(data.new_data) : null},
        ${data.changed_fields ? JSON.stringify(data.changed_fields) : null},
        ${data.ip_address || null},
        ${data.role_at_time || null},
        NOW()
      )
    `;
  } catch (error) {
    // Fallback to console logging if table doesn't exist
    console.log("[Audit Log]", {
      timestamp: new Date().toISOString(),
      ...data,
    });
  }
}

/**
 * Log user creation
 */
export async function logUserCreation(
  userId: number,
  createdUserId: number,
  userData: any,
  ipAddress?: string
) {
  const { getSystemUserById } = await import("../db/operations/users");
  const user = await getSystemUserById(userId);
  
  await logAuditEvent({
    system_user_id: userId,
    system_user_name: user?.fullName,
    role_at_time: user?.primaryRole,
    module_name: "USERS",
    action_type: "CREATE",
    entity_type: "USER",
    entity_id: createdUserId.toString(),
    new_data: userData,
    ip_address: ipAddress,
  });
}

/**
 * Log user update
 */
export async function logUserUpdate(
  userId: number,
  updatedUserId: number,
  oldData: any,
  newData: any,
  changedFields: string[],
  ipAddress?: string
) {
  const { getSystemUserById } = await import("../db/operations/users");
  const user = await getSystemUserById(userId);
  
  await logAuditEvent({
    system_user_id: userId,
    system_user_name: user?.fullName,
    role_at_time: user?.primaryRole,
    module_name: "USERS",
    action_type: "UPDATE",
    entity_type: "USER",
    entity_id: updatedUserId.toString(),
    old_data: oldData,
    new_data: newData,
    changed_fields: changedFields,
    ip_address: ipAddress,
  });
}

/**
 * Log user deletion
 */
export async function logUserDeletion(
  userId: number,
  deletedUserId: number,
  ipAddress?: string
) {
  const { getSystemUserById } = await import("../db/operations/users");
  const user = await getSystemUserById(userId);
  
  await logAuditEvent({
    system_user_id: userId,
    system_user_name: user?.fullName,
    role_at_time: user?.primaryRole,
    module_name: "USERS",
    action_type: "DELETE",
    entity_type: "USER",
    entity_id: deletedUserId.toString(),
    ip_address: ipAddress,
  });
}

/**
 * Log user activation
 */
export async function logUserActivation(
  userId: number,
  activatedUserId: number,
  ipAddress?: string
) {
  const { getSystemUserById } = await import("../db/operations/users");
  const user = await getSystemUserById(userId);
  
  await logAuditEvent({
    system_user_id: userId,
    system_user_name: user?.fullName,
    role_at_time: user?.primaryRole,
    module_name: "USERS",
    action_type: "ACTIVATE",
    entity_type: "USER",
    entity_id: activatedUserId.toString(),
    ip_address: ipAddress,
  });
}

/**
 * Log user deactivation
 */
export async function logUserDeactivation(
  userId: number,
  deactivatedUserId: number,
  reason?: string,
  ipAddress?: string
) {
  const { getSystemUserById } = await import("../db/operations/users");
  const user = await getSystemUserById(userId);
  
  await logAuditEvent({
    system_user_id: userId,
    system_user_name: user?.fullName,
    role_at_time: user?.primaryRole,
    module_name: "USERS",
    action_type: "DEACTIVATE",
    entity_type: "USER",
    entity_id: deactivatedUserId.toString(),
    new_data: { reason },
    ip_address: ipAddress,
  });
}
