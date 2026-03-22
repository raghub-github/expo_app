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

const DOC_TYPES = [
  "pan",
  "gst",
  "aadhaar",
  "fssai",
  "drug_license",
  "trade_license",
  "shop_establishment",
  "udyam",
  "other",
  "pharmacist_certificate",
  "pharmacy_council_registration",
] as const;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60) || "file";
}

// We intentionally avoid embedding absolute hostnames in stored URLs.
// All document URLs will be relative `/api/attachments/proxy?...` paths.
function buildProxyUrl(r2Key: string): string {
  return `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;
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
    const sideRaw = formData.get("side") as string | null;
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
    const aadhaarSide: "front" | "back" | null =
      docType === "aadhaar"
        ? sideRaw === "back"
          ? "back"
          : "front"
        : null;

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { success: false, error: "File too large (max 10 MB)" },
        { status: 400 }
      );
    }

    // Use external merchant/child codes in the key so URLs match the
    // docs-style paths (docs/merchants/GMMP.../stores/GMMC.../onboarding/documents/...).
    const parentCode =
      (store.parent?.parent_merchant_id as string | null) ||
      String(store.parent_id ?? store.id);
    const storeCode = String(store.store_id || storeId);
    const timestamp = Date.now();
    const safeName = sanitizeFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";

    // Match Partner Site naming for Aadhaar front/back so keys look like:
    // docs/merchants/{parent}/stores/{store}/onboarding/documents/aadhar_front_...
    const baseDocName =
      docType === "aadhaar"
        ? aadhaarSide === "back"
          ? "aadhar_back"
          : "aadhar_front"
        : docType;

    const r2Key = `docs/merchants/${parentCode}/stores/${storeCode}/onboarding/documents/${baseDocName}_${timestamp}_${safeName}.${ext}`;

    await uploadWithKey(file, r2Key);

    const publicUrl = buildProxyUrl(r2Key);

    const sql = getSql();

    try {
      const displayName = safeName;

      switch (docType) {
        case "pan":
          await sql`
            INSERT INTO merchant_store_documents (store_id, pan_document_url, pan_document_name)
            VALUES (${storeId}, ${publicUrl}, ${displayName})
            ON CONFLICT (store_id) DO UPDATE SET
              pan_document_url = EXCLUDED.pan_document_url,
              pan_document_name = EXCLUDED.pan_document_name,
              updated_at = now()
          `;
          break;
        case "gst":
          await sql`
            INSERT INTO merchant_store_documents (store_id, gst_document_url, gst_document_name)
            VALUES (${storeId}, ${publicUrl}, ${displayName})
            ON CONFLICT (store_id) DO UPDATE SET
              gst_document_url = EXCLUDED.gst_document_url,
              gst_document_name = EXCLUDED.gst_document_name,
              updated_at = now()
          `;
          break;
        case "aadhaar":
          if (aadhaarSide === "back") {
            // Store Aadhaar back side URL in aadhaar_document_metadata.back_url (same as Partner Site)
            await sql`
              INSERT INTO merchant_store_documents (store_id, aadhaar_document_metadata)
              VALUES (${storeId}, jsonb_build_object('back_url', ${publicUrl}::text))
              ON CONFLICT (store_id) DO UPDATE
              SET aadhaar_document_metadata = jsonb_set(
                    COALESCE(merchant_store_documents.aadhaar_document_metadata, '{}'::jsonb),
                    '{back_url}',
                    to_jsonb(${publicUrl}::text),
                    true
                  ),
                  updated_at = now()
            `;
          } else {
            await sql`
              INSERT INTO merchant_store_documents (store_id, aadhaar_document_url, aadhaar_document_name)
              VALUES (${storeId}, ${publicUrl}, ${displayName})
              ON CONFLICT (store_id) DO UPDATE
              SET aadhaar_document_url = EXCLUDED.aadhaar_document_url,
                  aadhaar_document_name = EXCLUDED.aadhaar_document_name,
                  updated_at = now()
            `;
          }
          break;
        case "fssai":
          await sql`
            INSERT INTO merchant_store_documents (store_id, fssai_document_url, fssai_document_name)
            VALUES (${storeId}, ${publicUrl}, ${displayName})
            ON CONFLICT (store_id) DO UPDATE SET
              fssai_document_url = EXCLUDED.fssai_document_url,
              fssai_document_name = EXCLUDED.fssai_document_name,
              updated_at = now()
          `;
          break;
        case "drug_license":
          await sql`
            INSERT INTO merchant_store_documents (store_id, drug_license_document_url, drug_license_document_name)
            VALUES (${storeId}, ${publicUrl}, ${displayName})
            ON CONFLICT (store_id) DO UPDATE SET
              drug_license_document_url = EXCLUDED.drug_license_document_url,
              drug_license_document_name = EXCLUDED.drug_license_document_name,
              updated_at = now()
          `;
          break;
        case "trade_license":
          await sql`
            INSERT INTO merchant_store_documents (store_id, trade_license_document_url, trade_license_document_name)
            VALUES (${storeId}, ${publicUrl}, ${displayName})
            ON CONFLICT (store_id) DO UPDATE SET
              trade_license_document_url = EXCLUDED.trade_license_document_url,
              trade_license_document_name = EXCLUDED.trade_license_document_name,
              updated_at = now()
          `;
          break;
        case "shop_establishment":
          await sql`
            INSERT INTO merchant_store_documents (store_id, shop_establishment_document_url, shop_establishment_document_name)
            VALUES (${storeId}, ${publicUrl}, ${displayName})
            ON CONFLICT (store_id) DO UPDATE SET
              shop_establishment_document_url = EXCLUDED.shop_establishment_document_url,
              shop_establishment_document_name = EXCLUDED.shop_establishment_document_name,
              updated_at = now()
          `;
          break;
        case "udyam":
          await sql`
            INSERT INTO merchant_store_documents (store_id, udyam_document_url, udyam_document_name)
            VALUES (${storeId}, ${publicUrl}, ${displayName})
            ON CONFLICT (store_id) DO UPDATE SET
              udyam_document_url = EXCLUDED.udyam_document_url,
              udyam_document_name = EXCLUDED.udyam_document_name,
              updated_at = now()
          `;
          break;
        case "other":
          await sql`
            INSERT INTO merchant_store_documents (store_id, other_document_url, other_document_name)
            VALUES (${storeId}, ${publicUrl}, ${displayName})
            ON CONFLICT (store_id) DO UPDATE SET
              other_document_url = EXCLUDED.other_document_url,
              other_document_name = EXCLUDED.other_document_name,
              updated_at = now()
          `;
          break;
        case "pharmacist_certificate":
          await sql`
            INSERT INTO merchant_store_documents (store_id, pharmacist_certificate_document_url, pharmacist_certificate_document_name)
            VALUES (${storeId}, ${publicUrl}, ${displayName})
            ON CONFLICT (store_id) DO UPDATE SET
              pharmacist_certificate_document_url = EXCLUDED.pharmacist_certificate_document_url,
              pharmacist_certificate_document_name = EXCLUDED.pharmacist_certificate_document_name,
              updated_at = now()
          `;
          break;
        case "pharmacy_council_registration":
          await sql`
            INSERT INTO merchant_store_documents (store_id, pharmacy_council_registration_document_url, pharmacy_council_registration_document_name)
            VALUES (${storeId}, ${publicUrl}, ${displayName})
            ON CONFLICT (store_id) DO UPDATE SET
              pharmacy_council_registration_document_url = EXCLUDED.pharmacy_council_registration_document_url,
              pharmacy_council_registration_document_name = EXCLUDED.pharmacy_council_registration_document_name,
              updated_at = now()
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
