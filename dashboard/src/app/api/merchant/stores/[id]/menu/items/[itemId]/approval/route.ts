/**
 * PATCH /api/merchant/stores/[id]/menu/items/[itemId]/approval
 * Body: { approval_status: "APPROVED" | "REJECTED" | "PENDING", rejection_reason?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { insertActivityLog } from "@/lib/db/operations/merchant-portal-activity-logs";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const storeId = parseInt(id, 10);
    const menuItemId = parseInt(itemId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(menuItemId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Agent or admin access required" }, { status: 403 });
    }

    const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as {
      approval_status?: string;
      rejection_reason?: string | null;
    };
    const st = body.approval_status;
    if (st !== "APPROVED" && st !== "REJECTED" && st !== "PENDING") {
      return NextResponse.json({ success: false, error: "approval_status required" }, { status: 400 });
    }

    const rejectionReason = st === "REJECTED" ? (body.rejection_reason?.trim() || null) : null;
    if (st === "REJECTED" && (!rejectionReason || rejectionReason.length < 3)) {
      return NextResponse.json(
        { success: false, error: "rejection_reason is required when rejecting (min 3 characters)" },
        { status: 400 }
      );
    }

    const sql = getSql();
    const [prev] = await sql`
      SELECT item_name, approval_status::text AS approval_status, approved_at, approved_by
      FROM merchant_menu_items WHERE id = ${menuItemId} AND store_id = ${storeId}
    `;
    if (!prev) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });

    const previousStatus = (prev as { approval_status?: string }).approval_status ?? null;
    let newStatus = st;
    let restoredPreviousPhoto = false;

    if (st === "APPROVED") {
      const result = await sql`
        UPDATE merchant_menu_items
        SET approval_status = 'APPROVED'::merchant_menu_item_approval_status,
            approved_at = NOW(),
            approved_by = ${user.email},
            rejection_reason = NULL,
            updated_at = NOW()
        WHERE id = ${menuItemId} AND store_id = ${storeId}
      `;
      if ((result.count ?? 0) === 0) {
        return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
      }
      // Clear every pending image for this item so Image Review queue empties.
      await sql`
        UPDATE merchant_menu_item_images
        SET moderation_status = 'APPROVED',
            rejection_reason = NULL,
            moderated_at = NOW(),
            moderated_by = ${user.email},
            updated_at = NOW()
        WHERE menu_item_id = ${menuItemId}
          AND is_primary = true
      `;
      await sql`
        UPDATE merchant_menu_item_images
        SET moderation_status = 'REJECTED',
            rejection_reason = COALESCE(NULLIF(TRIM(rejection_reason), ''), 'Superseded by approved primary'),
            moderated_at = NOW(),
            moderated_by = ${user.email},
            updated_at = NOW()
        WHERE menu_item_id = ${menuItemId}
          AND is_primary = false
          AND UPPER(TRIM(COALESCE(moderation_status, 'PENDING'))) = 'PENDING'
      `;
    } else if (st === "REJECTED") {
      const [primaryImg] = await sql`
        SELECT id, image_url
        FROM merchant_menu_item_images
        WHERE menu_item_id = ${menuItemId} AND is_primary = true
        LIMIT 1
      `;
      const primaryId = primaryImg ? Number((primaryImg as { id: number }).id) : null;

      const [prevApproved] = primaryId
        ? await sql`
            SELECT id, image_url
            FROM merchant_menu_item_images
            WHERE menu_item_id = ${menuItemId}
              AND id != ${primaryId}
              AND UPPER(TRIM(COALESCE(moderation_status, ''))) = 'APPROVED'
            ORDER BY created_at DESC, id DESC
            LIMIT 1
          `
        : await sql`
            SELECT id, image_url
            FROM merchant_menu_item_images
            WHERE menu_item_id = ${menuItemId}
              AND UPPER(TRIM(COALESCE(moderation_status, ''))) = 'APPROVED'
            ORDER BY created_at DESC, id DESC
            LIMIT 1
          `;

      // Keep the rejected upload as primary so Partner / Merchant portals show
      // the new rejected photo (not the older approved one). Customers still get
      // the previous approved URL via item_image_url when one exists.
      if (primaryId) {
        await sql`
          UPDATE merchant_menu_item_images
          SET moderation_status = 'REJECTED',
              rejection_reason = ${rejectionReason},
              moderated_at = NOW(),
              moderated_by = ${user.email},
              updated_at = NOW()
          WHERE id = ${primaryId}
        `;
      } else {
        await sql`
          UPDATE merchant_menu_item_images
          SET moderation_status = 'REJECTED',
              rejection_reason = ${rejectionReason},
              moderated_at = NOW(),
              moderated_by = ${user.email},
              updated_at = NOW()
          WHERE menu_item_id = ${menuItemId} AND is_primary = true
        `;
      }
      // Also clear any other PENDING images so they cannot keep the item in Image Review.
      await sql`
        UPDATE merchant_menu_item_images
        SET moderation_status = 'REJECTED',
            rejection_reason = COALESCE(NULLIF(TRIM(rejection_reason), ''), ${rejectionReason}),
            moderated_at = NOW(),
            moderated_by = ${user.email},
            updated_at = NOW()
        WHERE menu_item_id = ${menuItemId}
          AND UPPER(TRIM(COALESCE(moderation_status, 'PENDING'))) = 'PENDING'
      `;

      const customerImageUrl = prevApproved
        ? String((prevApproved as { image_url: string }).image_url)
        : null;
      const keepApproved = previousStatus === "APPROVED";
      const prevApprovedAt = (prev as { approved_at?: string | null }).approved_at ?? null;
      const prevApprovedBy = (prev as { approved_by?: string | null }).approved_by ?? null;

      let result;
      if (customerImageUrl && keepApproved) {
        result = await sql`
          UPDATE merchant_menu_items
          SET approval_status = 'APPROVED'::merchant_menu_item_approval_status,
              item_image_url = ${customerImageUrl},
              rejection_reason = ${rejectionReason},
              approved_at = COALESCE(${prevApprovedAt}, approved_at, NOW()),
              approved_by = COALESCE(${prevApprovedBy}, approved_by, ${user.email}),
              updated_at = NOW()
          WHERE id = ${menuItemId} AND store_id = ${storeId}
        `;
        newStatus = "APPROVED";
        restoredPreviousPhoto = true;
      } else if (customerImageUrl) {
        result = await sql`
          UPDATE merchant_menu_items
          SET item_image_url = ${customerImageUrl},
              rejection_reason = ${rejectionReason},
              updated_at = NOW()
          WHERE id = ${menuItemId} AND store_id = ${storeId}
        `;
        newStatus = previousStatus ?? "PENDING";
        restoredPreviousPhoto = true;
      } else {
        result = await sql`
          UPDATE merchant_menu_items
          SET rejection_reason = ${rejectionReason},
              updated_at = NOW()
          WHERE id = ${menuItemId} AND store_id = ${storeId}
        `;
        newStatus = previousStatus ?? "PENDING";
      }
      if ((result.count ?? 0) === 0) {
        return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
      }
    } else {
      const result = await sql`
        UPDATE merchant_menu_items
        SET approval_status = 'PENDING'::merchant_menu_item_approval_status,
            approved_at = NULL,
            approved_by = NULL,
            rejection_reason = NULL,
            updated_at = NOW()
        WHERE id = ${menuItemId} AND store_id = ${storeId}
      `;
      if ((result.count ?? 0) === 0) {
        return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
      }
      await sql`
        UPDATE merchant_menu_item_images
        SET moderation_status = 'PENDING',
            rejection_reason = NULL,
            moderated_at = NULL,
            moderated_by = NULL,
            updated_at = NOW()
        WHERE menu_item_id = ${menuItemId} AND is_primary = true
      `;
    }

    try {
      await sql`
        INSERT INTO merchant_menu_item_approval_log (menu_item_id, previous_status, new_status, changed_by, changed_by_role, note)
        VALUES (
          ${menuItemId},
          ${previousStatus},
          ${newStatus},
          ${user.email},
          'agent',
          ${st === "REJECTED" ? rejectionReason : null}
        )
      `;
    } catch {
      /* approval log optional */
    }

    const systemUser = await getSystemUserByEmail(user.email);
    const agentId = systemUser?.id ?? null;
    try {
      await insertActivityLog({
        storeId,
        agentId,
        changedSection: "menu_items",
        fieldName: "approval_status",
        oldValue: previousStatus,
        newValue: newStatus,
        actionType: "update",
      });
    } catch (_logErr) {}

    return NextResponse.json({
      success: true,
      ok: true,
      approval_status: newStatus,
      photo_rejected: st === "REJECTED",
      // Customers may still see previous approved URL; partner portals show rejected primary.
      restored_previous_photo: restoredPreviousPhoto,
    });
  } catch (e) {
    console.error("[PATCH /api/merchant/stores/[id]/menu/items/[itemId]/approval]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
