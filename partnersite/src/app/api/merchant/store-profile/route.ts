import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const ALLOWED_MEDIA_KEYS = ['banner_url', 'logo_url', 'gallery_images'] as const;

/**
 * PATCH /api/merchant/store-profile
 * Body: { storeId: string, banner_url?: string, logo_url?: string, gallery_images?: string[] }
 * Updates only media fields on merchant_stores using service role (bypasses RLS).
 * Used after R2 upload so the UI can persist and display image URLs.
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const storeId = body?.storeId;
    if (!storeId || typeof storeId !== 'string') {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_MEDIA_KEYS) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        const val = body[key];
        if (key === 'banner_url' || key === 'logo_url') {
          if (val === null || val === undefined || typeof val === 'string') updates[key] = val ?? null;
        } else {
          if (Array.isArray(val)) updates[key] = val.slice(0, 10);
          else if (val === null || val === undefined) updates[key] = null;
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true });
    }

    (updates as Record<string, unknown>).updated_at = new Date().toISOString();

    const db = getSupabase();
    const { error } = await db
      .from('merchant_stores')
      .update(updates)
      .eq('store_id', String(storeId).trim());

    if (error) {
      console.error('[store-profile PATCH]', error.message, error.code, error.details);
      return NextResponse.json(
        { error: error.message || 'Update failed', code: error.code },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[store-profile PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
