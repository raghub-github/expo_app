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
// Request-level cache to avoid duplicate queries within the same request
const requestCache = new Map<string, { data: SystemUser | null; timestamp: number }>();
const CACHE_TTL = 1000; // 1 second cache per request

export async function getSystemUserByEmail(
  email: string | null | undefined
): Promise<SystemUser | null> {
  try {
    // Validate email parameter
    if (!email || typeof email !== 'string' || email.trim() === '') {
      return null;
    }

    const normalizedEmail = email.toLowerCase().trim();
    
    // Check request-level cache (only for same request cycle)
    const cacheKey = `email:${normalizedEmail}`;
    const cached = requestCache.get(cacheKey);
    const now = Date.now();
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      return cached.data;
    }

    const db = getDb();
    
    // Try exact match first (emails in DB should be lowercase)
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
    
    // If no result, try case-insensitive match
    if (result.length === 0) {
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
    }

    let userData: SystemUser | null = null;
    if (result.length > 0) {
      const user = result[0];
      userData = {
        id: user.id,
        system_user_id: user.system_user_id,
        email: user.email,
        mobile: user.mobile,
        full_name: user.full_name,
        primary_role: user.primary_role,
        status: user.status,
      };
    }

    // Cache result for this request cycle
    requestCache.set(cacheKey, { data: userData, timestamp: now });
    
    // Clean up old cache entries periodically
    if (requestCache.size > 100) {
      for (const [key, value] of requestCache.entries()) {
        if ((now - value.timestamp) > CACHE_TTL) {
          requestCache.delete(key);
        }
      }
    }

    return userData;
  } catch (error) {
    // Only log actual errors, not normal "not found" cases
    if (error instanceof Error) {
      const isConnectionError = 
        error.message.includes('CONNECT_TIMEOUT') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('Failed query');
      
      if (isConnectionError) {
        throw new Error(`Database connection error: ${error.message}`);
      }
    }
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
