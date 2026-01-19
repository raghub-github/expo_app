/**
 * Enterprise-Grade Permission Engine
 * 
 * This module implements the custom authorization system that works alongside
 * Supabase Auth. Supabase handles authentication (identity), this handles
 * authorization (permissions, roles, access control).
 * 
 * Architecture:
 * 1. Supabase Auth verifies identity (JWT)
 * 2. This engine checks authorization (roles, permissions)
 * 3. Database RLS provides additional security layer
 */

import { getDb } from "../db/client";
import { eq, and, inArray, or, isNull, sql } from "drizzle-orm";
import { getSystemUserByEmail, getSystemUserByAuthId, isUserAccountActive } from "../auth/user-mapping";
import { dashboardAccess, dashboardAccessPoints, type DashboardType, type AccessPointGroup, type ActionType } from "../db/schema";

// Type definitions - these should match your database schema
export type AccessModule = 
  | "ORDERS" 
  | "TICKETS" 
  | "RIDERS" 
  | "MERCHANTS" 
  | "CUSTOMERS" 
  | "PAYMENTS" 
  | "REFUNDS" 
  | "PAYOUTS" 
  | "OFFERS" 
  | "ADVERTISEMENTS" 
  | "ANALYTICS" 
  | "AUDIT" 
  | "SETTINGS" 
  | "USERS";

export type PermissionAction = 
  | "VIEW" 
  | "CREATE" 
  | "UPDATE" 
  | "DELETE" 
  | "APPROVE" 
  | "REJECT" 
  | "ASSIGN" 
  | "CANCEL" 
  | "REFUND" 
  | "BLOCK" 
  | "UNBLOCK" 
  | "EXPORT" 
  | "IMPORT";

export interface Permission {
  module: AccessModule;
  action: PermissionAction;
  resourceType?: string;
}

export interface UserPermissions {
  systemUserId: number;
  roles: Array<{
    id: number;
    roleId: string;
    roleName: string;
    roleType: string;
    isPrimary: boolean;
  }>;
  permissions: Permission[];
  domainAccess: string[];
  isSuperAdmin: boolean;
  dashboardAccess?: DashboardAccess[];
  accessPoints?: AccessPoint[];
}

export interface DashboardAccess {
  id: number;
  systemUserId: number;
  dashboardType: string;
  accessLevel: string;
  isActive: boolean;
  grantedBy: number;
  grantedByName?: string;
  grantedAt: Date;
}

export interface AccessPoint {
  id: number;
  systemUserId: number;
  dashboardType: string;
  accessPointGroup: string;
  accessPointName: string;
  accessPointDescription?: string;
  allowedActions: string[];
  context?: Record<string, any>;
  isActive: boolean;
}

/**
 * Get system user ID from Supabase auth user
 * This is the bridge between Supabase Auth and our authorization system
 */
async function getSystemUserIdFromAuthUser(
  supabaseAuthId: string,
  email: string | null | undefined
): Promise<number | null> {
  // Try by auth ID first (if column exists)
  let systemUser = await getSystemUserByAuthId(supabaseAuthId);
  
  // Fallback to email (only if email is provided)
  if (!systemUser && email) {
    systemUser = await getSystemUserByEmail(email);
  }
  
  return systemUser?.id || null;
}

/**
 * Get all roles for a system user
 */
async function getUserRolesFromDb(systemUserId: number): Promise<any[]> {
  const db = getDb();
  
  try {
    // Query user_roles joined with system_roles
    // WHERE user_roles.system_user_id = systemUserId
    // AND user_roles.is_active = true
    // AND (user_roles.valid_until IS NULL OR user_roles.valid_until > NOW())
    
    // This will be implemented with actual Drizzle queries:
    // const result = await db
    //   .select({
    //     roleId: systemRoles.roleId,
    //     roleName: systemRoles.roleName,
    //     roleType: systemRoles.roleType,
    //     isPrimary: userRoles.isPrimary,
    //   })
    //   .from(userRoles)
    //   .innerJoin(systemRoles, eq(userRoles.roleId, systemRoles.id))
    //   .where(
    //     and(
    //       eq(userRoles.systemUserId, systemUserId),
    //       eq(userRoles.isActive, true),
    //       or(
    //         isNull(userRoles.validUntil),
    //         sql`${userRoles.validUntil} > NOW()`
    //       )
    //     )
    //   );
    
    return [];
  } catch (error) {
    console.error("Error fetching user roles:", error);
    return [];
  }
}

/**
 * Get all permissions for a system user (from roles + overrides)
 */
