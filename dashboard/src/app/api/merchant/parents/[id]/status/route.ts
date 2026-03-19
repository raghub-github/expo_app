/**
 * GET  /api/merchant/parents/[id]/status — current parent merchant status + history
 * PATCH /api/merchant/parents/[id]/status — update parent approval_status
 *
 * When parent is BLOCKED or SUSPENDED → existing DB trigger auto-cascades to all child stores.
 * Only SUPER_ADMIN / ADMIN or agents with can_block_store can do this.
 *
 * All changes tracked in merchant_parent_status_history + action_audit_log.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMerchantAccess } from "@/lib/permissions/merchant-access";
import { logActionByAuth, getIpAddress, getUserAgent } from "@/lib/audit/logger";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

const VALID_PARENT_STATUSES = ["APPROVED", "REJECTED", "BLOCKED", "SUSPENDED"] as const;
type ParentApprovalStatus = typeof VALID_PARENT_STATUSES[number];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parentId = parseInt(id, 10);
    if (!Number.isFinite(parentId)) {
      return NextResponse.json({ success: false, error: "Invalid parent id" }, { status: 400 });
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
    const [parent] = await sql`
      SELECT id, parent_merchant_id, parent_name, approval_status, status,
             is_active, owner_name, owner_email, registered_phone, brand_name, city
      FROM merchant_parents WHERE id = ${parentId}
    `;
    if (!parent) {
      return NextResponse.json({ success: false, error: "Parent merchant not found" }, { status: 404 });
    }

    // Child stores count by status
    const childStats = await sql`
      SELECT approval_status, COUNT(*)::int AS count
      FROM merchant_stores
      WHERE parent_id = ${parentId} AND deleted_at IS NULL
      GROUP BY approval_status
    `;

    // Status history
    const history = await sql`
      SELECT id, from_approval_status, to_approval_status, change_reason, change_notes,
             changed_by_email, changed_by_name, created_at
      FROM merchant_parent_status_history
      WHERE parent_id = ${parentId}
      ORDER BY created_at DESC
      LIMIT 20
    `;

    return NextResponse.json({ success: true, parent, child_stats: childStats, history });
  } catch (e) {
    console.error("[GET parent/status]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parentId = parseInt(id, 10);
    if (!Number.isFinite(parentId)) {
      return NextResponse.json({ success: false, error: "Invalid parent id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const ip = getIpAddress(request);
    const ua = getUserAgent(request);

    const access = await getMerchantAccess(user.id, user.email);
    if (!access) {
      return NextResponse.json({ success: false, error: "Merchant access required" }, { status: 403 });
    }

    // Only super admin, admin, or agents with can_block_store can change parent status
    if (!access.isSuperAdmin && !access.isAdmin && !access.can_block_store) {
      await logActionByAuth(user.id, user.email, "MERCHANT", "UPDATE", {
        resourceType: "MERCHANT_PARENT_STATUS",
        resourceId: String(parentId),
        actionStatus: "FAILED",
        errorMessage: "Permission denied: can_block_store required for parent status changes",
        ipAddress: ip,
        userAgent: ua,
      });
      return NextResponse.json({
        success: false,
        error: "You do not have permission to change parent merchant status",
      }, { status: 403 });
    }

    const body = await request.json();
    const newStatus = String(body.status ?? "").toUpperCase() as ParentApprovalStatus;
    const reason = String(body.reason ?? "").trim();
    const notes = String(body.notes ?? "").trim();

    if (!VALID_PARENT_STATUSES.includes(newStatus)) {
      return NextResponse.json({ success: false, error: `Invalid status. Must be one of: ${VALID_PARENT_STATUSES.join(", ")}` }, { status: 400 });
    }
    if (!reason || reason.length < 5) {
      return NextResponse.json({ success: false, error: "reason is required (min 5 characters)" }, { status: 400 });
    }

    const sql = getSql();
    const [parent] = await sql`
      SELECT id, approval_status FROM merchant_parents WHERE id = ${parentId}
    `;
    if (!parent) {
      return NextResponse.json({ success: false, error: "Parent merchant not found" }, { status: 404 });
    }
    const currentStatus = String((parent as any).approval_status);

    if (currentStatus === newStatus) {
      return NextResponse.json({ success: false, error: `Parent is already ${newStatus}` }, { status: 400 });
    }

    // Count affected children (for info)
    const [childCount] = await sql`
      SELECT COUNT(*)::int AS count FROM merchant_stores
      WHERE parent_id = ${parentId} AND deleted_at IS NULL
    `;

    // Update parent — the existing cascade_parent_status_to_stores() trigger
    // will automatically SUSPEND all child stores if newStatus is BLOCKED or SUSPENDED
    await sql`
      UPDATE merchant_parents
      SET approval_status = ${newStatus}::parent_approval_status,
          is_active = ${newStatus === "APPROVED"},
          updated_at = NOW()
      WHERE id = ${parentId}
    `;

    // Record in parent status history
    await sql`
      INSERT INTO merchant_parent_status_history (
        parent_id, from_approval_status, to_approval_status,
        change_reason, change_notes,
        changed_by_system_user_id, changed_by_email, changed_by_name,
        status_metadata
      ) VALUES (
        ${parentId}, ${currentStatus}, ${newStatus},
        ${reason}, ${notes || null},
        ${access.systemUserId}, ${access.agentEmail}, ${access.agentName ?? access.agentEmail},
        ${JSON.stringify({
          ip, ua, agent_role: access.agentRole,
          affected_children: Number((childCount as any)?.count ?? 0),
        })}::jsonb
      )
    `;

    await logActionByAuth(user.id, user.email, "MERCHANT", "UPDATE", {
      resourceType: "MERCHANT_PARENT_STATUS",
      resourceId: String(parentId),
      previousValues: { approval_status: currentStatus },
      newValues: { approval_status: newStatus, reason, affected_children: Number((childCount as any)?.count ?? 0) },
      ipAddress: ip,
      userAgent: ua,
      requestPath: request.nextUrl.pathname,
      requestMethod: "PATCH",
    });

    const cascaded = ["BLOCKED", "SUSPENDED"].includes(newStatus);

    return NextResponse.json({
      success: true,
      previous_status: currentStatus,
      new_status: newStatus,
      reason,
      children_affected: cascaded ? Number((childCount as any)?.count ?? 0) : 0,
      cascade_applied: cascaded,
      cascade_note: cascaded
        ? `All ${(childCount as any)?.count ?? 0} child stores have been auto-suspended due to parent ${newStatus}`
        : undefined,
    });
  } catch (e) {
    console.error("[PATCH parent/status]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
