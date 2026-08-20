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
  discountLabel?: string;
};

export function MerchantOrderBillSummary({
  items,
  pricing,
  showPaid = true,
  onTotalClick,
  className = '',
  compact = false,
  discountLabel,
}: Props) {
  const bill = merchantBillPartsFromItems(items, pricing);

  if (compact) {
    return (
      <div className={className}>
        <div className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-stone-200/80">
          {bill.discount > 0 || bill.packaging > 0.005 ? (
            <div
              className={`mb-2 grid gap-2 ${
                bill.discount > 0 && bill.packaging > 0.005 ? 'grid-cols-2' : 'grid-cols-1'
              }`}
            >
              {bill.discount > 0 ? (
                <div className="min-w-0 truncate text-[11px] leading-tight text-emerald-700">
                  <span className="font-semibold">{discountLabel ?? 'Discount'} </span>
                  <span className="font-bold tabular-nums">−{formatOrderRs(bill.discount)}</span>
                </div>
              ) : null}
              {bill.packaging > 0.005 ? (
                <div className="min-w-0 truncate text-right text-[11px] leading-tight text-stone-600">
                  <span className="font-medium">Packaging </span>
                  <span className="font-bold tabular-nums text-stone-900">
                    {formatOrderRs(bill.packaging)}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
          {onTotalClick ? (
            <button type="button" onClick={onTotalClick} className="group w-full text-left">
              <CompactTotal billTotal={bill.total} showPaid={showPaid} clickable />
            </button>
          ) : (
            <CompactTotal billTotal={bill.total} showPaid={showPaid} />
          )}
        </div>
      </div>
    );
  }

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
        <span className="text-2xl font-extrabold tabular-nums text-emerald-600">
          {formatOrderRs(bill.total, 0)}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-gray-500">
        All items (with customizations) + packaging − restaurant discount
      </p>
    </>
  );

  return (
    <div className={className}>
      <p className="mb-2 text-xs font-extrabold tracking-wide text-gray-500">TOTAL BILL</p>
      <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm">
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

function CompactTotal({
  billTotal,
  showPaid,
  clickable = false,
}: {
  billTotal: number;
  showPaid: boolean;
  clickable?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5">
        <span
          className={
            clickable
              ? 'text-sm font-semibold text-stone-900 underline decoration-dashed decoration-emerald-500 underline-offset-2 group-hover:decoration-emerald-700'
              : 'text-sm font-semibold text-stone-900'
          }
        >
          Total
        </span>
        {showPaid ? (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide text-emerald-800">
            PAID
          </span>
        ) : null}
      </span>
      <span className="text-xl font-extrabold leading-none tabular-nums text-emerald-600">
        {formatOrderRs(billTotal)}
      </span>
    </div>
  );
}
