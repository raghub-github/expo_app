import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractR2KeyFromUrl, toStoredDocumentUrl } from '@/lib/r2';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveStoreInternalId(db: ReturnType<typeof getDb>, storeIdParam: string): Promise<number | null> {
  const { data, error } = await db
    .from('merchant_stores')
    .select('id')
    .eq('store_id', storeIdParam.trim())
    .single();
  if (error || !data) return null;
  return data.id as number;
}

/**
 * GET /api/merchant/agreement?storeId=GMMC1015
 * Returns the store's signed agreement acceptance (from onboarding) with a fresh signed URL
 * for the contract PDF (view/download). Includes commission and effective dates if stored.
 */
export async function GET(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get('storeId') ?? req.nextUrl.searchParams.get('store_id');
    if (!storeId?.trim()) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    const db = getDb();
    const internalId = await resolveStoreInternalId(db, storeId.trim());
    if (internalId === null) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const { data: row, error } = await db
      .from('merchant_store_agreement_acceptances')
      .select('id, store_id, template_key, template_version, template_snapshot, contract_pdf_url, signer_name, signer_email, signer_phone, accepted_at, acceptance_source')
      .eq('store_id', internalId)
      .single();

    if (error || !row) {
      return NextResponse.json({ error: 'No agreement found for this store' }, { status: 404 });
    }

    let contractPdfUrl: string | null = (row.contract_pdf_url as string) || null;
    const snapshot = (row.template_snapshot as Record<string, unknown>) || {};
    const r2Key = (snapshot.r2_key as string) || (contractPdfUrl ? extractR2KeyFromUrl(contractPdfUrl) : null);

    // Prefer proxy URL so contract is always accessible (no expiry); proxy serves on demand
    if (r2Key) {
      contractPdfUrl = toStoredDocumentUrl(r2Key) || contractPdfUrl;
    }

    const rowAny = row as Record<string, unknown>;
    const commissionFirst = rowAny.commission_first_month_pct != null ? Number(rowAny.commission_first_month_pct) : (snapshot.commission_first_month_pct != null ? Number(snapshot.commission_first_month_pct) : null);
    const commissionSecond = rowAny.commission_from_second_month_pct != null ? Number(rowAny.commission_from_second_month_pct) : (snapshot.commission_from_second_month_pct != null ? Number(snapshot.commission_from_second_month_pct) : null);
    const effectiveFrom = (rowAny.agreement_effective_from as string) ?? (snapshot.agreement_effective_from as string) ?? null;
    const effectiveTo = (rowAny.agreement_effective_to as string) ?? (snapshot.agreement_effective_to as string) ?? null;

    return NextResponse.json({
      success: true,
      acceptance: {
        id: row.id,
        store_id: row.store_id,
        template_key: row.template_key,
        template_version: row.template_version,
        signer_name: row.signer_name,
        signer_email: row.signer_email ?? null,
        signer_phone: row.signer_phone ?? null,
        accepted_at: row.accepted_at,
        acceptance_source: row.acceptance_source,
        contract_pdf_url: contractPdfUrl,
        commission_first_month_pct: commissionFirst,
        commission_from_second_month_pct: commissionSecond,
        agreement_effective_from: effectiveFrom,
        agreement_effective_to: effectiveTo,
      },
    });
  } catch (e) {
    console.error('[merchant/agreement]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
