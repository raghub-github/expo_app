/**
 * POST /api/merchant/stores/[id]/documents/upload
 * Upload a document file (image/PDF) for a doc type. File goes to R2, URL saved in merchant_store_documents.
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

const DOC_TYPES = ["pan", "gst", "aadhaar", "fssai", "drug_license"] as const;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60) || "file";
}

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto === "https" ? "https" : "http"}://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL || "";
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
    const docTypeRaw = formData.get("docType") as string | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }
    if (!docTypeRaw || !DOC_TYPES.includes(docTypeRaw as (typeof DOC_TYPES)[number])) {
      return NextResponse.json(
        { success: false, error: "Invalid docType. Use: pan, gst, aadhaar, fssai, drug_license" },
        { status: 400 }
      );
    }
    const docType = docTypeRaw as (typeof DOC_TYPES)[number];

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { success: false, error: "File too large (max 10 MB)" },
        { status: 400 }
      );
    }

    const parentId = store.parent_id ?? store.id;
    const storeIdStr = String(store.store_id || storeId);
    const timestamp = Date.now();
    const safeName = sanitizeFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
    const r2Key = `merchants/${parentId}/stores/${storeIdStr}/documents/${docType}_${timestamp}_${safeName}`;

    await uploadWithKey(file, r2Key);

    const baseUrl = getBaseUrl(request);
    const publicUrl = `${baseUrl}/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;

    const sql = getSql();

    try {
      switch (docType) {
        case "pan":
          await sql`
            INSERT INTO merchant_store_documents (store_id, pan_document_url)
            VALUES (${storeId}, ${publicUrl})
            ON CONFLICT (store_id) DO UPDATE SET pan_document_url = EXCLUDED.pan_document_url, updated_at = now()
          `;
          break;
        case "gst":
          await sql`
            INSERT INTO merchant_store_documents (store_id, gst_document_url)
            VALUES (${storeId}, ${publicUrl})
            ON CONFLICT (store_id) DO UPDATE SET gst_document_url = EXCLUDED.gst_document_url, updated_at = now()
          `;
          break;
        case "aadhaar":
          await sql`
            INSERT INTO merchant_store_documents (store_id, aadhaar_document_url)
            VALUES (${storeId}, ${publicUrl})
            ON CONFLICT (store_id) DO UPDATE SET aadhaar_document_url = EXCLUDED.aadhaar_document_url, updated_at = now()
          `;
          break;
        case "fssai":
          await sql`
            INSERT INTO merchant_store_documents (store_id, fssai_document_url)
            VALUES (${storeId}, ${publicUrl})
            ON CONFLICT (store_id) DO UPDATE SET fssai_document_url = EXCLUDED.fssai_document_url, updated_at = now()
          `;
          break;
        case "drug_license":
          await sql`
            INSERT INTO merchant_store_documents (store_id, drug_license_document_url)
            VALUES (${storeId}, ${publicUrl})
            ON CONFLICT (store_id) DO UPDATE SET drug_license_document_url = EXCLUDED.drug_license_document_url, updated_at = now()
          `;
          break;
      }
    } catch (e) {
      console.error("[POST /api/merchant/stores/[id]/documents/upload] DB error:", e);
      return NextResponse.json(
        { success: false, error: "Failed to save document URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      docType,
      message: "File uploaded and URL saved.",
    });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/documents/upload]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
}
