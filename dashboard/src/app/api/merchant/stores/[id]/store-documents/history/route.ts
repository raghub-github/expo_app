import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateMerchantStoreForId } from "@/lib/merchant-store-route-auth";
import {
  listLicenceHistoryForStore,
  listLicenceHistoryGrouped,
  reconcileActiveHistoryWithVerifiedDocs,
  type MerchantLicenceHistoryRow,
} from "@/lib/merchantLicenceHistory";
import { DOCUMENT_FORMAL_NAMES, type MerchantDocumentPrefix } from "@/lib/merchantLicenseExpiry";

export const runtime = "nodejs";

function getDb() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function serializeRow(row: MerchantLicenceHistoryRow) {
  return {
    id: row.id,
    licence_type: row.licence_type,
    licence_type_label:
      DOCUMENT_FORMAL_NAMES[row.licence_type as MerchantDocumentPrefix] ?? row.licence_type,
    licence_number: row.licence_number,
    file_url: row.file_url,
    back_file_url: row.back_file_url,
    issued_at: row.issued_at,
    expires_at: row.expires_at,
    uploaded_at: row.uploaded_at,
    verification_status: row.verification_status,
    is_active: row.is_active,
    is_expired: row.is_expired,
    replaced_by: row.replaced_by,
    previous_licence_id: row.previous_licence_id,
  };
}

/** GET ?licenceType=fssai (optional) */
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

  const licenceType = new URL(request.url).searchParams.get("licenceType");
  const db = getDb();
  await reconcileActiveHistoryWithVerifiedDocs(
    db,
    storeId,
    licenceType && licenceType.trim() ? (licenceType.trim() as MerchantDocumentPrefix) : undefined
  );

  if (licenceType && licenceType.trim()) {
    const rows = await listLicenceHistoryForStore(
      db,
      storeId,
      licenceType.trim() as MerchantDocumentPrefix
    );
    const active = rows.find((r) => r.is_active) ?? null;
    const history = rows.filter((r) => !r.is_active || r.id !== active?.id);
    return NextResponse.json({
      licence_type: licenceType,
      active: active ? serializeRow(active) : null,
      history: history.map(serializeRow),
      all: rows.map(serializeRow),
    });
  }

  const grouped = await listLicenceHistoryGrouped(db, storeId);
  const byType: Record<
    string,
    { active: ReturnType<typeof serializeRow> | null; history: ReturnType<typeof serializeRow>[] }
  > = {};

  for (const [type, rows] of Object.entries(grouped)) {
    if (!rows?.length) continue;
    const active = rows.find((r) => r.is_active) ?? rows[0];
    const history = rows.filter((r) => r.id !== active.id || !r.is_active);
    byType[type] = {
      active: active ? serializeRow(active) : null,
      history: history.map(serializeRow),
    };
  }

  return NextResponse.json({ by_type: byType });
}