async function getUserPermissionsFromDb(systemUserId: number): Promise<Permission[]> {
  const db = getDb();
  
  try {
    // 1. Get user's roles
    const roles = await getUserRolesFromDb(systemUserId);
    const roleIds = roles.map(r => r.id);
    
    if (roleIds.length === 0) {
      return [];
    }
    
    // 2. Get permissions from roles
    // Query role_permissions joined with system_permissions
    // WHERE role_permissions.role_id IN (roleIds)
    // AND role_permissions.is_active = true
    
    // 3. Get permission overrides (user_permission_overrides)
    // WHERE system_user_id = systemUserId
    // AND is_active = true
    // Apply overrides (GRANT adds, REVOKE removes)
    
    // 4. Combine and deduplicate
    
    return [];
  } catch (error) {
    console.error("Error fetching user permissions:", error);
    return [];
  }
}

/**
 * Get complete user permissions including roles, permissions, and domain access
 * This is the main function called by middleware and API routes
 */
export async function getUserPermissions(
  supabaseAuthId: string,
  email?: string | null
): Promise<UserPermissions | null> {
  try {
    console.log("[getUserPermissions] Checking permissions for:", { supabaseAuthId, email });
    
    // Validate that we have at least one identifier
    if (!email && !supabaseAuthId) {
      console.log("[getUserPermissions] No email or auth ID provided");
      return null;
    }
    
    // 1. Get system user ID
    const systemUserId = await getSystemUserIdFromAuthUser(supabaseAuthId, email || null);
    console.log("[getUserPermissions] System user ID:", systemUserId);
    
    if (!systemUserId) {
      // User doesn't exist in system_users - might be customer/rider/merchant
      // They should use their respective apps, not the dashboard
      console.log("[getUserPermissions] No system user found for email:", email || "N/A");
      return null;
    }
    
    // 2. Check if account is active
    const isActive = await isUserAccountActive(systemUserId);
    console.log("[getUserPermissions] Account active:", isActive);
    if (!isActive) {
      console.log("[getUserPermissions] Account is not active");
      return null; // Account is suspended, deleted, or locked
    }
    
    // 3. Get roles
    const roles = await getUserRolesFromDb(systemUserId);
    
    // 4. Check if super admin (check primary_role from system_users)
    // For now, check primary_role directly since roles table might not be set up
    const systemUser = await getSystemUserByEmail(email);
    const isSuperAdmin = systemUser?.primary_role === "SUPER_ADMIN" || 
      roles.some(r => r.roleType === "SUPER_ADMIN" || r.roleId === "SUPER_ADMIN");
    console.log("[getUserPermissions] Is super admin:", isSuperAdmin, "Primary role:", systemUser?.primary_role);
    
    // 5. Get permissions
    const permissions = await getUserPermissionsFromDb(systemUserId);
    
    // 6. Get domain access (from area_assignments, service_scope_assignments, etc.)
    const domainAccess: string[] = []; // Will be implemented
    
    const result = {
      systemUserId,
      roles,
      permissions,
      domainAccess,
      isSuperAdmin,
    };
    console.log("[getUserPermissions] Returning permissions:", { systemUserId, isSuperAdmin, rolesCount: roles.length });
    
    return result;
  } catch (error) {
    console.error("[getUserPermissions] Error getting user permissions:", error);
    return null;
  }
}

/**
 * Check if user has a specific permission
 */
export async function checkPermission(
  supabaseAuthId: string,
  email: string,
  module: AccessModule,
  action: PermissionAction,
  resourceType?: string
): Promise<boolean> {
  try {
    // 1. Get user permissions
    const userPerms = await getUserPermissions(supabaseAuthId, email);
    
    if (!userPerms) {
      return false; // User doesn't exist or account inactive
    }
    
    // 2. Super admin bypass
    if (userPerms.isSuperAdmin) {
      return true;
    }
    
    // 3. Check if permission exists
    const hasPermission = userPerms.permissions.some(
      (perm) =>
        perm.module === module &&
        perm.action === action &&
        (!resourceType || perm.resourceType === resourceType)
    );
    
    return hasPermission;
  } catch (error) {
    console.error("Error checking permission:", error);
    return false; // Fail closed - deny access on error
  }
}

/**
 * Map URL path to dashboard type
 * Helper function to convert page paths to dashboard types
 */
