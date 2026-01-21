/**
 * Database Operations for System Users
 * Handles all CRUD operations for user management
 */

import { getDb } from "../client";
import { systemUsers } from "../schema";
import { eq, and, or, ilike, isNull, sql, desc, asc } from "drizzle-orm";

export interface CreateUserData {
  system_user_id: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  mobile: string;
  alternate_mobile?: string;
  primary_role: string;
  subrole?: string;
  subrole_other?: string;
  role_display_name?: string;
  department?: string;
  team?: string;
  reports_to_id?: number;
  manager_name?: string;
  status?: string;
  created_by?: number;
  created_by_name?: string;
}

export interface UpdateUserData {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  mobile?: string;
  alternate_mobile?: string;
  primary_role?: string;
  subrole?: string;
  subroleOther?: string;
  role_display_name?: string;
  department?: string;
  team?: string;
  reports_to_id?: number;
  manager_name?: string;
  status?: string;
  status_reason?: string;
  suspension_expires_at?: string | Date | null;
  is_email_verified?: boolean;
  is_mobile_verified?: boolean;
  two_factor_enabled?: boolean;
  approved_by?: number;
  approved_at?: Date;
}

export interface UserFilters {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
  department?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/**
 * Create a new system user
 */
export async function createSystemUser(data: CreateUserData) {
  const db = getDb();
  
  const [user] = await db
    .insert(systemUsers)
    .values({
      systemUserId: data.system_user_id,
      fullName: data.full_name,
      firstName: data.first_name,
      lastName: data.last_name,
      email: data.email.toLowerCase(),
      mobile: data.mobile,
      alternateMobile: data.alternate_mobile,
      primaryRole: data.primary_role as any,
      subrole: data.subrole,
      subroleOther: data.subrole === "OTHER" ? data.subrole_other : undefined,
      roleDisplayName: data.role_display_name,
      department: data.department,
      team: data.team,
      reportsToId: data.reports_to_id,
      managerName: data.manager_name,
      status: (data.status as any) || "PENDING_ACTIVATION",
      createdBy: data.created_by,
      createdByName: data.created_by_name,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  
  return user;
}

/**
 * Get user by ID
 */
export async function getSystemUserById(id: number) {
  const db = getDb();
  
  const [user] = await db
    .select()
    .from(systemUsers)
    .where(eq(systemUsers.id, id))
    .limit(1);
  
  return user || null;
}

/**
 * Get user by email
 */
export async function getSystemUserByEmail(email: string) {
  const db = getDb();
  
  const [user] = await db
    .select()
    .from(systemUsers)
    .where(eq(systemUsers.email, email.toLowerCase()))
    .limit(1);
  
  return user || null;
}

/**
 * Get user by system_user_id
 */
export async function getSystemUserBySystemUserId(systemUserId: string) {
  const db = getDb();
  
  const [user] = await db
    .select()
    .from(systemUsers)
    .where(eq(systemUsers.systemUserId, systemUserId))
    .limit(1);
  
  return user || null;
}

/**
 * Update system user
 */
export async function updateSystemUser(id: number, updates: UpdateUserData) {
  const db = getDb();
  
  const updateData: any = {
    updatedAt: new Date(),
  };
  
  if (updates.system_user_id !== undefined) updateData.systemUserId = updates.system_user_id;
  if (updates.full_name !== undefined) updateData.fullName = updates.full_name;
  if (updates.first_name !== undefined) updateData.firstName = updates.first_name;
  if (updates.last_name !== undefined) updateData.lastName = updates.last_name;
  if (updates.email !== undefined) updateData.email = updates.email.toLowerCase();
  if (updates.mobile !== undefined) updateData.mobile = updates.mobile;
  if (updates.alternate_mobile !== undefined) updateData.alternateMobile = updates.alternate_mobile;
  if (updates.primary_role !== undefined) updateData.primaryRole = updates.primary_role as any;
  if (updates.subrole !== undefined) updateData.subrole = updates.subrole;
  if (updates.subroleOther !== undefined) {
    // Only set subroleOther if subrole is "OTHER", otherwise clear it
    if (updates.subrole === "OTHER") {
      updateData.subroleOther = updates.subroleOther;
    } else {
      updateData.subroleOther = null;
    }
  }
  if (updates.role_display_name !== undefined) updateData.roleDisplayName = updates.role_display_name;
  if (updates.department !== undefined) updateData.department = updates.department;
  if (updates.team !== undefined) updateData.team = updates.team;
  if (updates.reports_to_id !== undefined) updateData.reportsToId = updates.reports_to_id;
  if (updates.manager_name !== undefined) updateData.managerName = updates.manager_name;
  if (updates.status !== undefined) updateData.status = updates.status as any;
  if (updates.status_reason !== undefined) updateData.statusReason = updates.status_reason;
  if (updates.suspension_expires_at !== undefined) {
    updateData.suspensionExpiresAt = updates.suspension_expires_at 
      ? (typeof updates.suspension_expires_at === 'string' ? new Date(updates.suspension_expires_at) : updates.suspension_expires_at)
      : null;
  }
  if (updates.is_email_verified !== undefined) updateData.isEmailVerified = updates.is_email_verified;
  if (updates.is_mobile_verified !== undefined) updateData.isMobileVerified = updates.is_mobile_verified;
  if (updates.two_factor_enabled !== undefined) updateData.twoFactorEnabled = updates.two_factor_enabled;
  if (updates.approved_by !== undefined) updateData.approvedBy = updates.approved_by;
  if (updates.approved_at !== undefined) updateData.approvedAt = updates.approved_at;
  
  const [updated] = await db
    .update(systemUsers)
    .set(updateData)
    .where(eq(systemUsers.id, id))
    .returning();
  
  return updated || null;
}

/**
 * Soft delete user (set deleted_at)
 */
export async function deleteSystemUser(id: number, deletedBy: number) {
  const db = getDb();
  
  const [deleted] = await db
    .update(systemUsers)
    .set({
      deletedAt: new Date(),
      deletedBy: deletedBy,
      status: "DISABLED" as any,
      updatedAt: new Date(),
    })
    .where(eq(systemUsers.id, id))
    .returning();
  
  return deleted || null;
}

/**
 * Activate user
 */
export async function activateSystemUser(id: number, approvedBy: number, approvedByName?: string) {
  const db = getDb();
  
  const [activated] = await db
    .update(systemUsers)
    .set({
      status: "ACTIVE" as any,
      approvedBy: approvedBy,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(systemUsers.id, id))
    .returning();
  
  return activated || null;
}

/**
 * Deactivate user
 */
export async function deactivateSystemUser(id: number, statusReason?: string) {
  const db = getDb();
  
  const [deactivated] = await db
    .update(systemUsers)
    .set({
      status: "SUSPENDED" as any,
      statusReason: statusReason,
      updatedAt: new Date(),
    })
    .where(eq(systemUsers.id, id))
    .returning();
  
  return deactivated || null;
}

/**
 * List users with filters and pagination
 */
export async function listSystemUsers(filters: UserFilters = {}) {
  const db = getDb();
  
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const offset = (page - 1) * limit;
  
  let query = db.select().from(systemUsers);
  
  // Build where conditions
  const conditions = [];
  
  // Exclude soft-deleted users
  conditions.push(isNull(systemUsers.deletedAt));
  
  // Search filter
  if (filters.search) {
    conditions.push(
      or(
        ilike(systemUsers.fullName, `%${filters.search}%`),
        ilike(systemUsers.email, `%${filters.search}%`),
        ilike(systemUsers.mobile, `%${filters.search}%`),
        ilike(systemUsers.systemUserId, `%${filters.search}%`)
      )!
    );
  }
  
  // Role filter
  if (filters.role) {
    conditions.push(eq(systemUsers.primaryRole, filters.role as any));
  }
  
  // Status filter
  if (filters.status) {
    conditions.push(eq(systemUsers.status, filters.status as any));
  }
  
  // Department filter
  if (filters.department) {
    conditions.push(eq(systemUsers.department, filters.department));
  }
  
  // Apply where conditions
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }
  
  // Sorting
  const sortBy = filters.sortBy || "createdAt";
  const sortOrder = filters.sortOrder || "desc";
  
  if (sortBy === "fullName") {
    query = query.orderBy(sortOrder === "asc" ? asc(systemUsers.fullName) : desc(systemUsers.fullName));
  } else if (sortBy === "email") {
    query = query.orderBy(sortOrder === "asc" ? asc(systemUsers.email) : desc(systemUsers.email));
  } else if (sortBy === "createdAt") {
    query = query.orderBy(sortOrder === "asc" ? asc(systemUsers.createdAt) : desc(systemUsers.createdAt));
  } else {
    query = query.orderBy(desc(systemUsers.createdAt));
  }
  
  // Get total count for pagination
  const countQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(systemUsers);
  
  if (conditions.length > 0) {
    countQuery.where(and(...conditions));
  }
  
  const [{ count: total }] = await countQuery;
  
  // Apply pagination
  const users = await query.limit(limit).offset(offset);
  
  return {
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Check if user account is active
 */
export async function isUserAccountActive(id: number): Promise<boolean> {
  const user = await getSystemUserById(id);
  
  if (!user) return false;
  
  // Check if soft-deleted
  if (user.deletedAt) return false;
  
  // Check if status is active
  if (user.status !== "ACTIVE") return false;
  
  // Check if account is locked
  if (user.accountLockedUntil && new Date(user.accountLockedUntil) > new Date()) {
    return false;
  }
  
  return true;
}

/**
 * Update last login
 */
export async function updateLastLogin(id: number) {
  const db = getDb();
  
  await db
    .update(systemUsers)
    .set({
      lastLoginAt: new Date(),
      lastActivityAt: new Date(),
      loginCount: sql`${systemUsers.loginCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(systemUsers.id, id));
}

/**
 * Update last activity
 */
export async function updateLastActivity(id: number) {
  const db = getDb();
  
  await db
    .update(systemUsers)
    .set({
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(systemUsers.id, id));
}

/**
 * Increment failed login attempts
 */
export async function incrementFailedLoginAttempts(id: number) {
  const db = getDb();
  
  const [updated] = await db
    .update(systemUsers)
    .set({
      failedLoginAttempts: sql`${systemUsers.failedLoginAttempts} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(systemUsers.id, id))
    .returning();
  
  // Lock account after 5 failed attempts
  if (updated && updated.failedLoginAttempts >= 5) {
    await db
      .update(systemUsers)
      .set({
        status: "LOCKED" as any,
        accountLockedUntil: sql`NOW() + INTERVAL '1 hour'`,
        updatedAt: new Date(),
      })
      .where(eq(systemUsers.id, id));
  }
  
  return updated;
}

/**
 * Reset failed login attempts
 */
export async function resetFailedLoginAttempts(id: number) {
  const db = getDb();
  
  await db
    .update(systemUsers)
    .set({
      failedLoginAttempts: 0,
      accountLockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(systemUsers.id, id));
}

/**
 * Get unique roles from system users
 * Returns a sorted array of unique primary roles that exist in the database
 */
export async function getUniqueRoles(): Promise<string[]> {
  const db = getDb();
  
  try {
    // Use SQL to get distinct roles
    const result = await db.execute(
      sql`SELECT DISTINCT primary_role as role FROM system_users WHERE deleted_at IS NULL ORDER BY role`
    );
    
    // Extract roles
    const roles = result.rows.map((row: any) => row.role as string).filter(Boolean);
    
    // Sort roles alphabetically, but put SUPER_ADMIN first if it exists
    return roles.sort((a, b) => {
      if (a === "SUPER_ADMIN") return -1;
      if (b === "SUPER_ADMIN") return 1;
      return a.localeCompare(b);
    });
  } catch (error) {
    console.error("[getUniqueRoles] Error:", error);
    return [];
  }
}
