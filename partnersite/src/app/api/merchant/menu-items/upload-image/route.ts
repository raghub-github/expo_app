import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant';
import { getMerchantMenuPath } from '@/lib/r2-paths';
import { uploadToR2 } from '@/lib/r2';
import { validateMenuItemSquareImage } from '@/lib/menuItemImageValidation';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/merchant/menu-items/upload-image
 * FormData: file (required), storeId (required)
 * Uploads menu item image to R2 at: merchants/{parentId}/stores/{storeId}/menu/{uniqueFilename}
 * Returns { success, key, image_url } — image_url is always `/api/attachments/proxy?key=...` (same as store documents).
 */
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
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error ?? 'Merchant not found' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const storeId = formData.get('storeId') as string | null;

    if (!file || !storeId?.trim()) {
      return NextResponse.json({ error: 'file and storeId are required' }, { status: 400 });
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

    const menuDir = getMerchantMenuPath(storeId.trim(), String(store.parent_id));
    const ext = (file.name && /\.([a-zA-Z0-9]+)$/.exec(file.name)?.[1]) || 'jpg';
    const safeExt = ext.toLowerCase() === 'jpeg' ? 'jpg' : ext.toLowerCase();
    const uniqueName = `menu_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${safeExt}`;
    const r2Key = `${menuDir}/${uniqueName}`;

    const ab = await file.arrayBuffer();
    const dim = validateMenuItemSquareImage(Buffer.from(ab));
    if (!dim.ok) {
      return NextResponse.json({ error: dim.error }, { status: 400 });
    }

    await uploadToR2(file, r2Key);

    const imageUrl = `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;

    return NextResponse.json({ success: true, key: r2Key, image_url: imageUrl });
  } catch (e) {
    console.error('[menu-items/upload-image]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
