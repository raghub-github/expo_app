import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertStoreAccess } from '@/lib/auth/assert-store-access';
import { normalizeStoreDocumentRowUrls } from '@/lib/r2';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** GET ?storeId=GMMC1001 — legal documents for the logged-in merchant's store (proxy URLs). */
export async function GET(req: NextRequest) {
  const storeId = new URL(req.url).searchParams.get('storeId');
  const access = await assertStoreAccess(storeId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const db = getDb();
  const { data, error } = await db
    .from('merchant_store_documents')
    .select('*')
    .eq('store_id', access.storeIdNum)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    storeId: storeId!.trim(),
    documents: data ? normalizeStoreDocumentRowUrls(data as Record<string, unknown>) : null,
  });
}
