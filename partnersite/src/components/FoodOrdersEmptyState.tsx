'use client';

import React from 'react';
import { Search } from 'lucide-react';
import { MerchantAppAssetImage, MX_ASSET } from '@/components/MerchantAppAssetImage';

export type FoodOrdersEmptyVariant =
  | 'NEW_ORDERS'
  | 'SCHEDULED'
  | 'PREPARING'
  | 'READY_FOR_PICKUP'
  | 'OUT_FOR_DELIVERY'
  | 'RTO'
  | 'search';

const COPY: Record<
  Exclude<FoodOrdersEmptyVariant, 'search'>,
  { line1: string; line2: string }
> = {
  NEW_ORDERS: {
    line1: 'No new orders waiting for acceptance',
    line2: 'Incoming orders you haven’t accepted yet will appear here',
  },
  SCHEDULED: {
    line1: 'No scheduled orders for later',
    line2: 'Future-dated orders will appear here',
  },
  PREPARING: {
    line1: 'No orders in preparing right now',
    line2: 'Orders you’re preparing on GatiMitra will show up here',
  },
  READY_FOR_PICKUP: {
    line1: 'No orders ready for pickup',
    line2: 'Packed orders waiting for pickup will appear here',
  },
  OUT_FOR_DELIVERY: {
    line1: 'No orders out for delivery',
    line2: 'Orders picked up by riders will appear here',
  },
  RTO: {
    line1: 'No return-to-origin orders right now',
    line2: 'RTO cases will list here when they occur',
  },
};

const ASSET_BY_VARIANT: Record<
  Exclude<FoodOrdersEmptyVariant, 'search'>,
  string
> = {
  NEW_ORDERS: MX_ASSET.ordersEmptyNew,
  SCHEDULED: MX_ASSET.ordersEmptyScheduled,
  PREPARING: MX_ASSET.ordersEmptyPreparing,
  READY_FOR_PICKUP: MX_ASSET.ordersEmptyReady,
  OUT_FOR_DELIVERY: MX_ASSET.ordersEmptyPickedUp,
  RTO: MX_ASSET.ordersEmptyRto,
};

export function FoodOrdersEmptyState({ variant }: { variant: FoodOrdersEmptyVariant }) {
  if (variant === 'search') {
    return (
      <div className="flex min-h-[min(60vh,420px)] flex-col items-center justify-center px-4 py-12 text-center sm:py-20">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-orange-50 text-orange-500">
          <Search className="h-10 w-10 opacity-80" strokeWidth={1.5} />
        </div>
        <p className="text-base font-medium text-slate-700 sm:text-lg">No order matches that ID</p>
        <p className="mt-1 text-sm text-slate-500">Try another 4 digits from the order number</p>
      </div>
    );
  }

  const { line1, line2 } = COPY[variant];
  const assetKey = ASSET_BY_VARIANT[variant];

  return (
    <div className="flex min-h-[min(60vh,420px)] flex-col items-center justify-center px-4 py-10 text-center sm:py-16">
      <div className="mb-4 flex w-full max-w-[320px] items-center justify-center">
        <MerchantAppAssetImage
          assetKey={assetKey}
          alt={line1}
          refresh
          className="h-auto w-full max-h-[280px] max-w-[280px] object-contain bg-transparent"
          style={{ backgroundColor: 'transparent' }}
        />
      </div>
      <p className="max-w-md text-base font-medium text-slate-700 sm:text-lg">{line1}</p>
      <p className="mt-1 text-sm text-slate-500 sm:text-base">{line2}</p>
    </div>
  );
}
