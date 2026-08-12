/**
 * Enterprise-Grade Permission Engine
 *
 * Works alongside Supabase Auth: Supabase verifies identity (JWT); this engine
 * handles authorization (who can access which dashboard/page/action).
 *
 * What is implemented and used today:
 * - system_users.primary_role → isSuperAdmin (SUPER_ADMIN bypasses all checks).
 * - dashboard_access → which dashboards a user can open (RIDER, MERCHANT, etc.).
 * - dashboard_access_points → which actions are allowed per dashboard (VIEW, CREATE,
 *   APPROVE, etc.) and optional context (e.g. access_point_group, ticket category).
 * - Path-to-dashboard mapping lives in path-mapping.ts (client-safe); canAccessPage
 *   and page-protection use it. API routes call hasDashboardAccessByAuth, isSuperAdmin,
 *   hasAccessPointAction, and actions in lib/permissions/actions.ts for fine-grained checks.
 *
 * What is stubbed for future RBAC:
 * - getUserRolesFromDb / getUserPermissionsFromDb return []. When user_roles and
 *   role_permissions (or equivalent) are wired, permission checks can combine
 *   role-based permissions with dashboard/access-point checks.
 *
 * Client usage: Prefer the usePermission() hook (cached permissions + dashboard access)
 * for UI; always enforce in API routes with this engine or actions.ts.
 */