export function getDashboardTypeFromPath(pagePath: string): DashboardType | null {
  const pathToDashboardMap: Record<string, DashboardType> = {
    "/dashboard/riders": "RIDER",
    "/dashboard/merchants": "MERCHANT",
    "/dashboard/customers": "CUSTOMER", // All customer paths map to CUSTOMER dashboard
    "/dashboard/orders": "ORDER_FOOD", // Default to food, but check specific paths
    "/dashboard/orders/food": "ORDER_FOOD",
    "/dashboard/orders/person-ride": "ORDER_PERSON_RIDE",
    "/dashboard/orders/parcel": "ORDER_PARCEL",
    "/dashboard/tickets": "TICKET", // All ticket paths map to TICKET dashboard
    "/dashboard/offers": "OFFER",
    "/dashboard/area-managers": "AREA_MANAGER",
    "/dashboard/payments": "PAYMENT",
    "/dashboard/system": "SYSTEM",
    "/dashboard/analytics": "ANALYTICS",
    "/dashboard/super-admin": "SYSTEM", // Super admin dashboard is part of system
  };

  // Check exact match first
  if (pathToDashboardMap[pagePath]) {
    return pathToDashboardMap[pagePath];
  }

  // Check if path starts with any dashboard path
  for (const [path, dashboardType] of Object.entries(pathToDashboardMap)) {
    if (pagePath.startsWith(path)) {
      return dashboardType;
    }
  }

  return null;
}

/**
 * Check if user can access a specific page/route
 * Now uses dashboard_access table instead of legacy permissions
 */
export async function canAccessPage(
  supabaseAuthId: string,
  email: string,
  pagePath: string
): Promise<boolean> {
  try {
    // First check if user is super admin - they have access to everything
    const userPerms = await getUserPermissions(supabaseAuthId, email);
    if (!userPerms) {
      return false; // User doesn't exist or account inactive
    }

    if (userPerms.isSuperAdmin) {
      return true; // Super admin bypass
    }

    // Dashboard home page - allow if user has any dashboard access or is super admin
    if (pagePath === "/dashboard" || pagePath === "/dashboard/") {
      const systemUserId = await getSystemUserIdFromAuthUser(supabaseAuthId, email);
      if (!systemUserId) {
        return false;
      }
      const dashboards = await getUserDashboardAccess(systemUserId);
      return dashboards.length > 0; // User can access dashboard home if they have at least one dashboard
    }

    // Map page path to dashboard type
    const dashboardType = getDashboardTypeFromPath(pagePath);
    if (!dashboardType) {
      // Unknown page - deny access by default (fail closed)
      console.warn(`Unknown page path: ${pagePath}`);
      return false;
    }

    // Special case: Payment dashboard is super admin only
    if (dashboardType === "PAYMENT") {
      return false; // Only super admins can access payment dashboard (already checked above)
    }

    // Check dashboard access using dashboard_access table
    const systemUserId = await getSystemUserIdFromAuthUser(supabaseAuthId, email);
    if (!systemUserId) {
      return false;
    }

    return hasDashboardAccess(systemUserId, dashboardType);
  } catch (error) {
    console.error("Error in canAccessPage:", error);
    return false; // Fail closed
  }
}

/**
 * Get user's accessible domains (Rider, Merchant, Customer)
 */
export async function getUserDomainAccess(
  supabaseAuthId: string,
  email: string
): Promise<string[]> {
  try {
    const userPerms = await getUserPermissions(supabaseAuthId, email);
    return userPerms?.domainAccess || [];
  } catch (error) {
    console.error("Error fetching domain access:", error);
    return [];
  }
}

/**
 * Check if user is super admin
 * Helper function for requiring super admin permissions
 */
export async function isSuperAdmin(
  supabaseAuthId: string,
  email: string
): Promise<boolean> {
  try {
    const userPerms = await getUserPermissions(supabaseAuthId, email);
    return userPerms?.isSuperAdmin || false;
  } catch (error) {
    console.error("Error checking super admin status:", error);
    return false;
  }
}

/**
 * Require super admin - throws error if user is not super admin
 * Use this in API routes that require super admin access
 */
export async function requireSuperAdmin(
  supabaseAuthId: string,
  email: string
): Promise<void> {
  const isAdmin = await isSuperAdmin(supabaseAuthId, email);
  if (!isAdmin) {
    throw new Error("Super admin access required");
  }
}

/**
 * Get all dashboard access for a system user
 */
export async function getUserDashboardAccess(systemUserId: number): Promise<DashboardAccess[]> {
  const db = getDb();
  
  try {
    const result = await db
      .select()
      .from(dashboardAccess)
      .where(
        and(
          eq(dashboardAccess.systemUserId, systemUserId),
          eq(dashboardAccess.isActive, true)
        )
      );
    
    return result.map(row => ({
      id: row.id,
      systemUserId: row.systemUserId,
      dashboardType: row.dashboardType,
      accessLevel: row.accessLevel,
      isActive: row.isActive,
      grantedBy: row.grantedBy,
      grantedByName: row.grantedByName || undefined,
      grantedAt: row.grantedAt,
    }));
  } catch (error) {
    console.error("Error fetching dashboard access:", error);
    return [];
  }
}

