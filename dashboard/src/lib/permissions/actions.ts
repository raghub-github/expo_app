/**
 * Action-Level Permission Checking Utilities
 * 
 * This module provides functions to check if a user can perform specific actions
 * based on their dashboard access points.
 */

import { 
  canPerformAction as engineCanPerformAction,
  hasDashboardAccess,
  getUserAccessPoints,
  isSuperAdmin
} from "./engine";
import type { DashboardType, ActionType } from "../db/schema";
import { getSystemUserByAuthId, getSystemUserByEmail } from "../auth/user-mapping";

async function getSystemUserIdFromAuth(
  supabaseAuthId: string,
  email: string
): Promise<number | null> {
  const byAuth = await getSystemUserByAuthId(supabaseAuthId);
  if (byAuth?.id) return byAuth.id;
  const byEmail = await getSystemUserByEmail(email);
  return byEmail?.id ?? null;
}

/**
 * Check if user can perform a specific action using auth credentials
 * Convenience function that gets systemUserId first
 */
export async function canPerformActionByAuth(
  supabaseAuthId: string,
  email: string,
  dashboardType: DashboardType,
  actionType: ActionType,
  resourceType?: string,
  context?: Record<string, any>
): Promise<boolean> {
  try {
    // Check if super admin - they can perform all actions
    const userIsSuperAdmin = await isSuperAdmin(supabaseAuthId, email);
    if (userIsSuperAdmin) {
      return true;
    }

    // Get system user ID
    const systemUserId = await getSystemUserIdFromAuth(supabaseAuthId, email);
    if (!systemUserId) {
      return false;
    }

    // Check dashboard access first
    const hasAccess = await hasDashboardAccess(systemUserId, dashboardType);
    if (!hasAccess) {
      return false;
    }

    // Get user's access points for this dashboard
    const accessPoints = await getUserAccessPoints(systemUserId, dashboardType);

    // Check if any access point allows this action
    for (const accessPoint of accessPoints) {
      const allowedActions = accessPoint.allowedActions || [];
      
      // If context specifies access_point_group, check it matches
      if (context?.access_point_group) {
        if (accessPoint.accessPointGroup !== context.access_point_group) {
          continue; // Access point group doesn't match
        }
      }
      
      // Check if action is allowed
      if (allowedActions.includes(actionType)) {
        // If context is provided, check it matches
        if (context && accessPoint.context) {
          // For tickets, check category and type
          if (dashboardType === "TICKET") {
            const ticketCategory = context.ticket_category;
            const ticketType = context.ticket_type; // ORDER_RELATED or NON_ORDER_RELATED
            
            // Check if access point context matches
            const apCategory = accessPoint.context.ticket_category;
            const apType = accessPoint.context.ticket_type;
            
            // If access point has specific category/type, they must match
            if (apCategory && ticketCategory !== apCategory) {
              continue; // Category doesn't match
            }
            if (apType && ticketType !== apType) {
              continue; // Type doesn't match
            }
          }
          
          // Add other context checks as needed for other dashboards
        }
        
        return true; // Action is allowed
      }
    }

    return false; // No access point allows this action
  } catch (error) {
    console.error("Error checking action permission:", error);
    return false; // Fail closed
  }
}

/**
 * Check if user can perform action using system user ID
 * This is more efficient if you already have the system user ID
 */
export async function canPerformAction(
  systemUserId: number,
  dashboardType: DashboardType,
  actionType: ActionType,
  resourceType?: string,
  context?: Record<string, any>
): Promise<boolean> {
  return engineCanPerformAction(systemUserId, dashboardType, actionType, resourceType);
}

/**
 * Check if user can view a specific resource type in a dashboard
 */
export async function canViewResource(
  supabaseAuthId: string,
  email: string,
  dashboardType: DashboardType,
  resourceType?: string
): Promise<boolean> {
  return canPerformActionByAuth(supabaseAuthId, email, dashboardType, "VIEW", resourceType);
}

/**
 * Check if user can update a specific resource type in a dashboard
 */
export async function canUpdateResource(
  supabaseAuthId: string,
  email: string,
  dashboardType: DashboardType,
  resourceType?: string,
  context?: Record<string, any>
): Promise<boolean> {
  return canPerformActionByAuth(supabaseAuthId, email, dashboardType, "UPDATE", resourceType, context);
}

/**
 * Check if user can create a specific resource type in a dashboard
 */
export async function canCreateResource(
  supabaseAuthId: string,
  email: string,
  dashboardType: DashboardType,
  resourceType?: string
): Promise<boolean> {
  return canPerformActionByAuth(supabaseAuthId, email, dashboardType, "CREATE", resourceType);
}

/**
 * Check if user can delete a specific resource type in a dashboard
 */
export async function canDeleteResource(
  supabaseAuthId: string,
  email: string,
  dashboardType: DashboardType,
  resourceType?: string
): Promise<boolean> {
  return canPerformActionByAuth(supabaseAuthId, email, dashboardType, "DELETE", resourceType);
}

/**
 * Check if user can cancel a resource (order, ride, etc.)
 */
