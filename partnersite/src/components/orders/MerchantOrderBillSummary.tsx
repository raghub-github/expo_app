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
  /** Label for the discount line (defaults to the generic restaurant-discount wording). */
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
                  <span className="incoming-num font-bold">−{formatOrderRs(bill.discount)}</span>
                </div>
              ) : null}
              {bill.packaging > 0.005 ? (
                <div className="min-w-0 truncate text-right text-[11px] leading-tight text-stone-600">
                  <span className="font-medium">Packaging </span>
                  <span className="incoming-num font-bold text-stone-900">
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
                ? 'text-sm font-semibold tracking-wide text-stone-900 underline decoration-dashed decoration-stone-300 underline-offset-4 group-hover:decoration-emerald-600'
                : 'text-sm font-semibold tracking-wide text-stone-900'
            }
          >
            Total
          </span>
          {showPaid ? (
            <span className="incoming-num rounded-md bg-emerald-100 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide text-emerald-800">
              PAID
            </span>
          ) : null}
        </span>
        <span className="incoming-num text-2xl font-extrabold text-emerald-600">
          {formatOrderRs(bill.total)}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-stone-500">
        All items (with customizations)
        {bill.packaging > 0.005 ? ` + packaging ${formatOrderRs(bill.packaging)}` : ''}
        {bill.discount > 0 ? ' − restaurant discount' : ''}
      </p>
    </>
  );

  return (
    <div className={className}>
      <p className="mb-2 text-xs font-extrabold tracking-wide text-stone-500">TOTAL BILL</p>
      <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm">
        {bill.discount > 0 || bill.packaging > 0.005 ? (
          <div
            className={`mb-2 grid gap-2 ${
              bill.discount > 0 && bill.packaging > 0.005 ? 'grid-cols-2' : 'grid-cols-1'
            }`}
          >
            {bill.discount > 0 ? (
              <div className="min-w-0 rounded-lg bg-emerald-50/80 px-2 py-1.5 ring-1 ring-emerald-100">
                <p className="text-[10px] font-semibold leading-tight text-emerald-800">
                  {discountLabel ?? 'Restaurant discount'}
                </p>
                <p className="incoming-num mt-0.5 truncate text-[12px] font-bold leading-tight text-emerald-700">
                  −{formatOrderRs(bill.discount)}
                  <span className="ml-1 text-[9px] font-semibold text-emerald-700/80">
                    applied
                  </span>
                </p>
              </div>
            ) : null}
            {bill.packaging > 0.005 ? (
              <div className="min-w-0 rounded-lg bg-stone-50 px-2 py-1.5 ring-1 ring-stone-200/70">
                <p className="text-[10px] font-semibold leading-tight text-stone-600">
                  Packaging (you receive)
                </p>
                <p className="incoming-num mt-0.5 text-[12px] font-bold leading-tight text-stone-900">
                  {formatOrderRs(bill.packaging)}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
        {onTotalClick ? (
          <button type="button" onClick={onTotalClick} className="group w-full text-left">
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
              ? 'text-sm font-semibold text-stone-900 underline decoration-dashed decoration-stone-300 underline-offset-2'
              : 'text-sm font-semibold text-stone-900'
          }
        >
          Total
        </span>
        {showPaid ? (
          <span className="incoming-num rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide text-emerald-800">
            PAID
          </span>
        ) : null}
      </span>
      <span className="incoming-num text-xl font-extrabold leading-none text-emerald-600">
        {formatOrderRs(billTotal)}
      </span>
    </div>
  );
}
