/**
 * Merchant-specific permission checker.
 *
 * Reads `merchant_management_access` (can_* columns) and `dashboard_access_points`
 * to determine what a specific agent can do within the MERCHANT dashboard.
 *
 * SUPER_ADMIN and ADMIN bypass all checks.
 * Normal agents are restricted by their merchant_management_access row.
 *
 * Every mutation route in the merchant dashboard MUST call one of these functions
 * before performing the action. All denied attempts are logged to action_audit_log.
 */

import { getSql } from "../db/client";
import { isSuperAdmin, getUserPermissions } from "./engine";
import { getSystemUserByEmail, getSystemUserByAuthId } from "../auth/user-mapping";
import { logAction, type ActionLogData } from "../audit/logger";

export interface MerchantAccess {
  systemUserId: number;
  agentEmail: string;
  agentName: string | null;
  agentRole: string;
  isSuperAdmin: boolean;
  isAdmin: boolean;

  // View
  can_view_all_merchants: boolean;
  can_view_assigned_merchants: boolean;
  can_view_financial: boolean;
  can_view_documents: boolean;

  // Onboarding
  can_update_onboarding: boolean;
  can_approve_documents: boolean;
  can_reject_documents: boolean;
  can_approve_store: boolean;
  can_reject_store: boolean;

  // Store management
  can_update_store_details: boolean;
  can_update_store_timing: boolean;
  can_update_store_availability: boolean;
  can_delist_store: boolean;
  can_relist_store: boolean;
  can_block_store: boolean;
  can_unblock_store: boolean;

  // Menu
  can_view_menu: boolean;
  can_update_menu: boolean;
  can_update_pricing: boolean;
  can_update_customizations: boolean;
  can_update_offers: boolean;

  // Financial
  can_update_bank_details: boolean;
  can_approve_payout: boolean;
  can_adjust_commission: boolean;

  // Order
  can_manage_store_orders: boolean;

  // Limits
  payout_approval_limit: number;

  // Wallet credit/debit requests (agents can request, only admin/superadmin approve)
  can_request_wallet_adjustment: boolean;
  can_approve_wallet_adjustment: boolean;
}

const DEFAULT_ACCESS: Omit<MerchantAccess, "systemUserId" | "agentEmail" | "agentName" | "agentRole" | "isSuperAdmin" | "isAdmin"> = {
  can_view_all_merchants: false,
  can_view_assigned_merchants: true,
  can_view_financial: false,
  can_view_documents: false,
  can_update_onboarding: false,
  can_approve_documents: false,
  can_reject_documents: false,
  can_approve_store: false,
  can_reject_store: false,
  can_update_store_details: false,
  can_update_store_timing: false,
  can_update_store_availability: false,
  can_delist_store: false,
  can_relist_store: false,
  can_block_store: false,
  can_unblock_store: false,
  can_view_menu: true,
  can_update_menu: false,
  can_update_pricing: false,
  can_update_customizations: false,
  can_update_offers: false,
  can_update_bank_details: false,
  can_approve_payout: false,
  can_adjust_commission: false,
  can_manage_store_orders: false,
  payout_approval_limit: 0,
  can_request_wallet_adjustment: false,
  can_approve_wallet_adjustment: false,
};

/**
 * Get full merchant access permissions for an agent.
 * Returns null if user is not authenticated or has no MERCHANT dashboard access.
 */
