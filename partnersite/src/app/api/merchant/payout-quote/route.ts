import { NextRequest, NextResponse } from 'next/server';
import { roundMoney } from '@/lib/wallet-types';

/**
 * GET /api/merchant/payout-quote?storeId=GMMC1015&amount=1000
 * Returns withdrawal quote — merchant receives the full requested amount (no commission at withdrawal).
 */
export async function GET(req: NextRequest) {
  try {
    const amountParam = req.nextUrl.searchParams.get('amount');
    const amount = amountParam ? parseFloat(amountParam) : 0;
    if (isNaN(amount) || amount < 0) {
      return NextResponse.json({ error: 'Valid amount is required' }, { status: 400 });
    }

    const net = roundMoney(amount);

    return NextResponse.json({
      success: true,
      requested_amount: net,
      commission_percentage: 0,
      commission_amount: 0,
      gst_on_commission_percent: 0,
      gst_on_commission: 0,
      tds_amount: 0,
      tax_amount: 0,
      net_payout_amount: net,
    });
  } catch (e) {
    console.error('[merchant/payout-quote]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
