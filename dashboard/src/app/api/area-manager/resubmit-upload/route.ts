/**
 * POST /api/area-manager/resubmit-upload
 * Upload a file to R2 for onboarding resubmit (docs / bank / banner) without writing live tables.
 * Staging happens via POST /api/area-manager/onboarding-resubmissions.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth, requireMerchantManager } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getR2MerchantObjectPrefix } from "@/lib/merchant/r2-store-asset-paths";
import { uploadWithKey } from "@/lib/services/r2";

export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024;

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "upload";
}

function extensionFromFile(file: File): string {
  const n = file.name || "";
  const m = n.match(/(\.[a-zA-Z0-9]+)$/);
  if (m) return m[1]!.toLowerCase();
  if (file.type === "application/pdf") return ".pdf";
  if (file.type === "image/png") return ".png";
  if (file.type === "image/jpeg") return ".jpg";
  return "";
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const getAuthUser = async () => {
      const { data } = await supabase.auth.getUser();
      return data?.user ?? null;
    };
    const authResult = await requireAreaManagerApiAuth(getAuthUser);
    if (authResult.error) return authResult.error;
    const err = requireMerchantManager(authResult.resolved);
    if (err) return err;

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ success: false, error: "file required" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ success: false, error: "Max file size is 20 MB" }, { status: 400 });
    }

    const storeId = Number(form.get("storeId") ?? form.get("store_id"));
    if (!Number.isFinite(storeId) || storeId <= 0) {
      return NextResponse.json({ success: false, error: "storeId required" }, { status: 400 });
    }

    const kindRaw = String(form.get("kind") || "document").toLowerCase();
    const kind =
      kindRaw === "bank" || kindRaw === "bank_proof"
        ? "bank"
        : kindRaw === "banner"
          ? "banner"
          : "document";

    const areaManagerId = authResult.resolved.isSuperAdmin
      ? null
      : authResult.resolved.areaManager.id > 0
        ? authResult.resolved.areaManager.id
        : null;
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const parentId = store.parent_id != null ? Number(store.parent_id) : null;
    if (parentId == null || !Number.isFinite(parentId)) {
      return NextResponse.json({ success: false, error: "Parent id missing" }, { status: 400 });
    }

    const storeCode = String(store.store_id || storeId);
    const prefix = getR2MerchantObjectPrefix();
    const requestedName = String(form.get("filename") || file.name || "upload");
    const safeBase = sanitizeFileName(requestedName.replace(/\.[^.]+$/, "") || "upload");
    const ext = extensionFromFile(file) || "";
    const fileName = `${safeBase}_${Date.now()}${ext}`;

    const folder =
      kind === "bank"
        ? `${prefix}/${parentId}/stores/${storeCode}/onboarding/bank`
        : kind === "banner"
          ? `${prefix}/${parentId}/stores/${storeCode}/onboarding/assets/banner`
          : `${prefix}/${parentId}/stores/${storeCode}/onboarding/documents`;

    const r2Key = `${folder}/${fileName}`.replace(/\/+/g, "/");
    await uploadWithKey(file, r2Key);
    const proxyUrl = `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;

    return NextResponse.json({
      success: true,
      key: r2Key,
      path: r2Key,
      url: proxyUrl,
      proxyUrl,
    });
  } catch (e) {
    console.error("[POST /api/area-manager/resubmit-upload]", e);
    return NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
  }
}
