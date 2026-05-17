import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertStoreAccess } from '@/lib/auth/assert-store-access';
import { enrichLicenseEvaluation } from '@/lib/merchantLicenseExpiry';
import { listLicenceHistoryGrouped } from '@/lib/merchantLicenceHistory';
import { loadMerchantLicenseEvaluation } from '@/lib/syncMerchantLicenseCompliance';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** GET ?storeId=GMMC1001 — licence expiry / renewal status for partner UI */
export async function GET(req: NextRequest) {
  const storeId = new URL(req.url).searchParams.get('storeId');
  const access = await assertStoreAccess(storeId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const db = getDb();
  const { data: docRow } = await db
    .from('merchant_store_documents')
    .select('*')
    .eq('store_id', access.storeIdNum)
    .maybeSingle();

  const evaluation = await loadMerchantLicenseEvaluation(db, access.storeIdNum);
  const enriched = enrichLicenseEvaluation(evaluation, (docRow ?? {}) as Record<string, unknown>);
  const historyGrouped = await listLicenceHistoryGrouped(db, access.storeIdNum);

  return NextResponse.json({
    license_blocked: enriched.evaluation.blocked,
    license_can_manual_open: enriched.evaluation.can_manual_open,
    license_expired_documents: enriched.evaluation.expired,
    license_pending_verification: enriched.evaluation.pending_verification,
    license_expiring_soon: enriched.evaluation.expiring_soon,
    documents: enriched.evaluation.documents,
    action_items: enriched.action_items,
    uploadable_items: enriched.uploadable_items,
    licence_history: historyGrouped,
  });
}
