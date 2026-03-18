/**
 * DELETE /api/merchant/stores/[id]/media/delete-menu
 * Remove a MENU_REFERENCE media file for a store and delete from R2.
 *
 * Body: { fileId?: number; r2Key?: string }
 * If neither fileId nor r2Key is provided, all MENU_REFERENCE files for this store are deleted.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { deleteDocument } from "@/lib/services/r2";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json(
        { success: false, error: "Invalid store id" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json(
        { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
        { status: 401 }
      );
    }

    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Merchant dashboard access required",
          code: "MERCHANT_ACCESS_REQUIRED",
        },
        { status: 403 }
      );
    }

    let areaManagerId: number | null = null;
    if (!(await isSuperAdmin(user.id, user.email))) {
      const systemUser = await getSystemUserByEmail(user.email);
      if (systemUser) {
        const am = await getAreaManagerByUserId(systemUser.id);
        if (am) areaManagerId = am.id;
      }
    }

    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json(
        { success: false, error: "Store not found" },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const fileId = body?.fileId != null ? Number(body.fileId) : null;
    const bodyKey =
      typeof body?.r2Key === "string" && body.r2Key.trim()
        ? (body.r2Key as string)
        : null;

    const sql = getSql();
    // parent_id is needed to clear step3 in merchant_store_registration_progress
    const parentId: number | null =
      typeof store.parent_id === "number" && Number.isFinite(store.parent_id)
        ? (store.parent_id as number)
        : null;

    // If no identifiers provided: delete ALL MENU_REFERENCE media for this store.
    if (!bodyKey && (!fileId || !Number.isFinite(fileId))) {
      const rows = await sql`
        SELECT r2_key
        FROM merchant_store_media_files
        WHERE store_id = ${storeId}
          AND media_scope = 'MENU_REFERENCE'
      `;
      const allRows = Array.isArray(rows) ? rows : rows ? [rows] : [];
      for (const row of allRows as { r2_key: string | null }[]) {
        if (!row.r2_key) continue;
        try {
          await deleteDocument(row.r2_key);
        } catch (e) {
          console.warn(
            "[DELETE /api/merchant/stores/[id]/media/delete-menu] R2 delete failed for key:",
            row.r2_key,
            e
          );
        }
      }
      await sql`
        DELETE FROM merchant_store_media_files
        WHERE store_id = ${storeId}
          AND media_scope = 'MENU_REFERENCE'
      `;

      if (parentId != null) {
        await sql`
          UPDATE merchant_store_registration_progress
          SET form_data = COALESCE(form_data, '{}'::jsonb) - 'step3',
              current_step = LEAST(current_step, 2),
              updated_at = NOW()
          WHERE parent_id = ${parentId}
            AND store_id = ${storeId}
        `;
      }
    } else {
      let r2Key: string | null = bodyKey;

      if (!r2Key) {
        const rows = await sql`
          SELECT id, r2_key
          FROM merchant_store_media_files
          WHERE id = ${fileId}
            AND store_id = ${storeId}
            AND media_scope = 'MENU_REFERENCE'
            AND deleted_at IS NULL
        `;
        const row = Array.isArray(rows) ? rows[0] : rows;
        if (!row) {
          return NextResponse.json(
            { success: false, error: "File not found" },
            { status: 404 }
          );
        }
        r2Key = String(row.r2_key);
      }

      try {
        await deleteDocument(r2Key!);
      } catch (e) {
        console.warn(
          "[DELETE /api/merchant/stores/[id]/media/delete-menu] R2 delete failed:",
          e
        );
      }

      await sql`
        DELETE FROM merchant_store_media_files
        WHERE store_id = ${storeId}
          AND media_scope = 'MENU_REFERENCE'
          AND r2_key = ${r2Key}
      `;

      if (parentId != null) {
        await sql`
          UPDATE merchant_store_registration_progress
          SET form_data = COALESCE(form_data, '{}'::jsonb) - 'step3',
              current_step = LEAST(current_step, 2),
              updated_at = NOW()
          WHERE parent_id = ${parentId}
            AND store_id = ${storeId}
        `;
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(
      "[DELETE /api/merchant/stores/[id]/media/delete-menu]",
      e
    );
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
}