export async function canCancelResource(
  supabaseAuthId: string,
  email: string,
  dashboardType: DashboardType,
  resourceType?: string
): Promise<boolean> {
  return canPerformActionByAuth(supabaseAuthId, email, dashboardType, "CANCEL", resourceType);
}

/**
 * Check if user can refund a resource
 */
export async function canRefundResource(
  supabaseAuthId: string,
  email: string,
  dashboardType: DashboardType,
  resourceType?: string
): Promise<boolean> {
  return canPerformActionByAuth(supabaseAuthId, email, dashboardType, "REFUND", resourceType);
}

/**
 * Check if user can assign a resource (ticket, rider, etc.)
 */
export async function canAssignResource(
  supabaseAuthId: string,
  email: string,
  dashboardType: DashboardType,
  resourceType?: string,
  context?: Record<string, any>
): Promise<boolean> {
  return canPerformActionByAuth(supabaseAuthId, email, dashboardType, "ASSIGN", resourceType, context);
}

/**
 * Check if user can block/unblock a resource
 */
export async function canBlockResource(
  supabaseAuthId: string,
  email: string,
  dashboardType: DashboardType,
  resourceType?: string
): Promise<boolean> {
  return canPerformActionByAuth(supabaseAuthId, email, dashboardType, "BLOCK", resourceType);
}

/**
 * Check if user can approve a resource
 */
export async function canApproveResource(
  supabaseAuthId: string,
  email: string,
  dashboardType: DashboardType,
  resourceType?: string
): Promise<boolean> {
  return canPerformActionByAuth(supabaseAuthId, email, dashboardType, "APPROVE", resourceType);
}

/**
 * Check if user can access ticket by category and type
 */
export async function canAccessTicket(
  supabaseAuthId: string,
  email: string,
  ticketCategory: "MERCHANT" | "CUSTOMER" | "RIDER" | "OTHER",
  ticketType?: "ORDER_RELATED" | "NON_ORDER_RELATED",
  action: ActionType = "VIEW"
): Promise<boolean> {
  const context: Record<string, any> = {
    ticket_category: ticketCategory,
  };
  
  if (ticketType) {
    context.ticket_type = ticketType;
  }
  
  return canPerformActionByAuth(
    supabaseAuthId,
    email,
    "TICKET",
    action,
    "TICKET",
    context
  );
}

/**
 * ORDER-SPECIFIC PERMISSION CHECKS
 * These functions check specific ORDER access point groups
 */

/**
 * Check if user can cancel a ride (requires ORDER_CANCEL_ASSIGN access point)
 */
export async function canCancelRide(
  supabaseAuthId: string,
  email: string
): Promise<boolean> {
  return canPerformActionByAuth(
    supabaseAuthId,
    email,
    "ORDER",
    "CANCEL",
    "RIDE",
    undefined,
    { access_point_group: "ORDER_CANCEL_ASSIGN" }
  );
}

/**
 * Check if user can assign a rider to an order (requires ORDER_CANCEL_ASSIGN access point)
 */
export async function canAssignRider(
  supabaseAuthId: string,
  email: string
): Promise<boolean> {
  return canPerformActionByAuth(
    supabaseAuthId,
    email,
    "ORDER",
    "ASSIGN",
    "RIDER",
    undefined,
    { access_point_group: "ORDER_CANCEL_ASSIGN" }
  );
}

/**
 * Check if user can add remark to an order (requires ORDER_CANCEL_ASSIGN access point)
 */
export async function canAddOrderRemark(
  supabaseAuthId: string,
  email: string
): Promise<boolean> {
  return canPerformActionByAuth(
    supabaseAuthId,
    email,
    "ORDER",
    "UPDATE",
    "ORDER",
    undefined,
    { access_point_group: "ORDER_CANCEL_ASSIGN" }
  );
}

/**
 * Check if user can refund an order (requires ORDER_REFUND_DELIVER access point)
 */
export async function canRefundOrder(
  supabaseAuthId: string,
  email: string
): Promise<boolean> {
  return canPerformActionByAuth(
    supabaseAuthId,
    email,
    "ORDER",
    "REFUND",
    "ORDER",
    undefined,
    { access_point_group: "ORDER_REFUND_DELIVER" }
  );
}

/**
 * Check if user can update deliver status (requires ORDER_REFUND_DELIVER access point)
 */
export async function canUpdateDeliver(
  supabaseAuthId: string,
  email: string
): Promise<boolean> {
  return canPerformActionByAuth(
    supabaseAuthId,
    email,
    "ORDER",
    "UPDATE",
    "ORDER",
    undefined,
    { access_point_group: "ORDER_REFUND_DELIVER" }
  );
}

/**
 * Check if user can cancel order with refund (requires ORDER_REFUND_DELIVER access point)
 */
export async function canCancelOrderWithRefund(
  supabaseAuthId: string,
  email: string
): Promise<boolean> {
  return canPerformActionByAuth(
    supabaseAuthId,
    email,
    "ORDER",
    "CANCEL",
    "ORDER",
    undefined,
    { access_point_group: "ORDER_REFUND_DELIVER" }
  );
}
