/**
 * POST /api/merchant/stores/[id]/profile-media
 * Body: FormData with file, type: 'banner' | 'gallery'
 * R2 keys match partnersite mx profile uploads: `{prefix}/{parentPk}/stores/{GMMC}/assets/banners|gallery/{file}`
 * (`getMerchantAssetsPath` + `banners` | `gallery`). Legacy `.../onboarding/assets/banner|gallery/` is no longer written.
 * Order when apply_to_store: upload bytes to R2 first (`uploadWithKey`), then persist the dashboard
 * proxy URL (`/api/attachments/proxy?key=...`) in `merchant_stores`. Response `url` is a time-limited signed URL for clients that need it.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById, updateMerchantStore } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { uploadWithKey, getSignedUrlFromKey, deleteDocument } from "@/lib/services/r2";
import {
  attachmentsProxyUrlFromKey,
  coerceGalleryImageList,
  maxGalleryImages,
  profileMediaR2KeyFromUrl,
} from "@/lib/merchant/store-profile-media";
import { buildStoreProfileMediaR2Key, getR2MerchantObjectPrefix } from "@/lib/merchant/r2-store-asset-paths";

export const runtime = "nodejs";

async function assertStoreAccess(storeId: number) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return { ok: false as const, status: 401, error: "Not authenticated" };
  const superAdmin = await isSuperAdmin(user.id, user.email);
  const allowed =
    superAdmin || (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) return { ok: false as const, status: 403, error: "Forbidden" };
  let areaManagerId: number | null = null;
  if (!superAdmin) {
    const systemUser = await getSystemUserByEmail(user.email);
    if (systemUser) {
      const am = await getAreaManagerByUserId(systemUser.id);
      if (am) areaManagerId = am.id;
    }
  }
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) return { ok: false as const, status: 404, error: "Store not found" };
  return { ok: true as const, store, areaManagerId };
}

async function resolveParentIdForPath(
  storeId: number,
  store: { parent_id?: number | null }
): Promise<number | null> {
  if (typeof store.parent_id === "number" && Number.isFinite(store.parent_id)) {
    return store.parent_id;
  }
  const sql = getSql();
  const rows = await sql`
    SELECT parent_id
    FROM merchant_stores
    WHERE id = ${storeId}
    LIMIT 1
  `;
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || (row as { parent_id?: unknown }).parent_id == null) return null;
  const parsed = Number((row as { parent_id: unknown }).parent_id);
  return Number.isFinite(parsed) ? parsed : null;
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
    const typeRaw = (formData.get("type") as string) || "gallery";
    const type: "banner" | "gallery" = typeRaw === "banner" ? "banner" : "gallery";
    const indexRaw = formData.get("index");
    const index =
      typeof indexRaw === "string" && indexRaw.trim() !== "" && Number.isFinite(Number(indexRaw))
        ? Number(indexRaw)
        : 0;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file" }, { status: 400 });
    }
    console.log("[profile-media] upload request", {
      storeId,
      type,
      index,
      fileName: file.name,
      fileSize: file.size,
      mime: file.type,
    });
    const storeRow = access.store as {
      store_id?: string;
      parent_id?: number | null;
      banner_url?: unknown;
      gallery_images?: unknown;
    };
    const storeCode = storeRow.store_id ?? `GMMC${storeId}`;
    const parentIdForPath = await resolveParentIdForPath(storeId, storeRow);
    if (parentIdForPath == null) {
      return NextResponse.json(
        { success: false, error: "Parent id not found for store", code: "PARENT_ID_MISSING" },
        { status: 400 }
      );
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const timestamp = Date.now();
    const baseName = type === "banner" ? "banner" : "gallery";
    const fileName =
      type === "banner"
        ? `${baseName}_${timestamp}.${ext}`
        : `${baseName}_${timestamp}_${index}.${ext}`;

    const root = `${getR2MerchantObjectPrefix()}/${parentIdForPath}/stores/${storeCode}`;
    const resolveExistingKey = (val: unknown): string | null => {
      if (typeof val !== "string") return null;
      return profileMediaR2KeyFromUrl(val);
    };
    const existingBannerKey = resolveExistingKey(storeRow.banner_url);
    const existingGalleryList = coerceGalleryImageList(storeRow.gallery_images);
    const existingGalleryKey = existingGalleryList.length ? resolveExistingKey(existingGalleryList[0]) : null;
    const preferLegacy =
      type === "banner"
        ? !!(existingBannerKey && existingBannerKey.startsWith(`${root}/onboarding/assets/banner/`))
        : !!(existingGalleryKey && existingGalleryKey.startsWith(`${root}/onboarding/assets/gallery/`));

    const key = preferLegacy
      ? `${root}/onboarding/assets/${type === "banner" ? "banner" : "gallery"}/${String(fileName || "upload").replace(/^\/+/, "")}`
      : buildStoreProfileMediaR2Key(parentIdForPath, storeCode, type, fileName);
    await uploadWithKey(file, key);
    console.log("[profile-media] R2 uploaded", { storeId, type, key });
    const signedUrl = await getSignedUrlFromKey(key, 604800);
    const applyRaw = formData.get("apply_to_store");
    // Default true: dashboard uploads must persist to DB + show in UI. Only skip when explicitly disabled.
    const applyToStore =
      applyRaw !== "false" && applyRaw !== "0" && String(applyRaw ?? "true").toLowerCase() !== "off";

    if (applyToStore) {
      const proxyUrl = attachmentsProxyUrlFromKey(key);
      const areaManagerId = access.areaManagerId;
      if (type === "banner") {
        const existing = await getMerchantStoreById(storeId, areaManagerId);
        const oldKey = existing?.banner_url ? profileMediaR2KeyFromUrl(String(existing.banner_url)) : null;
        const updated = await updateMerchantStore(storeId, areaManagerId, { banner_url: proxyUrl });
        if (!updated) {
          console.error("[profile-media] banner UPDATE returned no row", { storeId, areaManagerId });
          try {
            await deleteDocument(key);
          } catch {
            /* ignore */
          }
          return NextResponse.json(
            { success: false, error: "Could not save banner to store (no row updated)." },
            { status: 500 }
          );
        }
        console.log("[profile-media] banner db updated", { storeId, key });
        if (oldKey && oldKey !== key) {
          try {
            await deleteDocument(oldKey);
          } catch (delErr) {
            console.warn("[profile-media] old banner R2 delete:", delErr);
          }
        }
      } else {
        const existing = await getMerchantStoreById(storeId, areaManagerId);
        const list = coerceGalleryImageList(existing?.gallery_images);
        const max = maxGalleryImages();
        if (list.length >= max) {
          try {
            await deleteDocument(key);
          } catch {
            /* ignore */
          }
          return NextResponse.json(
            { success: false, error: `Gallery is full (max ${max} images). Remove one before adding.` },
            { status: 400 }
          );
        }
        const nextGallery = [...list, proxyUrl];
        const updated = await updateMerchantStore(storeId, areaManagerId, { gallery_images: nextGallery });
        if (!updated) {
          console.error("[profile-media] gallery UPDATE returned no row", {
            storeId,
            areaManagerId,
            nextLen: nextGallery.length,
          });
          try {
            await deleteDocument(key);
          } catch {
            /* ignore */
          }
          return NextResponse.json(
            { success: false, error: "Could not save gallery to store (no row updated)." },
            { status: 500 }
          );
        }
        console.log("[profile-media] gallery db updated", {
          storeId,
          countBefore: list.length,
          countAfter: nextGallery.length,
          key,
        });
      }
    }

    return NextResponse.json({ success: true, url: signedUrl, key, proxyUrl: attachmentsProxyUrlFromKey(key) });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/profile-media]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Upload failed" }, { status: 500 });
  }
}
