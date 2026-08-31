import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateMerchantStoreForId } from "@/lib/merchant-store-route-auth";
import { enrichLicenseEvaluation } from "@/lib/merchantLicenseExpiry";
import { listLicenceHistoryGrouped } from "@/lib/merchantLicenceHistory";
import { loadMerchantLicenseEvaluation } from "@/lib/syncMerchantLicenseCompliance";

export const runtime = "nodejs";

function getDb() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** GET — licence expiry / renewal status for control dashboard merchant portal */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const storeId = Number(id);
  if (!Number.isInteger(storeId) || storeId < 1) {
    return NextResponse.json({ error: "Invalid store id" }, { status: 400 });
  }

  const auth = await authenticateMerchantStoreForId(request, storeId);
  if (!auth.ok) return auth.response;

  const db = getDb();
  const { data: docRow } = await db
    .from("merchant_store_documents")
    .select("*")
    .eq("store_id", storeId)
    .maybeSingle();

  const evaluation = await loadMerchantLicenseEvaluation(db, storeId);
  const enriched = enrichLicenseEvaluation(evaluation, (docRow ?? {}) as Record<string, unknown>);
  const historyGrouped = await listLicenceHistoryGrouped(db, storeId);

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
