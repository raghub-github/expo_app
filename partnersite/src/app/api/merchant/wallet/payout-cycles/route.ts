import { NextRequest, NextResponse } from 'next/server';
import { assertStoreAccess } from '@/lib/auth/assert-store-access';
import { listPayoutCycles } from '@/lib/merchant-payout-settlement';

/**
 * GET /api/merchant/wallet/payout-cycles?storeId=&limit=
 */
export async function GET(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get('storeId') ?? req.nextUrl.searchParams.get('store_id');
    const limit = Number(req.nextUrl.searchParams.get('limit') ?? '50');

    if (!storeId?.trim()) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    const access = await assertStoreAccess(storeId.trim());
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const cycles = await listPayoutCycles(access.storeIdNum, Number.isFinite(limit) ? limit : 50);
    return NextResponse.json({ success: true, cycles });
  } catch (e) {
    console.error('[merchant/wallet/payout-cycles]', e);
    return NextResponse.json({ error: 'payout_cycles_failed' }, { status: 500 });
  }
}