export async function getMerchantAccess(
  supabaseAuthId: string,
  email: string
): Promise<MerchantAccess | null> {
  const userPerms = await getUserPermissions(supabaseAuthId, email);
  if (!userPerms) return null;

  let systemUser = await getSystemUserByAuthId(supabaseAuthId);
  if (!systemUser) systemUser = await getSystemUserByEmail(email);
  if (!systemUser) return null;

  const superAdmin = userPerms.isSuperAdmin;
  const isAdmin = (systemUser as any).primary_role === "ADMIN";

  // Super admins and admins get full access
  if (superAdmin || isAdmin) {
    const fullAccess: MerchantAccess = {
      systemUserId: systemUser.id,
      agentEmail: email,
      agentName: (systemUser as any).full_name ?? (systemUser as any).fullName ?? null,
      agentRole: (systemUser as any).primary_role ?? "SUPER_ADMIN",
      isSuperAdmin: superAdmin,
      isAdmin,
      can_view_all_merchants: true,
      can_view_assigned_merchants: true,
      can_view_financial: true,
      can_view_documents: true,
      can_update_onboarding: true,
      can_approve_documents: true,
      can_reject_documents: true,
      can_approve_store: true,
      can_reject_store: true,
      can_update_store_details: true,
      can_update_store_timing: true,
      can_update_store_availability: true,
      can_delist_store: true,
      can_relist_store: true,
      can_block_store: true,
      can_unblock_store: true,
      can_view_menu: true,
      can_update_menu: true,
      can_update_pricing: true,
      can_update_customizations: true,
      can_update_offers: true,
      can_update_bank_details: true,
      can_approve_payout: true,
      can_adjust_commission: true,
      can_manage_store_orders: true,
      payout_approval_limit: 999999999,
      can_request_wallet_adjustment: true,
      can_approve_wallet_adjustment: true,
    };
    return fullAccess;
  }

  // Read from merchant_management_access table
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM merchant_management_access
    WHERE system_user_id = ${systemUser.id}
    LIMIT 1
  `;

  const row = (rows as any[])[0];
  const b = (val: any) => val === true || val === "true";
  const n = (val: any) => Number(val ?? 0);

  const access: MerchantAccess = {
    systemUserId: systemUser.id,
    agentEmail: email,
    agentName: (systemUser as any).full_name ?? (systemUser as any).fullName ?? null,
    agentRole: (systemUser as any).primary_role ?? "AGENT",
    isSuperAdmin: false,
    isAdmin: false,
    can_view_all_merchants: row ? b(row.can_view_all_merchants) : DEFAULT_ACCESS.can_view_all_merchants,
    can_view_assigned_merchants: row ? b(row.can_view_assigned_merchants) : DEFAULT_ACCESS.can_view_assigned_merchants,
    can_view_financial: row ? b(row.can_view_financial) : DEFAULT_ACCESS.can_view_financial,
    can_view_documents: row ? b(row.can_view_documents) : DEFAULT_ACCESS.can_view_documents,
    can_update_onboarding: row ? b(row.can_update_onboarding) : DEFAULT_ACCESS.can_update_onboarding,
    can_approve_documents: row ? b(row.can_approve_documents) : DEFAULT_ACCESS.can_approve_documents,
    can_reject_documents: row ? b(row.can_reject_documents) : DEFAULT_ACCESS.can_reject_documents,
    can_approve_store: row ? b(row.can_approve_store) : DEFAULT_ACCESS.can_approve_store,
    can_reject_store: row ? b(row.can_reject_store) : DEFAULT_ACCESS.can_reject_store,
    can_update_store_details: row ? b(row.can_update_store_details) : DEFAULT_ACCESS.can_update_store_details,
    can_update_store_timing: row ? b(row.can_update_store_timing) : DEFAULT_ACCESS.can_update_store_timing,
    can_update_store_availability: row ? b(row.can_update_store_availability) : DEFAULT_ACCESS.can_update_store_availability,
    can_delist_store: row ? b(row.can_delist_store) : DEFAULT_ACCESS.can_delist_store,
    can_relist_store: row ? b(row.can_relist_store) : DEFAULT_ACCESS.can_relist_store,
    can_block_store: row ? b(row.can_block_store) : DEFAULT_ACCESS.can_block_store,
    can_unblock_store: row ? b(row.can_unblock_store) : DEFAULT_ACCESS.can_unblock_store,
    can_view_menu: row ? b(row.can_view_menu) : DEFAULT_ACCESS.can_view_menu,
    can_update_menu: row ? b(row.can_update_menu) : DEFAULT_ACCESS.can_update_menu,
    can_update_pricing: row ? b(row.can_update_pricing) : DEFAULT_ACCESS.can_update_pricing,
    can_update_customizations: row ? b(row.can_update_customizations) : DEFAULT_ACCESS.can_update_customizations,
    can_update_offers: row ? b(row.can_update_offers) : DEFAULT_ACCESS.can_update_offers,
    can_update_bank_details: row ? b(row.can_update_bank_details) : DEFAULT_ACCESS.can_update_bank_details,
    can_approve_payout: row ? b(row.can_approve_payout) : DEFAULT_ACCESS.can_approve_payout,
    can_adjust_commission: row ? b(row.can_adjust_commission) : DEFAULT_ACCESS.can_adjust_commission,
    can_manage_store_orders: row ? b(row.can_manage_store_orders) : DEFAULT_ACCESS.can_manage_store_orders,
    payout_approval_limit: row ? n(row.payout_approval_limit) : DEFAULT_ACCESS.payout_approval_limit,
    can_request_wallet_adjustment: row ? b(row.can_request_wallet_adjustment) : DEFAULT_ACCESS.can_request_wallet_adjustment,
    can_approve_wallet_adjustment: false,
  };

  return access;
}

/**
 * Assert a specific permission. Returns the access object on success, throws on failure.
 * Automatically logs denied attempts to the audit log.
 */
export async function requireMerchantPermission(
  supabaseAuthId: string,
  email: string,
  permission: keyof Omit<MerchantAccess, "systemUserId" | "agentEmail" | "agentName" | "agentRole" | "isSuperAdmin" | "isAdmin" | "payout_approval_limit">,
  context?: { storeId?: number; resourceType?: string; resourceId?: string; requestPath?: string; requestMethod?: string; ip?: string; ua?: string }
): Promise<MerchantAccess> {
  const access = await getMerchantAccess(supabaseAuthId, email);

  if (!access) {
    await logAction({
      agentId: 0,
      agentEmail: email,
      dashboardType: "MERCHANT",
      actionType: "VIEW",
      actionStatus: "FAILED",
      errorMessage: "No merchant access",
      resourceType: context?.resourceType,
      resourceId: context?.resourceId,
      requestPath: context?.requestPath,
      requestMethod: context?.requestMethod,
      ipAddress: context?.ip,
      userAgent: context?.ua,
    });
    throw new PermissionDeniedError("Merchant dashboard access required");
  }

  if (!access[permission]) {
    await logAction({
      agentId: access.systemUserId,
      agentEmail: email,
      agentName: access.agentName ?? undefined,
      agentRole: access.agentRole,
      dashboardType: "MERCHANT",
      actionType: "UPDATE",
      actionStatus: "FAILED",
      errorMessage: `Permission denied: ${permission}`,
      resourceType: context?.resourceType,
      resourceId: context?.resourceId,
      requestPath: context?.requestPath,
      requestMethod: context?.requestMethod,
      ipAddress: context?.ip,
      userAgent: context?.ua,
    });
    throw new PermissionDeniedError(`You do not have permission: ${permission}`);
  }

  return access;
}

export class PermissionDeniedError extends Error {
  public readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}
