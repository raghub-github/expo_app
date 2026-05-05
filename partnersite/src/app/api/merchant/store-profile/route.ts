import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant';
import {
  getAreaManagerRecordIdForAuthUser,
  getMerchantStoreById,
} from '@/lib/merchant/get-merchant-store';
import {
  getMerchantStoreMediaPath,
  getOnboardingAssetsBannerPath,
  getOnboardingAssetsGalleryPath,
  merchantParentPrimaryKeySegmentForR2,
  R2_MERCHANT_PREFIX,
} from '@/lib/r2-paths';
import { deleteFromR2, extractR2KeyFromUrl, normalizeR2ObjectKey, toStoredDocumentUrl } from '@/lib/r2';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const ALLOWED_MEDIA_KEYS = ['banner_url', 'gallery_images'] as const;

function keyFromMediaRef(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val !== 'string') return null;
  const t = val.trim();
  if (!t) return null;
  const k = extractR2KeyFromUrl(t) || (t.includes('://') ? null : t.replace(/^\/+/, ''));
  return k ? normalizeR2ObjectKey(k) : null;
}

/**
 * Prefixes where store banner / logo / gallery objects are allowed to live for this store.
 * Excludes onboarding/documents, menu/, bank/, etc., so we never delete unrelated R2 objects.
 */
function brandingKeyPrefixesForStore(storePublicId: string, parentId: number): string[] {
  const sid = String(storePublicId).trim();
  const pk = parentId;
  const seg = merchantParentPrimaryKeySegmentForR2(pk);
  const root = `${R2_MERCHANT_PREFIX}/${seg}/stores/${sid}`;
  const slash = (p: string) => normalizeR2ObjectKey(p.endsWith('/') ? p : `${p}/`);
  return [
    slash(getOnboardingAssetsBannerPath(pk, sid)),
    slash(getOnboardingAssetsGalleryPath(pk, sid)),
    slash(`${root}/onboarding/store-media`),
    slash(`${root}/onboarding/store-media-gallery`),
    slash(getMerchantStoreMediaPath(sid, 'logo', String(pk))),
    slash(getMerchantStoreMediaPath(sid, 'banner', String(pk))),
    slash(getMerchantStoreMediaPath(sid, 'gallery', String(pk))),
    slash(`${R2_MERCHANT_PREFIX}/${sid}/store-media`),
  ];
}

function isBrandingMediaKeyForStore(key: string, storePublicId: string, parentId: number): boolean {
  const k = normalizeR2ObjectKey(key);
  return brandingKeyPrefixesForStore(storePublicId, parentId).some((p) => k.startsWith(p));
}

/**
 * PATCH /api/merchant/store-profile
 * Body: { storeId: string, banner_url?: string, gallery_images?: string[] }
 * Updates media fields on merchant_stores. Removes replaced/cleared images from R2 one key at a time
 * (only under this store’s banner/logo/gallery paths — never whole-folder wipes).
 */
export async function PATCH(req: NextRequest) {
  try {
    // In dev, Fast Refresh / tab reload can abort in-flight requests (ECONNRESET / "aborted").
    // Treat those as a client disconnect and exit quietly.
    if (req.signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }

    const body = await req.json().catch(() => ({}));
    const storeId = body?.storeId;
    if (!storeId || typeof storeId !== 'string') {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }
    const storeIdTrim = String(storeId).trim();

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });

    const db = getSupabase();
    const merchantParentId =
      validation.isValid && validation.merchantParentId != null ? validation.merchantParentId : null;
    const areaManagerId = await getAreaManagerRecordIdForAuthUser(db, user.email);

    if (merchantParentId == null && areaManagerId == null) {
      return NextResponse.json(
        { error: validation.error ?? 'Merchant dashboard access required.' },
        { status: 403 }
      );
    }

    const accessStore = await getMerchantStoreById(db, storeIdTrim, {
      merchantParentId,
      areaManagerId,
    });
    if (!accessStore) {
      return NextResponse.json({ error: 'Store not found or not accessible.' }, { status: 404 });
    }

    const { data: prevRow, error: prevErr } = await db
      .from('merchant_stores')
      .select('banner_url, gallery_images')
      .eq('store_id', storeIdTrim)
      .maybeSingle();

    if (prevErr) {
      console.error('[store-profile PATCH] load prev:', prevErr);
      return NextResponse.json(
        { error: 'Could not load store', details: prevErr.message, code: (prevErr as any)?.code },
        { status: 500 }
      );
    }

    const prev = prevRow as {
      banner_url?: string | null;
      gallery_images?: string[] | null;
    } | null;

    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_MEDIA_KEYS) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        const val = body[key];
        if (key === 'banner_url') {
          if (val === null || val === undefined) updates[key] = null;
          else if (typeof val === 'string') {
            updates[key] = toStoredDocumentUrl(val) ?? val;
          }
        } else {
          if (Array.isArray(val)) {
            updates[key] = val
              .slice(0, 10)
              .map((u: unknown) => (typeof u === 'string' ? toStoredDocumentUrl(u) ?? u : u))
              .filter((u): u is string => typeof u === 'string' && u.length > 0);
          } else if (val === null || val === undefined) updates[key] = null;
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true });
    }

    const keysToDelete = new Set<string>();

    if (Object.prototype.hasOwnProperty.call(body, 'banner_url')) {
      const oldK = keyFromMediaRef(prev?.banner_url);
      const newV = updates.banner_url;
      const newK = newV == null || typeof newV !== 'string' ? null : keyFromMediaRef(newV);
      if (oldK && oldK !== newK) keysToDelete.add(oldK);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'gallery_images')) {
      const prevG: string[] = Array.isArray(prev?.gallery_images) ? prev.gallery_images : [];
      const newG: string[] = Array.isArray(updates.gallery_images) ? (updates.gallery_images as string[]) : [];
      const newKeySet = new Set(newG.map((u) => keyFromMediaRef(u)).filter((k): k is string => !!k));
      for (const u of prevG) {
        const k = keyFromMediaRef(u);
        if (k && !newKeySet.has(k)) keysToDelete.add(k);
      }
    }

    (updates as Record<string, unknown>).updated_at = new Date().toISOString();

    const { error } = await db.from('merchant_stores').update(updates).eq('store_id', storeIdTrim);

    if (error) {
      console.error('[store-profile PATCH]', error.message, error.code, error.details);
      return NextResponse.json(
        { error: error.message || 'Update failed', code: error.code },
        { status: 500 }
      );
    }

    for (const k of keysToDelete) {
      if (req.signal.aborted) break;
      if (!isBrandingMediaKeyForStore(k, accessStore.store_id, accessStore.parent_id)) {
        console.warn('[store-profile] skip R2 delete — key outside store branding paths:', k);
        continue;
      }
      try {
        await deleteFromR2(k);
      } catch (e) {
        console.warn('[store-profile] R2 delete failed:', k, e);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const e = err as any;
    const code = e?.code || e?.cause?.code;
    const msg = typeof e?.message === 'string' ? e.message : '';
    const aborted =
      code === 'ECONNRESET' ||
      msg.toLowerCase().includes('aborted') ||
      (e?.name === 'AbortError');

    if (aborted) {
      return new NextResponse(null, { status: 499 });
    }

    console.error('[store-profile PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