/**
 * Check if user has access to a specific dashboard
 */
export async function hasDashboardAccess(
  systemUserId: number,
  dashboardType: DashboardType
): Promise<boolean> {
  try {
    const db = getDb();
    const result = await db
      .select()
      .from(dashboardAccess)
      .where(
        and(
          eq(dashboardAccess.systemUserId, systemUserId),
          eq(dashboardAccess.dashboardType, dashboardType),
          eq(dashboardAccess.isActive, true)
        )
      )
      .limit(1);
    
    return result.length > 0;
  } catch (error) {
    console.error("Error checking dashboard access:", error);
    return false; // Fail closed
  }
}

/**
 * Get all access points for a user in a specific dashboard
 */
export async function getUserAccessPoints(
  systemUserId: number,
  dashboardType: DashboardType
): Promise<AccessPoint[]> {
  const db = getDb();
  
  try {
    const result = await db
      .select()
      .from(dashboardAccessPoints)
      .where(
        and(
          eq(dashboardAccessPoints.systemUserId, systemUserId),
          eq(dashboardAccessPoints.dashboardType, dashboardType),
          eq(dashboardAccessPoints.isActive, true)
        )
      );
    
    return result.map(row => ({
      id: row.id,
      systemUserId: row.systemUserId,
      dashboardType: row.dashboardType,
      accessPointGroup: row.accessPointGroup,
      accessPointName: row.accessPointName,
      accessPointDescription: row.accessPointDescription || undefined,
      allowedActions: (row.allowedActions as string[]) || [],
      context: (row.context as Record<string, any>) || undefined,
      isActive: row.isActive,
    }));
  } catch (error) {
    console.error("Error fetching access points:", error);
    return [];
  }
}

/**
 * Check if user has a specific access point
 */
export async function hasAccessPoint(
  systemUserId: number,
  dashboardType: DashboardType,
  accessPointGroup: AccessPointGroup
): Promise<boolean> {
  try {
    const db = getDb();
    const result = await db
      .select()
      .from(dashboardAccessPoints)
      .where(
        and(
          eq(dashboardAccessPoints.systemUserId, systemUserId),
          eq(dashboardAccessPoints.dashboardType, dashboardType),
          eq(dashboardAccessPoints.accessPointGroup, accessPointGroup),
          eq(dashboardAccessPoints.isActive, true)
        )
      )
      .limit(1);
    
    return result.length > 0;
  } catch (error) {
    console.error("Error checking access point:", error);
    return false; // Fail closed
  }
}

/**
 * Check if user can perform a specific action
 * This checks both dashboard access and access points
 */
export async function canPerformAction(
  systemUserId: number,
  dashboardType: DashboardType,
  actionType: ActionType,
  resourceType?: string
): Promise<boolean> {
  try {
    // First check if user has dashboard access
    const hasAccess = await hasDashboardAccess(systemUserId, dashboardType);
    if (!hasAccess) {
      return false;
    }
    
    // Get all access points for this dashboard
    const accessPoints = await getUserAccessPoints(systemUserId, dashboardType);
    
    // Check if any access point allows this action
    for (const accessPoint of accessPoints) {
      const allowedActions = accessPoint.allowedActions || [];
      if (allowedActions.includes(actionType)) {
        // If resourceType is specified, check context
        if (resourceType && accessPoint.context) {
          // For ticket categories, check context
          if (dashboardType === "TICKET" && accessPoint.context.ticket_category) {
            // This will be handled by specific ticket category checks
            return true;
          }
          // Add other resource type checks as needed
        }
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error("Error checking action permission:", error);
    return false; // Fail closed
  }
}

/**
 * Check dashboard access using auth credentials
 * Convenience function that gets systemUserId first
 */
export async function hasDashboardAccessByAuth(
  supabaseAuthId: string,
  email: string,
  dashboardType: DashboardType
): Promise<boolean> {
  try {
    const systemUserId = await getSystemUserIdFromAuthUser(supabaseAuthId, email);
    if (!systemUserId) {
      return false;
    }
    
    // Super admin has access to all dashboards
    const userPerms = await getUserPermissions(supabaseAuthId, email);
    if (userPerms?.isSuperAdmin) {
      return true;
    }
    
    return hasDashboardAccess(systemUserId, dashboardType);
  } catch (error) {
    console.error("Error checking dashboard access by auth:", error);
    return false;
  }
}