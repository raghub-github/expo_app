/**
 * GET  /api/merchant/stores/[id]/status — current store status info
 * PATCH /api/merchant/stores/[id]/status — update store approval_status
 *
 * Allowed transitions (by permitted agents):
 *   APPROVED → SUSPENDED, BLOCKED, REJECTED, DELISTED
 *   SUSPENDED → APPROVED (restore)
 *   BLOCKED → APPROVED (restore)
 *   REJECTED → APPROVED (re-approve)
 *   DELISTED → APPROVED (re-list)
 *
 * Permission required: can_block_store / can_unblock_store / can_delist_store / can_relist_store
 * All changes are logged to merchant_store_status_history (via DB trigger) AND action_audit_log.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMerchantAccess, requireMerchantPermission, PermissionDeniedError } from "@/lib/permissions/merchant-access";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { logActionByAuth, getIpAddress, getUserAgent } from "@/lib/audit/logger";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

const VALID_STATUSES = ["APPROVED", "REJECTED", "BLOCKED", "SUSPENDED", "DELISTED"] as const;
type StoreApprovalStatus = typeof VALID_STATUSES[number];

const DEACTIVATING_STATUSES: StoreApprovalStatus[] = ["BLOCKED", "SUSPENDED", "REJECTED", "DELISTED"];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const access = await getMerchantAccess(user.id, user.email);
    if (!access) {
      return NextResponse.json({ success: false, error: "Merchant access required" }, { status: 403 });
    }

    const sql = getSql();
    const [store] = await sql`
      SELECT id, store_id, store_name, approval_status, operational_status,
             status, is_active, is_accepting_orders, is_available,
             parent_id, deleted_at, delisted_at, delist_reason
      FROM merchant_stores WHERE id = ${storeId}
    `;
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const history = await sql`
      SELECT id, from_approval_status, to_approval_status, change_reason, change_notes,
             changed_by, changed_by_id, changed_by_name, created_at
      FROM merchant_store_status_history
      WHERE store_id = ${storeId}
      ORDER BY created_at DESC
      LIMIT 20
    `;

    return NextResponse.json({ success: true, store, history });
  } catch (e) {
    console.error("[GET store/status]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const ip = getIpAddress(request);
    const ua = getUserAgent(request);
    const sql = getSql();

    const access = await getMerchantAccess(user.id, user.email);
    if (!access) {
      return NextResponse.json({ success: false, error: "Merchant access required" }, { status: 403 });
    }

    const body = await request.json();
    const newStatus = String(body.status ?? "").toUpperCase() as StoreApprovalStatus;
    const reason = String(body.reason ?? "").trim();

    if (!VALID_STATUSES.includes(newStatus)) {
      return NextResponse.json({ success: false, error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
    }
    if (!reason || reason.length < 5) {
      return NextResponse.json({ success: false, error: "reason is required (min 5 characters)" }, { status: 400 });
    }

    // Fetch current store
    const [store] = await sql`
      SELECT id, approval_status, operational_status, is_active FROM merchant_stores WHERE id = ${storeId}
    `;
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }
    const currentStatus = String((store as any).approval_status);

    if (currentStatus === newStatus) {
      return NextResponse.json({ success: false, error: `Store is already ${newStatus}` }, { status: 400 });
    }

    // Permission checks based on the action
    const isDeactivating = DEACTIVATING_STATUSES.includes(newStatus);
    const isReactivating = newStatus === "APPROVED";

    if (isDeactivating) {
      if (newStatus === "DELISTED" && !access.can_delist_store) {
        return denyResponse("can_delist_store", access, user, ip, ua);
      }
      if ((newStatus === "BLOCKED" || newStatus === "SUSPENDED") && !access.can_block_store) {
        return denyResponse("can_block_store", access, user, ip, ua);
      }
      if (newStatus === "REJECTED" && !access.can_reject_store) {
        return denyResponse("can_reject_store", access, user, ip, ua);
      }
    }
    if (isReactivating) {
      if (currentStatus === "DELISTED" && !access.can_relist_store) {
        return denyResponse("can_relist_store", access, user, ip, ua);
      }
      if ((currentStatus === "BLOCKED" || currentStatus === "SUSPENDED") && !access.can_unblock_store) {
        return denyResponse("can_unblock_store", access, user, ip, ua);
      }
      if (currentStatus === "REJECTED" && !access.can_approve_store) {
        return denyResponse("can_approve_store", access, user, ip, ua);
      }
    }

    // Execute update — the existing DB trigger will create status history
    const newOperational = isDeactivating ? "CLOSED" : (store as any).operational_status;
    const newIsActive = !isDeactivating;

    await sql`
      UPDATE merchant_stores
      SET approval_status = ${newStatus}::store_approval_status,
          operational_status = ${newOperational}::store_operational_status,
          is_active = ${newIsActive},
          updated_at = NOW()
      WHERE id = ${storeId}
    `;

    // The DB trigger handles merchant_store_status_history insertion.
    // Also manually insert a record with the agent info for richer audit.
    await sql`
      INSERT INTO merchant_store_status_history (
        store_id, from_approval_status, to_approval_status,
        change_reason, changed_by, changed_by_id, changed_by_name, status_metadata
      ) VALUES (
        ${storeId}, ${currentStatus}::store_approval_status, ${newStatus}::store_approval_status,
        ${reason}, 'AGENT', ${access.systemUserId}::text, ${access.agentName ?? access.agentEmail},
        ${JSON.stringify({ ip, ua, agent_role: access.agentRole })}::jsonb
      )
    `;

    await logActionByAuth(user.id, user.email, "MERCHANT", "UPDATE", {
      resourceType: "MERCHANT_STORE_STATUS",
      resourceId: String(storeId),
      previousValues: { approval_status: currentStatus },
      newValues: { approval_status: newStatus, reason },
      ipAddress: ip,
      userAgent: ua,
      requestPath: request.nextUrl.pathname,
      requestMethod: "PATCH",
    });

    return NextResponse.json({
      success: true,
      previous_status: currentStatus,
      new_status: newStatus,
      reason,
    });
  } catch (e) {
    console.error("[PATCH store/status]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

async function denyResponse(
  permission: string,
  access: any,
  user: any,
  ip: string | undefined,
  ua: string | undefined
) {
  await logActionByAuth(user.id, user.email, "MERCHANT", "UPDATE", {
    resourceType: "MERCHANT_STORE_STATUS",
    actionStatus: "FAILED",
    errorMessage: `Permission denied: ${permission}`,
    ipAddress: ip,
    userAgent: ua,
  });
  return NextResponse.json({
    success: false,
    error: `You do not have permission: ${permission}`,
  }, { status: 403 });
}
