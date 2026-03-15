/**
 * GET /api/merchant/invoice/[payoutRequestId]?storeId=GMMC1015&format=pdf|csv
 * Download withdrawal invoice (PDF or CSV). Merchant can only access own store's invoices.
 * If payout is COMPLETED and invoice not yet generated, generates it idempotently.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant';
import {
  ensureWithdrawalInvoice,
  getWithdrawalInvoiceByPayoutForMerchant,
} from '@/lib/invoice-withdrawal';
import { generateWithdrawalInvoicePdf } from '@/lib/invoice-withdrawal-pdf';
import { generateWithdrawalInvoiceCsv } from '@/lib/invoice-withdrawal-csv';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ payoutRequestId: string }> }
) {
  try {
    const { payoutRequestId: payoutIdParam } = await params;
    const payoutRequestId = parseInt(payoutIdParam, 10);
    if (isNaN(payoutRequestId)) {
      return NextResponse.json({ error: 'Invalid payout request id' }, { status: 400 });
    }

    const format = (req.nextUrl.searchParams.get('format') ?? 'pdf').toLowerCase();
    if (format !== 'pdf' && format !== 'csv') {
      return NextResponse.json({ error: 'format must be pdf or csv' }, { status: 400 });
    }

    const storeId = req.nextUrl.searchParams.get('storeId') ?? req.nextUrl.searchParams.get('store_id');
    if (!storeId?.trim()) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (!validation.isValid || validation.merchantParentId == null) {
      return NextResponse.json({ error: 'Merchant not found' }, { status: 403 });
    }

    const db = getDb();
    const { data: storeRow, error: storeErr } = await db
      .from('merchant_stores')
      .select('id, parent_id')
      .eq('store_id', storeId.trim())
      .single();
    if (storeErr || !storeRow) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }
    if ((storeRow as { parent_id: number }).parent_id !== validation.merchantParentId) {
      return NextResponse.json({ error: 'Store not accessible' }, { status: 403 });
    }
    const merchantStoreId = storeRow.id as number;

    const { data: payout } = await db
      .from('merchant_payout_requests')
      .select('id, status, wallet_id')
      .eq('id', payoutRequestId)
      .single();

    if (!payout) {
      return NextResponse.json({ error: 'Payout request not found' }, { status: 404 });
    }

    const { data: wallet } = await db
      .from('merchant_wallet')
      .select('merchant_store_id')
      .eq('id', payout.wallet_id)
      .single();

    if (!wallet || (wallet.merchant_store_id as number) !== merchantStoreId) {
      return NextResponse.json({ error: 'Payout not found for this store' }, { status: 404 });
    }

    if (payout.status === 'COMPLETED') {
      await ensureWithdrawalInvoice(db, payoutRequestId);
    }

    const data = await getWithdrawalInvoiceByPayoutForMerchant(db, payoutRequestId, merchantStoreId);
    if (!data) {
      return NextResponse.json(
        { error: 'Invoice not available. Invoice is generated only after payout is completed.' },
        { status: 404 }
      );
    }

    const { invoice, items } = data;

    if (format === 'pdf') {
      const pdfBuffer = generateWithdrawalInvoicePdf(invoice, items);
      return new NextResponse(Buffer.from(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="withdrawal-invoice-${invoice.invoice_number}.pdf"`,
        },
      });
    }

    const csv = generateWithdrawalInvoiceCsv(invoice, items);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="withdrawal-invoice-${invoice.invoice_number}.csv"`,
      },
    });
  } catch (e) {
    console.error('[merchant/invoice]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
