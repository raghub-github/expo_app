import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveStoreInternalId(db: ReturnType<typeof getDb>, storeId: string): Promise<number | null> {
  const { data, error } = await db
    .from('merchant_stores')
    .select('id, parent_id')
    .eq('store_id', storeId)
    .single();
  if (error || !data) return null;
  return data.id as number;
}

/**
 * GET /api/merchant/payout-quote?storeId=GMMC1015&amount=1000
 * Returns withdrawal breakdown: commission %, commission amount, net payout. Uses platform_commission_rules.
 */
export async function GET(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get('storeId') ?? req.nextUrl.searchParams.get('store_id');
    const amountParam = req.nextUrl.searchParams.get('amount');
    if (!storeId?.trim()) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }
    const amount = amountParam ? parseFloat(amountParam) : 0;
    if (isNaN(amount) || amount < 0) {
      return NextResponse.json({ error: 'Valid amount is required' }, { status: 400 });
    }

    const db = getDb();
    const { data: storeData, error: storeErr } = await db
      .from('merchant_stores')
      .select('id, parent_id')
      .eq('store_id', storeId.trim())
      .single();
    if (storeErr || !storeData) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }
    const merchantStoreId = storeData.id as number;
    const parentId = storeData.parent_id as number | null;

    let commissionPercentage = 0;
    const today = new Date().toISOString().slice(0, 10);
    // Effective rule: effective_from <= today AND (effective_to IS NULL OR effective_to >= today)
    let { data: rule } = await db
      .from('platform_commission_rules')
      .select('commission_percentage')
      .eq('merchant_store_id', merchantStoreId)
      .lte('effective_from', today)
      .or(`effective_to.is.null,effective_to.gte.${today}`)
      .order('effective_from', { ascending: false })
      .limit(1)
      .single();
    if (!rule && parentId != null) {
      const res = await db
        .from('platform_commission_rules')
        .select('commission_percentage')
        .eq('merchant_parent_id', parentId)
        .lte('effective_from', today)
        .or(`effective_to.is.null,effective_to.gte.${today}`)
        .order('effective_from', { ascending: false })
        .limit(1)
        .single();
      rule = res.data;
    }
    if (rule?.commission_percentage != null) {
      commissionPercentage = Number(rule.commission_percentage);
    }

    const commissionAmount = Math.round((amount * (commissionPercentage / 100)) * 100) / 100;
    const GST_ON_COMMISSION_PERCENT = 18;
    const gstOnCommission = Math.round((commissionAmount * GST_ON_COMMISSION_PERCENT) / 100 * 100) / 100;
    const tdsAmount = 0; // TDS reserved for future use
    const netPayoutAmount = Math.round((amount - commissionAmount - gstOnCommission - tdsAmount) * 100) / 100;

    return NextResponse.json({
      success: true,
      requested_amount: amount,
      commission_percentage: commissionPercentage,
      commission_amount: commissionAmount,
      gst_on_commission_percent: GST_ON_COMMISSION_PERCENT,
      gst_on_commission: gstOnCommission,
      tds_amount: tdsAmount,
      tax_amount: gstOnCommission,
      net_payout_amount: netPayoutAmount,
    });
  } catch (e) {
    console.error('[merchant/payout-quote]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
