/**
 * POST /api/merchant/offers/upload-image
 * FormData: file (required), storeId (required), offerId (required), currentImageUrl (optional)
 *
 * R2 path (design): docs/merchants/{parent_code}/stores/{store_code}/offers/{offerId}.{ext}
 * One image per offer: replacing deletes the previous object then uploads the new one.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant';
import { getOffersR2Path } from '@/lib/r2-paths';
import { uploadToR2, deleteFromR2, extractR2KeyFromUrl, listR2KeysByPrefix } from '@/lib/r2';
import { toStoredDocumentUrl } from '@/lib/r2';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (!validation.isValid || validation.merchantParentId == null) {
      return NextResponse.json({ error: validation.error ?? 'Merchant not found' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const storeId = formData.get('storeId') as string | null;
    const offerId = formData.get('offerId') as string | null;
    const currentImageUrl = formData.get('currentImageUrl') as string | null;

    if (!file || !storeId?.trim() || !offerId?.trim()) {
      return NextResponse.json(
        { error: 'file, storeId and offerId are required' },
        { status: 400 }
      );
    }

    const db = getDb();
    const { data: store, error: storeError } = await db
      .from('merchant_stores')
      .select('id, store_id, parent_id')
      .eq('store_id', storeId.trim())
      .single();

    if (storeError || !store?.id) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }
    if (Number(store.parent_id) !== validation.merchantParentId) {
      return NextResponse.json({ error: 'Store does not belong to this merchant' }, { status: 403 });
    }

    const { data: parent } = await db
      .from('merchant_parents')
      .select('parent_merchant_id')
      .eq('id', store.parent_id)
      .maybeSingle();
    const parentCode = (parent as { parent_merchant_id?: string } | null)?.parent_merchant_id ?? (store.parent_id != null ? String(store.parent_id) : null);
    const offersPath = getOffersR2Path(storeId.trim(), parentCode);

    // One image per offer: delete any existing object for this offer (same key prefix)
    const existingKeys = await listR2KeysByPrefix(offersPath, 50);
    const offerIdPrefix = `${offersPath}/`;
    const toDelete = existingKeys.filter((k) => {
      const after = k.slice(offerIdPrefix.length);
      return after === offerId || after.startsWith(`${offerId}.`);
    });
    for (const key of toDelete) {
      try {
        await deleteFromR2(key);
      } catch (e) {
        console.warn('[offers/upload-image] delete old key failed', key, e);
      }
    }
    // If client sent currentImageUrl (different path, e.g. legacy offers/xxx), delete that too
    if (currentImageUrl?.trim()) {
      const legacyKey = extractR2KeyFromUrl(currentImageUrl.trim());
      if (legacyKey && !toDelete.includes(legacyKey)) {
        try {
          await deleteFromR2(legacyKey);
        } catch (e) {
          console.warn('[offers/upload-image] delete legacy key failed', legacyKey, e);
        }
      }
    }

    const ext = (file.name && /\.([a-zA-Z0-9]+)$/.exec(file.name)?.[1]) || 'jpg';
    const safeExt = ext.toLowerCase() === 'jpeg' ? 'jpg' : ext.toLowerCase();
    const r2Key = `${offersPath}/${offerId}.${safeExt}`;

    await uploadToR2(file, r2Key);

    const url = toStoredDocumentUrl(r2Key) ?? `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;

    return NextResponse.json({ success: true, key: r2Key, url });
  } catch (e) {
    console.error('[offers/upload-image]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
