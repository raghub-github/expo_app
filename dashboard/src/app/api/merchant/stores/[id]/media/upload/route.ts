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
import { uploadWithKey, deleteDocument } from "@/lib/services/r2";

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
    const directFile = formData.get("file");
    const multiFiles = formData.getAll("files");
    const files: File[] = [];

    if (directFile instanceof File) {
      files.push(directFile);
    }
    for (const f of multiFiles) {
      if (f instanceof File) {
        files.push(f);
      }
    }

    const sourceEntityRaw = (formData.get("source_entity") as string) || "";
    const sourceEntity =
      sourceEntityRaw === "ONBOARDING_MENU_IMAGE" ||
      sourceEntityRaw === "ONBOARDING_MENU_PDF" ||
      sourceEntityRaw === "ONBOARDING_MENU_SHEET"
        ? sourceEntityRaw
        : "ONBOARDING_MENU_IMAGE";
    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    // For images we allow up to 5 files in one go.
    const effectiveFiles =
      sourceEntity === "ONBOARDING_MENU_IMAGE" ? files.slice(0, 5) : files.slice(0, 1);

    for (const f of effectiveFiles) {
      if (f.size > MAX_MENU_FILE_BYTES) {
        return NextResponse.json(
          { success: false, error: "File too large (max 15 MB)" },
          { status: 400 }
        );
      }
    }

    const parentId = store.parent_id ?? store.id;
    const storeIdStr = String(store.store_id || storeId);
    // We intentionally store only the proxy path (no hostname) so URLs
    // work across localhost, staging, and production without rewriting.

    const createdFiles: {
      id: number;
      store_id: number;
      media_scope: string;
      original_file_name: string;
      r2_key: string;
      public_url: string;
      mime_type: string | null;
      file_size_bytes: number;
      verification_status: string;
      created_at: string;
    }[] = [];

    try {
      const sql = getSql();
      // Hard-delete any existing MENU_REFERENCE media (and their R2 objects) so new upload fully replaces old.
      const existing = await sql`
        SELECT id, r2_key
        FROM merchant_store_media_files
        WHERE store_id = ${storeId}
          AND media_scope = 'MENU_REFERENCE'
      `;
      const rows = Array.isArray(existing) ? existing : existing ? [existing] : [];
      for (const row of rows as { id: number; r2_key: string | null }[]) {
        if (!row.r2_key) continue;
        try {
          await deleteDocument(row.r2_key);
        } catch (e) {
          console.warn(
            "[POST /api/merchant/stores/[id]/media/upload] R2 delete failed for key:",
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
      for (const f of effectiveFiles) {
        const timestamp = Date.now();
        const safeName = sanitizeFileName(f.name);
        const ext = f.name.split(".").pop()?.toLowerCase() || "bin";
        const r2Key = `merchants/${parentId}/stores/${storeIdStr}/menu/${timestamp}_${safeName}`;

        await uploadWithKey(f, r2Key);

        const publicUrl = `/api/attachments/proxy?key=${encodeURIComponent(
          r2Key
        )}`;

        const inserted = await sql`
          INSERT INTO merchant_store_media_files (
            store_id, media_scope, source_entity, original_file_name, r2_key, public_url,
            mime_type, file_size_bytes, version_no, is_active, verification_status
          )
          VALUES (
            ${storeId},
            'MENU_REFERENCE',
            ${sourceEntity},
            ${f.name},
            ${r2Key},
            ${publicUrl},
            ${f.type || null},
            ${f.size},
            1,
            true,
            'PENDING'
          )
          RETURNING id, store_id, media_scope, source_entity, original_file_name, r2_key, public_url,
                    mime_type, file_size_bytes, verification_status, created_at
        `;
        const row = Array.isArray(inserted) ? inserted[0] : inserted;
        if (row) {
          createdFiles.push({
            id: Number(row.id),
            store_id: storeId,
            media_scope: "MENU_REFERENCE",
            original_file_name: String(row.original_file_name ?? f.name),
            r2_key: String(row.r2_key ?? r2Key),
            public_url: String(row.public_url ?? publicUrl),
            mime_type: ((row.mime_type as string | null) ?? f.type) || null,
            file_size_bytes: Number(row.file_size_bytes ?? f.size),
            verification_status: String(row.verification_status ?? "PENDING"),
            created_at: (row.created_at as string) ?? new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      console.error("[POST /api/merchant/stores/[id]/media/upload] insert failed:", e);
      return NextResponse.json(
        { success: false, error: "Upload succeeded but failed to save record. Table merchant_store_media_files may not exist." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      files: createdFiles,
      file: createdFiles[0] ?? null,
      message: "File(s) uploaded and saved.",
    });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/media/upload]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
}
