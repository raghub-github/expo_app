/**
 * User Validation: Check if user exists in system_users and has active roles
 * 
 * This module ensures that only valid users with proper roles can access the dashboard.
 * Users must:
 * 1. Exist in system_users table
 * 2. Have ACTIVE status
 * 3. Have a role assigned (either primary_role in system_users OR entries in user_roles table)
 */

import { getSystemUserByEmailStrict } from "./user-mapping";
import { getSql } from "../db/client";

export interface UserValidationResult {
  isValid: boolean;
  error?: string;
  systemUserId?: number;
  email?: string;
  hasRoles?: boolean;
  primaryRole?: string;
  /**
   * True when validation could not be completed (DB unreachable, timeout, pool
   * error) — the user was NOT judged unauthorized. Callers must answer 503 and
   * must never sign the user out or record a failed login for it.
   */
  transient?: boolean;
}

/**
 * Validate that a user exists in system_users and has active roles
 */
export async function validateUserForLogin(
  email: string
): Promise<UserValidationResult> {
  try {
    console.log("[validateUserForLogin] ===== START ===== Email:", email);

    // 1. Check if user exists in system_users
    let systemUser: Awaited<ReturnType<typeof getSystemUserByEmailStrict>>;
    try {
      systemUser = await getSystemUserByEmailStrict(email);
    } catch (dbError: unknown) {
      // Any failure to READ the user is "could not verify", never "not authorized".
      console.error(
        "[validateUserForLogin] ===== DATABASE ERROR ===== lookup failed:",
        dbError instanceof Error ? dbError.message : dbError
      );
      return {
        isValid: false,
        transient: true,
        error: "Unable to verify your account due to a database connection issue. Please try again in a moment.",
        email,
      };
    }

    if (!systemUser) {
      console.log("[validateUserForLogin] ===== FAIL ===== User not found in system_users");
      return {
        isValid: false,
        error: "Your account is not registered in the system. Please contact an administrator to create your account.",
        email,
      };
    }

    console.log("[validateUserForLogin] User found in system_users:", {
      id: systemUser.id,
      email: systemUser.email,
      status: systemUser.status,
      primary_role: systemUser.primary_role,
    });

    // 2. Check if user status is ACTIVE
    if (systemUser.status !== "ACTIVE") {
      console.log("[validateUserForLogin] ===== FAIL ===== User status is not ACTIVE:", systemUser.status);
      return {
        isValid: false,
        error: `Your account is ${systemUser.status.toLowerCase()}. Please contact an administrator to activate your account.`,
        systemUserId: systemUser.id,
        email: systemUser.email,
      };
    }

    // 3. Check if user has a role (either primary_role in system_users OR entries in user_roles table)
    // Users can have a primary_role directly in system_users, which is sufficient for login
    // OR they can have roles assigned in the user_roles table
    
    // First check: If user has a primary_role set, that's sufficient
    if (systemUser.primary_role && systemUser.primary_role.trim() !== '') {
      console.log("[validateUserForLogin] ===== SUCCESS ===== User has primary_role:", systemUser.primary_role);
      // User has a primary role, which is sufficient for login
      return {
        isValid: true,
        systemUserId: systemUser.id,
        email: systemUser.email,
        hasRoles: true,
        primaryRole: systemUser.primary_role,
      };
    }

    // Second check: Check if user has roles in user_roles table
    console.log("[validateUserForLogin] No primary_role found, checking user_roles table...");
    let roleCount = 0;
    try {
      const sql = getSql();
      const rolesResult = await sql`
        SELECT COUNT(*) as role_count
        FROM user_roles ur
        WHERE ur.system_user_id = ${systemUser.id}
          AND ur.is_active = true
          AND (ur.valid_until IS NULL OR ur.valid_until > NOW())
          AND ur.revoked_at IS NULL
      `;

      roleCount = Number(rolesResult[0]?.role_count || 0);
      console.log("[validateUserForLogin] Found role_count in user_roles table:", roleCount);
    } catch (rolesError: any) {
      // If querying user_roles fails, but user has primary_role, we should still allow login
      // But if no primary_role, we need to know if they have roles
      console.error("[validateUserForLogin] Error querying user_roles table:", rolesError);
      
      // A failed query is "could not verify". Treating it as "no roles" turned a
      // statement timeout into a hard denial (and a global sign-out).
      return {
        isValid: false,
        transient: true,
        error: "Unable to verify your roles due to a database connection issue. Please try again in a moment.",
        systemUserId: systemUser.id,
        email: systemUser.email,
      };
    }

    if (roleCount === 0) {
      console.log("[validateUserForLogin] ===== FAIL ===== User has no primary_role and no active roles in user_roles table");
      return {
        isValid: false,
        error: "Your account does not have any assigned roles. Please contact an administrator to assign you a role.",
        systemUserId: systemUser.id,
        email: systemUser.email,
        hasRoles: false,
      };
    }

    console.log("[validateUserForLogin] ===== SUCCESS ===== User validated with roles from user_roles table:", {
      systemUserId: systemUser.id,
      email: systemUser.email,
      roleCount,
    });

    return {
      isValid: true,
      systemUserId: systemUser.id,
      email: systemUser.email,
      hasRoles: true,
      primaryRole: systemUser.primary_role,
    };
  } catch (error) {
    console.error("[validateUserForLogin] ===== ERROR ===== Validation error:", error);
    return {
      isValid: false,
      transient: true,
      error: "An error occurred during account validation. Please try again later.",
      email,
    };
  }
}
