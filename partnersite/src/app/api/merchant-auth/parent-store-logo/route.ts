import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant';
import { getParentLogoKey, getParentLogoPath } from '@/lib/r2-paths';
import {
  uploadToR2,
  deleteFromR2,
  toStoredDocumentUrl,
  normalizeR2ObjectKey,
  extractR2KeyFromUrl,
} from '@/lib/r2';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function safeLogoKeyFromStored(stored: string | null | undefined): string | null {
  if (!stored?.trim()) return null;
  const t = stored.trim();
  const fromProxy = extractR2KeyFromUrl(t);
  if (fromProxy) return normalizeR2ObjectKey(fromProxy);
  if (t.includes('://')) {
    const k = extractR2KeyFromUrl(t);
    return k ? normalizeR2ObjectKey(k) : null;
  }
  return normalizeR2ObjectKey(t.replace(/^\/+/, ''));
}

function isParentLogoKey(key: string, parentPk: number): boolean {
  const k = normalizeR2ObjectKey(key);
  const base = getParentLogoPath(parentPk);
  return k === base || k.startsWith(`${base}/`);
}

async function requireMerchantParentPk(): Promise<
  { ok: true; parentPk: number } | { ok: false; status: number; message: string }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, message: 'Not authenticated' };
  }
  const v = await validateMerchantFromSession({
    id: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
  });
  if (!v.isValid || v.merchantParentId == null) {
    return { ok: false, status: 403, message: v.error ?? 'Merchant not found' };
  }
  return { ok: true, parentPk: v.merchantParentId };
}

/** POST — upload parent brand logo: R2 under docs/merchants/{id}/logo/, DB as /api/attachments/proxy?key=… */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireMerchantParentPk();
    if (!auth.ok) {
      return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
    }
    const { parentPk } = auth;

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ success: false, error: 'Expected multipart form data' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = (formData.get('file') ?? formData.get('store_logo')) as unknown;
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ success: false, error: 'No image file' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ success: false, error: 'File must be an image' }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const { data: row, error: selErr } = await db
      .from('merchant_parents')
      .select('store_logo')
      .eq('id', parentPk)
      .single();

    if (selErr) {
      console.error('[parent-store-logo] select:', selErr);
      return NextResponse.json({ success: false, error: 'Could not load merchant' }, { status: 500 });
    }

    const oldKey = safeLogoKeyFromStored(row?.store_logo as string | null);
    if (oldKey && isParentLogoKey(oldKey, parentPk)) {
      try {
        await deleteFromR2(oldKey);
      } catch (e) {
        console.warn('[parent-store-logo] delete old object:', e);
      }
    }

    const ext =
      (file.name.split('.').pop() || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png';
    const baseName =
      file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 80) || 'logo';
    const fileName = `${Date.now()}_${baseName}.${ext}`;
    const key = getParentLogoKey(parentPk, fileName);
    await uploadToR2(file, key);

    const proxyUrl = toStoredDocumentUrl(key);
    if (!proxyUrl) {
      return NextResponse.json({ success: false, error: 'Could not build storage URL' }, { status: 500 });
    }

    const { error: upErr } = await db
      .from('merchant_parents')
      .update({ store_logo: proxyUrl, updated_at: new Date().toISOString() })
      .eq('id', parentPk);

    if (upErr) {
      console.error('[parent-store-logo] update:', upErr);
      try {
        await deleteFromR2(key);
      } catch {
        /* best effort */
      }
      return NextResponse.json({ success: false, error: 'Could not save logo' }, { status: 500 });
    }

    return NextResponse.json({ success: true, store_logo: proxyUrl });
  } catch (e) {
    console.error('[parent-store-logo] POST:', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Upload failed' },
      { status: 500 }
    );
  }
}

/** DELETE — remove parent logo from R2 and clear merchant_parents.store_logo */
export async function DELETE() {
  try {
    const auth = await requireMerchantParentPk();
    if (!auth.ok) {
      return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
    }
    const { parentPk } = auth;

    const db = getSupabaseAdmin();
    const { data: row, error: selErr } = await db
      .from('merchant_parents')
      .select('store_logo')
      .eq('id', parentPk)
      .single();

    if (selErr) {
      console.error('[parent-store-logo] DELETE select:', selErr);
      return NextResponse.json({ success: false, error: 'Could not load merchant' }, { status: 500 });
    }

    const oldKey = safeLogoKeyFromStored(row?.store_logo as string | null);
    if (oldKey && isParentLogoKey(oldKey, parentPk)) {
      try {
        await deleteFromR2(oldKey);
      } catch (e) {
        console.warn('[parent-store-logo] DELETE r2:', e);
      }
    }

    const { error: upErr } = await db
      .from('merchant_parents')
      .update({ store_logo: null, updated_at: new Date().toISOString() })
      .eq('id', parentPk);

    if (upErr) {
      console.error('[parent-store-logo] DELETE update:', upErr);
      return NextResponse.json({ success: false, error: 'Could not clear logo' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[parent-store-logo] DELETE:', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Delete failed' },
      { status: 500 }
    );
  }
}
