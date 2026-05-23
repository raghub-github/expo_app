'use client';

import type { NormalizedOrderLineItem } from '@/lib/orderLineItems';
import type { OrderPricingBreakdown } from '@/lib/orderLineItems';
import {
  formatOrderRs,
  merchantBillPartsFromItems,
} from '@/lib/merchant-order-item-display';

type Props = {
  items: NormalizedOrderLineItem[];
  pricing: OrderPricingBreakdown;
  showPaid?: boolean;
  onTotalClick?: () => void;
  className?: string;
  compact?: boolean;
};

export function MerchantOrderBillSummary({
  items,
  pricing,
  showPaid = true,
  onTotalClick,
  className = '',
  compact = false,
}: Props) {
  const bill = merchantBillPartsFromItems(items, pricing);

  const totalBlock = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span
            className={
              onTotalClick
                ? 'text-sm font-extrabold tracking-wide text-gray-900 underline decoration-dashed decoration-gray-400 underline-offset-4 group-hover:decoration-blue-500'
                : 'text-sm font-extrabold tracking-wide text-gray-900'
            }
          >
            Total
          </span>
          {showPaid ? (
            <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
              PAID
            </span>
          ) : null}
        </span>
        <span
          className={
            compact
              ? 'text-xl font-extrabold tabular-nums text-emerald-600'
              : 'text-2xl font-extrabold tabular-nums text-emerald-600'
          }
        >
          {formatOrderRs(bill.total, 0)}
        </span>
      </div>
      {!compact ? (
        <p className="mt-1 text-[11px] text-gray-500">
          All items (with customizations) + packaging − restaurant discount
        </p>
      ) : null}
    </>
  );

  return (
    <div className={className}>
      {!compact ? (
        <p className="mb-2 text-xs font-extrabold tracking-wide text-gray-500">TOTAL BILL</p>
      ) : null}
      <div
        className={`rounded-xl border border-gray-200 bg-white text-sm ${
          compact ? 'px-2.5 py-2' : 'px-3 py-3'
        }`}
      >
        {bill.discount > 0 ? (
          <p className="mb-2 text-xs text-emerald-700">
            Restaurant discount −{formatOrderRs(bill.discount, 2)} applied in total
          </p>
        ) : null}
        {onTotalClick ? (
          <button type="button" onClick={onTotalClick} className="w-full text-left group">
            {totalBlock}
          </button>
        ) : (
          totalBlock
        )}
      </div>
    </div>
  );
}
