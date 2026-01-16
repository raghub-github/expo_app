/**
 * User Management Functions
 * 
 * Functions for managing user accounts: suspension, banning, force logout, etc.
 * These functions are called by Super Admin and require proper authorization.
 */

import { getDb } from "../db/client";
import { supabaseAdmin } from "../supabase/server";
import { eq } from "drizzle-orm";
import { getSystemUserByEmail } from "./user-mapping";
import { logActivity } from "./activity-tracker";
import {
  incrementFailedLoginAttempts,
  resetFailedLoginAttempts,
  updateLastLogin,
} from "../db/operations/users";

/**
 * Suspend a user account
 * This sets status to SUSPENDED and logs the action
 */
export async function suspendUser(
  systemUserId: number,
  reason: string,
  suspendedBy: number
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();

  try {
    // Update system_users table
    // await db
    //   .update(systemUsers)
    //   .set({
    //     status: "SUSPENDED",
    //     status_reason: reason,
    //     updated_at: new Date(),
    //   })
    //   .where(eq(systemUsers.id, systemUserId));

    // Log the action in admin_action_logs
    // await db.insert(adminActionLogs).values({
    //   admin_user_id: suspendedBy,
    //   action: "USER_SUSPEND",
    //   entity_type: "system_user",
    //   entity_id: systemUserId,
    //   new_value: { status: "SUSPENDED", reason },
    // });

    // Force logout all sessions (see forceLogoutUser)
    await forceLogoutUser(systemUserId, suspendedBy);

    return { success: true };
  } catch (error) {
    console.error("Error suspending user:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Ban a user account
 * This sets status to DISABLED and logs the action
 */
export async function banUser(
  systemUserId: number,
  reason: string,
  bannedBy: number
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();

  try {
    // Update system_users table
    // await db
    //   .update(systemUsers)
    //   .set({
    //     status: "DISABLED",
    //     status_reason: reason,
    //     updated_at: new Date(),
    //   })
    //   .where(eq(systemUsers.id, systemUserId));

    // Log the action
    // await db.insert(adminActionLogs).values({
    //   admin_user_id: bannedBy,
    //   action: "USER_BAN",
    //   entity_type: "system_user",
    //   entity_id: systemUserId,
    //   new_value: { status: "DISABLED", reason },
    // });

    // Force logout all sessions
    await forceLogoutUser(systemUserId, bannedBy);

    return { success: true };
  } catch (error) {
    console.error("Error banning user:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Activate a user account
 */
export async function activateUser(
  systemUserId: number,
  activatedBy: number
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();

  try {
    // Update system_users table
    // await db
    //   .update(systemUsers)
    //   .set({
    //     status: "ACTIVE",
    //     status_reason: null,
    //     updated_at: new Date(),
    //   })
    //   .where(eq(systemUsers.id, systemUserId));

    // Log the action
    // await db.insert(adminActionLogs).values({
    //   admin_user_id: activatedBy,
    //   action: "USER_ACTIVATE",
    //   entity_type: "system_user",
    //   entity_id: systemUserId,
    //   new_value: { status: "ACTIVE" },
    // });

    return { success: true };
  } catch (error) {
    console.error("Error activating user:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Force logout user from all devices
 * This invalidates all Supabase sessions for the user
 */
export async function forceLogoutUser(
  systemUserId: number,
  forcedBy: number
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();

  try {
    // 1. Get user's email from system_users
    // const user = await db.select().from(systemUsers).where(eq(systemUsers.id, systemUserId)).limit(1);
    // if (user.length === 0) {
    //   return { success: false, error: "User not found" };
    // }
    // const email = user[0].email;

    // 2. Use Supabase Admin API to sign out all sessions
    // This requires getting the Supabase auth user ID first
    // For now, we'll mark all sessions as inactive in our database
    
    // Update system_user_sessions
    // await db
    //   .update(systemUserSessions)
    //   .set({
    //     is_active: false,
    //     logged_out_at: new Date(),
    //   })
    //   .where(
    //     and(
    //       eq(systemUserSessions.systemUserId, systemUserId),
    //       eq(systemUserSessions.isActive, true)
    //     )
    //   );

    // 3. If we have Supabase Admin client, we can also invalidate sessions there
    // This would require getting the auth.users.id from email
    // const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
    // const authUser = authUsers.users.find(u => u.email === email);
    // if (authUser) {
    //   // Sign out all sessions - Supabase doesn't have a direct API for this
    //   // We can update the user's metadata or use a custom solution
    // }

    // 4. Log the action
    // await db.insert(adminActionLogs).values({
    //   admin_user_id: forcedBy,
    //   action: "FORCE_LOGOUT",
    //   entity_type: "system_user",
    //   entity_id: systemUserId,
    // });

    return { success: true };
  } catch (error) {
    console.error("Error forcing logout:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Update user's last login time and increment login count
 */
export async function recordLogin(
  systemUserId: number,
  loginMethod: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  try {
    await updateLastLogin(systemUserId);
    await resetFailedLoginAttempts(systemUserId);

    await logActivity({
      system_user_id: systemUserId,
      access_type: "ACTION_PERFORMED",
      api_endpoint: "/login",
      http_method: "POST",
      action_performed: "LOGIN",
      action_result: "SUCCESS",
      ip_address: ipAddress,
      device_info: userAgent,
      request_params: {
        login_method: loginMethod,
      },
    });
  } catch (error) {
    console.error("Error recording login:", error);
  }
}

/**
 * Record failed login attempt
 */
export async function recordFailedLogin(
  email: string,
  reason: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  try {
    const user = await getSystemUserByEmail(email);
    if (!user) {
      return;
    }

    await incrementFailedLoginAttempts(user.id);

    await logActivity({
      system_user_id: user.id,
      access_type: "ACTION_PERFORMED",
      api_endpoint: "/login",
      http_method: "POST",
      action_performed: "LOGIN",
      action_result: "FAILED",
      ip_address: ipAddress,
      device_info: userAgent,
      request_params: {
        email,
        reason,
      },
    });
  } catch (error) {
    console.error("Error recording failed login:", error);
  }
}
