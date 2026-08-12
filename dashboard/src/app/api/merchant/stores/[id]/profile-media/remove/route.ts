/**
 * POST /api/merchant/stores/[id]/profile-media/remove
 * Body: { key: string } or { url: string } — deletes R2 object and updates merchant_stores banner/gallery fields.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getMerchantStoreById, updateMerchantStore } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { deleteDocument } from "@/lib/services/r2";
import {
  coerceGalleryImageList,
  profileMediaR2KeyFromUrl,
} from "@/lib/merchant/store-profile-media";
import { getR2MerchantObjectPrefix } from "@/lib/merchant/r2-store-asset-paths";

export const runtime = "nodejs";

async function assertStoreAccess(storeId: number) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.email) return { ok: false as const, status: 401, error: "Not authenticated" };
  const superAdmin = await isSuperAdmin(user.id, user.email);
  const allowed =
    superAdmin || (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) return { ok: false as const, status: 403, error: "Forbidden" };
  const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });
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

function keyAllowedForStore(
  key: string,
  storeId: number,
  store_id: string | null | undefined,
  parentId: number
): boolean {
  const code = (store_id && String(store_id).trim()) || `GMMC${storeId}`;
  const root = `${getR2MerchantObjectPrefix()}/${parentId}/stores/${code}`;
  const partnerAssets = `${root}/assets/`;
  const legacyOnboarding = `${root}/onboarding/assets/`;
  const underPartner =
    key.startsWith(partnerAssets) && (key.includes("/banners/") || key.includes("/gallery/"));
  const underLegacy =
    key.startsWith(legacyOnboarding) && (key.includes("/banner/") || key.includes("/gallery/"));
  return underPartner || underLegacy;
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

    const body = await request.json().catch(() => ({}));
    const rawKey = typeof body.key === "string" ? body.key.trim() : "";
    const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
    const key = rawKey || profileMediaR2KeyFromUrl(rawUrl) || "";
    if (!key) {
      return NextResponse.json(
        { success: false, error: "Provide key or resolvable url" },
        { status: 400 }
      );
    }
    console.log("[profile-media/remove] request", { storeId, key });

    const storeRow = access.store as { store_id?: string; parent_id?: number | null };
    const parentIdForPath = await resolveParentIdForPath(storeId, storeRow);
    if (parentIdForPath == null) {
      return NextResponse.json(
        { success: false, error: "Parent id not found for store" },
        { status: 400 }
      );
    }
    if (!keyAllowedForStore(key, storeId, storeRow.store_id, parentIdForPath)) {
      console.warn("[profile-media/remove] key not allowed for store", {
        storeId,
        key,
        storeCode: storeRow.store_id,
        parentIdForPath,
      });
      return NextResponse.json(
        { success: false, error: "Key does not belong to this store profile media path" },
        { status: 403 }
      );
    }

    const areaManagerId = access.areaManagerId;
    const fresh = await getMerchantStoreById(storeId, areaManagerId);
    if (!fresh) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 500 });
    }

    const bKey = profileMediaR2KeyFromUrl(String(fresh.banner_url ?? ""));
    const gList = coerceGalleryImageList(fresh.gallery_images);
    const isBanner = bKey === key;
    const inGallery = gList.some((u) => profileMediaR2KeyFromUrl(u) === key);
    if (!isBanner && !inGallery) {
      console.warn("[profile-media/remove] key not attached to store", {
        storeId,
        key,
        bannerKey: bKey,
        galleryCount: gList.length,
      });
      return NextResponse.json(
        { success: false, error: "This image is not attached to this store" },
        { status: 400 }
      );
    }

    const newBanner = isBanner ? null : fresh.banner_url;
    const newGallery = gList.filter((u) => profileMediaR2KeyFromUrl(u) !== key);
    const galleryPayload = newGallery.length > 0 ? newGallery : null;

    await updateMerchantStore(storeId, areaManagerId, {
      banner_url: newBanner ?? null,
      gallery_images: galleryPayload,
    });
    console.log("[profile-media/remove] db updated", {
      storeId,
      removedKey: key,
      isBanner,
      galleryAfter: newGallery.length,
    });

    try {
      await deleteDocument(key);
    } catch (delErr) {
      console.warn("[profile-media/remove] R2 delete after DB update:", delErr);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[POST profile-media/remove]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Remove failed" },
      { status: 500 }
    );
  }
}
