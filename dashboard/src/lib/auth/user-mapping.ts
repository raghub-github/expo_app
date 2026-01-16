/**
 * User Mapping: Supabase Auth Users <-> System Users
 * 
 * This module handles the mapping between Supabase Auth users (auth.users)
 * and our custom system_users table for authorization.
 * 
 * Mapping Strategy:
 * - Email is used as the primary link (system_users.email = auth.users.email)
 * - Supabase auth user ID (UUID) can be stored in system_users for direct lookup
 * - Fallback: Use email if UUID mapping doesn't exist
 */

import { getDb } from "../db/client";
import { eq, and, isNull, sql } from "drizzle-orm";
import { systemUsers } from "../db/schema";

export interface SystemUser {
  id: number;
  system_user_id: string;
  email: string;
  mobile: string;
  full_name: string;
  primary_role: string;
  status: string;
  supabase_auth_id?: string; // Supabase auth.users.id (UUID)
}

/**
 * Find system user by Supabase auth user ID (UUID)
 * Note: Currently uses email matching since supabase_auth_id column may not exist
 */
export async function getSystemUserByAuthId(
  supabaseAuthId: string
): Promise<SystemUser | null> {
  // For now, we need to get the email from Supabase Auth first
  // This function will be enhanced when supabase_auth_id column is added
  // For now, return null and let getSystemUserByEmail handle it
  return null;
}

/**
 * Find system user by email
 * This is the primary mapping method
 */
export async function getSystemUserByEmail(
  email: string
): Promise<SystemUser | null> {
  try {
    console.log("[getSystemUserByEmail] ===== START ===== Email:", email);
    const db = getDb();
    console.log("[getSystemUserByEmail] Database connection obtained");

    const normalizedEmail = email.toLowerCase().trim();
    console.log("[getSystemUserByEmail] Normalized email:", normalizedEmail);
    
    // Try exact match first (emails in DB should be lowercase)
    console.log("[getSystemUserByEmail] Attempting exact match query...");
    let result = await db
      .select({
        id: systemUsers.id,
        system_user_id: systemUsers.systemUserId,
        email: systemUsers.email,
        mobile: systemUsers.mobile,
        full_name: systemUsers.fullName,
        primary_role: systemUsers.primaryRole,
        status: systemUsers.status,
      })
      .from(systemUsers)
      .where(eq(systemUsers.email, normalizedEmail))
      .limit(1);
    
    console.log("[getSystemUserByEmail] Exact match result count:", result.length);
    
    // If no result, try case-insensitive match
    if (result.length === 0) {
      console.log("[getSystemUserByEmail] Exact match failed, trying case-insensitive SQL query...");
      result = await db
        .select({
          id: systemUsers.id,
          system_user_id: systemUsers.systemUserId,
          email: systemUsers.email,
          mobile: systemUsers.mobile,
          full_name: systemUsers.fullName,
          primary_role: systemUsers.primaryRole,
          status: systemUsers.status,
        })
        .from(systemUsers)
        .where(sql`LOWER(TRIM(${systemUsers.email})) = LOWER(TRIM(${normalizedEmail}))`)
        .limit(1);
      console.log("[getSystemUserByEmail] Case-insensitive result count:", result.length);
    }

    if (result.length > 0) {
      const user = result[0];
      console.log("[getSystemUserByEmail] ===== SUCCESS ===== Found user:", { 
        id: user.id, 
        email: user.email, 
        role: user.primary_role, 
        status: user.status 
      });
      return {
        id: user.id,
        system_user_id: user.system_user_id,
        email: user.email,
        mobile: user.mobile,
        full_name: user.full_name,
        primary_role: user.primary_role,
        status: user.status,
      };
    } else {
      console.log("[getSystemUserByEmail] ===== NOT FOUND ===== No user found for email:", normalizedEmail);
      return null;
    }
  } catch (error) {
    console.error("[getSystemUserByEmail] ===== ERROR ===== Error fetching system user by email:", error);
    if (error instanceof Error) {
      console.error("[getSystemUserByEmail] Error message:", error.message);
      console.error("[getSystemUserByEmail] Error stack:", error.stack);
      
      // Check if it's a database connection error
      const isConnectionError = 
        error.message.includes('CONNECT_TIMEOUT') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('Failed query');
      
      if (isConnectionError) {
        // Re-throw connection errors so they can be handled differently
        throw new Error(`Database connection error: ${error.message}`);
      }
    }
    // For other errors, return null (user not found)
    return null;
  }
}

/**
 * Create or link Supabase auth user to system user
 */
export async function linkAuthUserToSystemUser(
  supabaseAuthId: string,
  email: string
): Promise<SystemUser | null> {
  const db = getDb();

  try {
    // 1. Try to find existing system user by email
    let systemUser = await getSystemUserByEmail(email);

    if (systemUser) {
      // 2. Update with Supabase auth ID if column exists
      // await db.update(systemUsers).set({ supabase_auth_id: supabaseAuthId }).where(eq(systemUsers.id, systemUser.id));
      return systemUser;
    }

    // 3. If no system user exists, this might be a customer/rider/merchant
    // They should be created through their respective onboarding flows
    // For dashboard users, they must be pre-created by Super Admin
    
    return null;
  } catch (error) {
    console.error("Error linking auth user to system user:", error);
    return null;
  }
}

/**
 * Check if user account is active and approved
 */
export async function isUserAccountActive(
  systemUserId: number
): Promise<boolean> {
  const db = getDb();

  try {
    const result = await db
      .select({
        status: systemUsers.status,
        deletedAt: systemUsers.deletedAt,
        accountLockedUntil: systemUsers.accountLockedUntil,
      })
      .from(systemUsers)
      .where(eq(systemUsers.id, systemUserId))
      .limit(1);

    if (result.length === 0) {
      return false;
    }

    const user = result[0];

    // Check if status is ACTIVE
    if (user.status !== "ACTIVE") {
      return false;
    }

    // Check if account is deleted
    if (user.deletedAt !== null) {
      return false;
    }

    // Check if account is locked
    if (user.accountLockedUntil !== null) {
      const now = new Date();
      const lockedUntil = new Date(user.accountLockedUntil);
      if (lockedUntil > now) {
        return false; // Still locked
      }
    }

    return true;
  } catch (error) {
    console.error("Error checking user account status:", error);
    return false;
  }
}
