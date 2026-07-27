import { NextRequest, NextResponse } from 'next/server';
import { assertStoreAccess } from '@/lib/auth/assert-store-access';
import { getPayoutSettlement } from '@/lib/merchant-payout-settlement';

/**
 * GET /api/merchant/wallet/payout-settlement?storeId=&from=&to=&cycleId=
 */
export async function GET(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get('storeId') ?? req.nextUrl.searchParams.get('store_id');
    const fromRaw = req.nextUrl.searchParams.get('from');
    const toRaw = req.nextUrl.searchParams.get('to');
    const cycleIdRaw = req.nextUrl.searchParams.get('cycleId') ?? req.nextUrl.searchParams.get('cycle_id');
    const cycleIdNum = cycleIdRaw ? Number(cycleIdRaw) : null;
    const cycleId =
      cycleIdNum != null && Number.isInteger(cycleIdNum) && cycleIdNum > 0 ? cycleIdNum : null;

    if (!storeId?.trim()) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    const periodStart = fromRaw ? new Date(fromRaw) : null;
    const periodEnd = toRaw ? new Date(toRaw) : null;
    if (
      !cycleId &&
      (!periodStart ||
        !periodEnd ||
        Number.isNaN(periodStart.getTime()) ||
        Number.isNaN(periodEnd.getTime()))
    ) {
      return NextResponse.json({ error: 'from_and_to_required' }, { status: 400 });
    }

    const access = await assertStoreAccess(storeId.trim());
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const settlement = await getPayoutSettlement(
      access.storeIdNum,
      periodStart ?? new Date(0),
      periodEnd ?? new Date(),
      { cycleId },
    );
    return NextResponse.json({ success: true, settlement });
  } catch (e) {
    console.error('[merchant/wallet/payout-settlement]', e);
    return NextResponse.json({ error: 'settlement_failed' }, { status: 500 });
  }
}
