/**
 * POST /api/merchant/stores/[id]/profile-media
 * Body: FormData with file, type: 'banner' | 'gallery'
 * Uploads to R2 with key: merchant-assets/{GMMC}/banners/... or merchant-assets/{GMMC}/gallery/...
 * (same path as signed URLs: merchant-assets/GMMC1002/banners/banners_xxx.png)
 * Returns signed URL (R2) as `url` for saving in Supabase — no localhost; works in production.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { uploadWithKey, getSignedUrlFromKey } from "@/lib/services/r2";

export const runtime = "nodejs";

async function assertStoreAccess(storeId: number) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return { ok: false as const, status: 401, error: "Not authenticated" };
  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) return { ok: false as const, status: 403, error: "Forbidden" };
  let areaManagerId: number | null = null;
  if (!(await isSuperAdmin(user.id, user.email))) {
    const systemUser = await getSystemUserByEmail(user.email);
    if (systemUser) {
      const am = await getAreaManagerByUserId(systemUser.id);
      if (am) areaManagerId = am.id;
    }
  }
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) return { ok: false as const, status: 404, error: "Store not found" };
  return { ok: true as const, store };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = (formData.get("type") as string) || "gallery";
    const indexRaw = formData.get("index");
    const index =
      typeof indexRaw === "string" && indexRaw.trim() !== "" && Number.isFinite(Number(indexRaw))
        ? Number(indexRaw)
        : 0;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file" }, { status: 400 });
    }
    const storeRow = access.store as {
      store_id?: string;
      parent?: { parent_merchant_id?: string | null } | null;
    };
    const storeCode = storeRow.store_id ?? `GMMC${storeId}`;
    const parentCode = storeRow.parent?.parent_merchant_id ?? null;
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const timestamp = Date.now();
    const folder = type === "banner" ? "banners" : "gallery";
    const baseName = type === "banner" ? "banners" : "gallery";
    const fileName =
      type === "banner"
        ? `${baseName}_${timestamp}.${ext}`
        : `${baseName}_${timestamp}_${index}.${ext}`;
    // Keep attachment keys consistent with the shared R2 folder structure:
    // docs/merchants/{parent_code}/stores/{store_code}/assets/{banners|gallery}/{fileName}
    const key = parentCode
      ? `docs/merchants/${parentCode}/stores/${storeCode}/assets/${folder}/${fileName}`
      : `docs/merchants/${storeCode}/assets/${folder}/${fileName}`;
    await uploadWithKey(file, key);
    const signedUrl = await getSignedUrlFromKey(key, 604800);
    return NextResponse.json({ success: true, url: signedUrl, key });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/profile-media]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Upload failed" }, { status: 500 });
  }
}
