'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { MXLayoutWhite } from '@/components/MXLayoutWhite';
import { PartnerPageHeader } from '@/context/PartnerShellHeaderContext';
import { PageSkeletonGeneric } from '@/components/PageSkeleton';
import { usePartnerStoreRecord } from '@/hooks/usePartnerStoreRecord';
import { PayoutDetailClient } from '@/components/payments/PayoutDetailClient';
import type { PayoutStatus } from '@/lib/merchant-payout-utils';
import {
  isValidPartnerStoreId,
  readPartnerSelectedStoreId,
} from '@/lib/partner-selected-store';

function resolveStoreIdFromSearch(
  searchParams: ReturnType<typeof useSearchParams> | null,
): string | null {
  const fromQuery = searchParams?.get('storeId')?.trim();
  if (isValidPartnerStoreId(fromQuery)) return fromQuery!;
  const fromReader = readPartnerSelectedStoreId();
  if (isValidPartnerStoreId(fromReader)) return fromReader;
  return null;
}

function PayoutDetailShellLoading() {
  return (
    <MXLayoutWhite restaurantName="Payout details">
      <PartnerPageHeader title="Payout details" subtitle="Loading payout…" />
      <PageSkeletonGeneric />
    </MXLayoutWhite>
  );
}

function PayoutDetailPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [storeId, setStoreId] = useState<string | null>(null);

  useEffect(() => {
    setStoreId(resolveStoreIdFromSearch(searchParams));
  }, [searchParams]);

  const { data: storeRecord } = usePartnerStoreRecord(storeId);

  const payoutId = String(params?.id ?? '');
  const netPayout = Number(searchParams?.get('netPayout') ?? 0);
  const orderCount = Number(searchParams?.get('orderCount') ?? 0);
  const periodStartIso = String(searchParams?.get('periodStart') ?? '').trim();
  const periodEndIso = String(searchParams?.get('periodEnd') ?? '').trim();
  const payoutDateIso = String(searchParams?.get('payoutDate') ?? '').trim();
  const status = (searchParams?.get('status') ?? 'PAID') as PayoutStatus;
  const isCurrentCycle =
    searchParams?.get('isCurrentCycle') === '1' || payoutId === 'current-cycle';
  const pgTransactionId = String(searchParams?.get('pgTransactionId') ?? '').trim();

  if (!storeId) {
    return <PayoutDetailShellLoading />;
  }

  const storeName = storeRecord?.store_name ?? 'Store';
  const storePublicId = storeRecord?.store_id ?? storeId;
  const storeLocation =
    storeRecord?.full_address?.split(',').slice(-2).join(',').trim() ?? '';

  return (
    <PayoutDetailClient
      storeId={storeId}
      payoutId={payoutId}
      netPayout={netPayout}
      orderCount={orderCount}
      periodStartIso={periodStartIso}
      periodEndIso={periodEndIso}
      payoutDateIso={payoutDateIso}
      status={status}
      isCurrentCycle={isCurrentCycle}
      pgTransactionId={pgTransactionId}
      storeName={storeName}
      storePublicId={storePublicId}
      storeLocation={storeLocation}
    />
  );
}

export default function PayoutDetailPage() {
  return (
    <Suspense fallback={<PayoutDetailShellLoading />}>
      <PayoutDetailPageContent />
    </Suspense>
  );
}