import { getDb, getSql } from "../db/client";
import { eq, and, inArray, or, isNull, sql } from "drizzle-orm";
import {
  getSystemUserByEmail,
  getSystemUserByAuthId,
  isUserAccountActive,
} from "../auth/user-mapping";
import { dashboardAccess, dashboardAccessPoints, type DashboardType, type AccessPointGroup, type ActionType } from "../db/schema";
import { getDashboardTypeFromPath, isOpenDashboardPath } from "./path-mapping";
import { supabaseAdmin } from "../supabase/server";

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
  canTogglePortal: boolean;
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
export async function getSystemUserIdFromAuthUser(
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

// Helper to get system user with caching (used when we need the full user object)
async function getSystemUserWithCache(
  supabaseAuthId: string,
  email: string | null | undefined
): Promise<{ id: number; primary_role: string } | null> {
  // Try by auth ID first
  let systemUser = await getSystemUserByAuthId(supabaseAuthId);
  
  // Fallback to email
  if (!systemUser && email) {
    systemUser = await getSystemUserByEmail(email);
  }
  
  if (!systemUser) return null;
  
  return {
    id: systemUser.id,
    primary_role: systemUser.primary_role,
  };
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
// Request-level cache for permissions
const permissionsCache = new Map<string, { data: UserPermissions | null; timestamp: number }>();
const PERMISSIONS_CACHE_TTL = 2000; // 2 seconds cache per request

/** Clear in-memory permissions cache (call after superadmin access grants change). */
export function clearPermissionsCache(opts?: { supabaseAuthId?: string | null; email?: string | null }) {
  const authId = opts?.supabaseAuthId?.trim();
  const email = opts?.email?.trim() ?? "";
  if (!authId && !email) {
    permissionsCache.clear();
    return;
  }
  for (const key of permissionsCache.keys()) {
    if (authId && key.includes(`perms:${authId}:`)) {
      permissionsCache.delete(key);
      continue;
    }
    if (email && key.endsWith(`:${email}`)) {
      permissionsCache.delete(key);
    }
  }
}

export async function getUserPermissions(
  supabaseAuthId: string,
  email?: string | null
): Promise<UserPermissions | null> {
  try {
    // Validate that we have at least one identifier
    if (!email && !supabaseAuthId) {
      return null;
    }
    
    // Check request-level cache
    const cacheKey = `perms:${supabaseAuthId}:${email || ''}`;
    const cached = permissionsCache.get(cacheKey);
    const now = Date.now();
    if (cached && (now - cached.timestamp) < PERMISSIONS_CACHE_TTL) {
      return cached.data;
    }
    
    // 1. Resolve system user: unique index on system_user_id (auth uid) first, then email
    let systemUser =
      supabaseAuthId?.trim() ? await getSystemUserByAuthId(supabaseAuthId.trim()) : null;
    if (!systemUser && email?.trim()) {
      systemUser = await getSystemUserByEmail(email.trim());
    }
    if (!systemUser && supabaseAuthId && supabaseAdmin) {
      // Fallback: resolve email from Supabase Auth by auth id (e.g. when session email was missing)
      try {
        const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(supabaseAuthId);
        const resolvedEmail = authUser?.email;
        if (resolvedEmail?.trim()) {
          systemUser = await getSystemUserByEmail(resolvedEmail.trim());
        }
      } catch {
        // Ignore; systemUser stays null
      }
    }
    if (!systemUser) {
      permissionsCache.set(cacheKey, { data: null, timestamp: now });
      return null;
    }
    
    const systemUserId = systemUser.id;
    
    // 2. Check if account is active
    const isActive = await isUserAccountActive(systemUserId);
    if (!isActive) {
      permissionsCache.set(cacheKey, { data: null, timestamp: now });
      return null; // Account is suspended, deleted, or locked
    }
    
    // 3. Get roles
    const roles = await getUserRolesFromDb(systemUserId);
    
    // 4. Check if super admin (use systemUser we already fetched, no need to call getSystemUserByEmail again)
    const isSuperAdmin = systemUser.primary_role === "SUPER_ADMIN" || 
      roles.some(r => r.roleType === "SUPER_ADMIN" || r.roleId === "SUPER_ADMIN");
    
    // 5. Get permissions
    const permissions = await getUserPermissionsFromDb(systemUserId);
    
    // 6. Get domain access (from area_assignments, service_scope_assignments, etc.)
    const domainAccess: string[] = []; // Will be implemented
    
    const result: UserPermissions = {
      systemUserId,
      canTogglePortal: Boolean((systemUser as { can_toggle_portal?: boolean }).can_toggle_portal),
      roles,
      permissions,
      domainAccess,
      isSuperAdmin,
    };
    
    // Cache result for this request cycle
    permissionsCache.set(cacheKey, { data: result, timestamp: now });
    
    // Clean up old cache entries periodically
    if (permissionsCache.size > 100) {
      for (const [key, value] of permissionsCache.entries()) {
        if ((now - value.timestamp) > PERMISSIONS_CACHE_TTL) {
          permissionsCache.delete(key);
        }
      }
    }
    
    return result;
  } catch (error) {
    // Only log actual errors in development
    if (process.env.NODE_ENV === 'development') {
      console.error("[getUserPermissions] Error:", error);
    }
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

/** Re-export for backward compatibility; implementation in path-mapping.ts (client-safe). */
export { getDashboardTypeFromPath } from "./path-mapping";

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

    // Home + open fleet tools — any agent with ≥1 dashboard access
    if (isOpenDashboardPath(pagePath)) {
      const systemUserId = await getSystemUserIdFromAuthUser(supabaseAuthId, email);
      if (!systemUserId) {
        return false;
      }
      const dashboards = await getUserDashboardAccess(systemUserId);
      return dashboards.length > 0;
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
  email?: string | null
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
  email?: string | null
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
  const mapRows = (
    rows: Array<{
      id: number;
      system_user_id?: number;
      systemUserId?: number;
      dashboard_type?: string;
      dashboardType?: string;
      access_level?: string;
      accessLevel?: string;
      is_active?: boolean | null;
      isActive?: boolean | null;
      granted_by?: number;
      grantedBy?: number;
      granted_by_name?: string | null;
      grantedByName?: string | null;
      granted_at?: Date;
      grantedAt?: Date;
    }>
  ): DashboardAccess[] =>
    rows.map((row) => ({
      id: Number(row.id),
      systemUserId: Number(row.system_user_id ?? row.systemUserId),
      dashboardType: String(row.dashboard_type ?? row.dashboardType ?? ""),
      accessLevel: String(row.access_level ?? row.accessLevel ?? "VIEW_ONLY"),
      isActive: (row.is_active ?? row.isActive) === true,
      grantedBy: Number(row.granted_by ?? row.grantedBy ?? 0),
      grantedByName: (row.granted_by_name ?? row.grantedByName) || undefined,
      grantedAt: (row.granted_at ?? row.grantedAt) as Date,
    }));

  try {
    const db = getDb();
    const result = await db
      .select()
      .from(dashboardAccess)
      .where(
        and(
          eq(dashboardAccess.systemUserId, systemUserId),
          eq(dashboardAccess.isActive, true)
        )
      );

    return mapRows(result);
  } catch (error) {
    // Drizzle/postgres-js can throw transient "reading 'length'" during dev hot reload or pool churn.
    try {
      const sql = getSql();
      const rows = await sql`
        SELECT id, system_user_id, dashboard_type, access_level, is_active,
               granted_by, granted_by_name, granted_at
        FROM dashboard_access
        WHERE system_user_id = ${systemUserId}
          AND is_active = true
      `;
      return mapRows(rows as unknown as Parameters<typeof mapRows>[0]);
    } catch (fallbackError) {
      console.error("Error fetching dashboard access:", error, fallbackError);
      return [];
    }
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
    
    return result.map((row) => ({
      id: row.id,
      systemUserId: row.systemUserId,
      dashboardType: row.dashboardType,
      accessPointGroup: row.accessPointGroup,
      accessPointName: row.accessPointName,
      accessPointDescription: row.accessPointDescription || undefined,
      allowedActions: (row.allowedActions as string[]) || [],
      context: (row.context as Record<string, any>) || undefined,
      isActive: row.isActive === true,    }));
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
 * Check if user has a specific action in a given access point group
 */
export async function hasAccessPointAction(
  systemUserId: number,
  dashboardType: DashboardType,
  accessPointGroup: AccessPointGroup,
  actionType: ActionType
): Promise<boolean> {
  try {
    const db = getDb();
    const result = await db
      .select({ allowedActions: dashboardAccessPoints.allowedActions })
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
    const row = result[0];
    if (!row) return false;
    const actions = (row?.allowedActions as string[] | null) ?? [];
    const want = String(actionType).trim().toUpperCase();
    // Legacy / incomplete rows: active TICKET_AGENT_STATUS_TOGGLE with no actions ⇒ UPDATE.
    if (
      actions.length === 0 &&
      String(accessPointGroup).trim().toUpperCase() === "TICKET_AGENT_STATUS_TOGGLE" &&
      want === "UPDATE"
    ) {
      return true;
    }
    return actions.some((a) => String(a).trim().toUpperCase() === want);
  } catch (error) {
    return false;
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
    const userPerms = await getUserPermissions(supabaseAuthId, email);
    if (!userPerms) {
      return false;
    }
    if (userPerms.isSuperAdmin) {
      return true;
    }
    return hasDashboardAccess(userPerms.systemUserId, dashboardType);
  } catch (error) {
    console.error("Error checking dashboard access by auth:", error);
    return false;
  }
}