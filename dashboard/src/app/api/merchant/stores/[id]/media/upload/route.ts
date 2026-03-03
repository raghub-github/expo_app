/**
 * POST /api/merchant/stores/[id]/media/upload
 * Upload menu file (image, CSV, XLS) to R2 and register in merchant_store_media_files.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { uploadWithKey } from "@/lib/services/r2";

export const runtime = "nodejs";

const MAX_MENU_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "file";
}

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto === "https" ? "https" : "http"}://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";
}

export async function POST(
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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    if (file.size > MAX_MENU_FILE_BYTES) {
      return NextResponse.json(
        { success: false, error: "File too large (max 15 MB)" },
        { status: 400 }
      );
    }

    const parentId = store.parent_id ?? store.id;
    const storeIdStr = String(store.store_id || storeId);
    const timestamp = Date.now();
    const safeName = sanitizeFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const r2Key = `merchants/${parentId}/stores/${storeIdStr}/menu/${timestamp}_${safeName}`;

    await uploadWithKey(file, r2Key);

    const baseUrl = getBaseUrl(request);
    const publicUrl = `${baseUrl}/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;

    let insertedId: number | null = null;
    try {
      const sql = getSql();
      // Always replace: soft-delete existing MENU_REFERENCE for this store to avoid duplicates
      await sql`
        UPDATE merchant_store_media_files
        SET deleted_at = now(), is_active = false, updated_at = now()
        WHERE store_id = ${storeId}
          AND media_scope = 'MENU_REFERENCE'
          AND (deleted_at IS NULL)
      `;
      const inserted = await sql`
        INSERT INTO merchant_store_media_files (
          store_id, media_scope, original_file_name, r2_key, public_url,
          mime_type, file_size_bytes, version_no, is_active, verification_status
        )
        VALUES (
          ${storeId},
          'MENU_REFERENCE',
          ${file.name},
          ${r2Key},
          ${publicUrl},
          ${file.type || null},
          ${file.size},
          1,
          true,
          'PENDING'
        )
        RETURNING id, store_id, media_scope, original_file_name, r2_key, public_url,
                  mime_type, file_size_bytes, verification_status, created_at
      `;
      const row = Array.isArray(inserted) ? inserted[0] : inserted;
      if (row) {
        insertedId = Number(row.id);
      }
    } catch (e) {
      console.error("[POST /api/merchant/stores/[id]/media/upload] insert failed:", e);
      return NextResponse.json(
        { success: false, error: "Upload succeeded but failed to save record. Table merchant_store_media_files may not exist." },
        { status: 500 }
      );
    }

    const created = insertedId != null ? {
      id: insertedId,
      store_id: storeId,
      media_scope: "MENU_REFERENCE",
      original_file_name: file.name,
      r2_key: r2Key,
      public_url: publicUrl,
      mime_type: file.type || null,
      file_size_bytes: file.size,
      verification_status: "PENDING",
      created_at: new Date().toISOString(),
    } : null;

    return NextResponse.json({
      success: true,
      file: created,
      message: "File uploaded and saved.",
    });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/media/upload]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
}
