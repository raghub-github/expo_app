'use client';

import { useState } from 'react';
import { ChevronDown, UtensilsCrossed } from 'lucide-react';
import type { NormalizedOrderLineItem } from '@/lib/orderLineItems';
import {
  formatOrderRs,
  merchantLineTotalForItem,
  orderItemCustomizationRows,
  orderItemHasBreakdown,
  orderItemVariantLabel,
} from '@/lib/merchant-order-item-display';
import { OrderItemPriceBreakdownModal } from '@/components/orders/OrderItemPriceBreakdownModal';

function VegMark({ vegNonveg, name }: { vegNonveg?: string | null; name?: string | null }) {
  const t = (vegNonveg ?? '').toLowerCase();
  let kind: 'veg' | 'non_veg' | 'neutral' = 'neutral';
  if (t.includes('non') || t === 'non_veg') kind = 'non_veg';
  else if (t.includes('veg')) kind = 'veg';
  else if (/\b(chicken|mutton|fish|egg|meat)\b/i.test(name ?? '')) kind = 'non_veg';
  else if (/\b(paneer|dal|veg|aloo)\b/i.test(name ?? '')) kind = 'veg';

  const border =
    kind === 'veg' ? 'border-green-600' : kind === 'non_veg' ? 'border-red-600' : 'border-gray-400';
  const dot =
    kind === 'veg' ? 'bg-green-600' : kind === 'non_veg' ? 'bg-red-600' : 'bg-transparent';

  return (
    <span
      className={`mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${border}`}
      aria-hidden
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
    </span>
  );
}

/** In compact incoming-order modal: max customization lines per item before "+N more". */
const COMPACT_MAX_CUST_ROWS = 4;

type Props = {
  items: NormalizedOrderLineItem[];
  requiresUtensils?: boolean | null;
  utensilsLabel?: string | null;
  maxItems?: number;
  onItemClick?: (item: NormalizedOrderLineItem) => void;
  className?: string;
  compact?: boolean;
  /** Parent shows +N more button; hide inline hint. */
  hideMoreHint?: boolean;
  /** When false, cutlery banner is shown by parent (e.g. incoming-order modal top row). */
  showUtensilsBanner?: boolean;
  /** Total quantity across all lines (sum of qty); overrides header count when preview is sliced. */
  totalItemCount?: number;
  /** Total line rows in the order (for +N more); when preview uses maxItems. */
  totalLineCount?: number;
};

export function MerchantOrderItemsList({
  items,
  requiresUtensils,
  utensilsLabel,
  maxItems,
  onItemClick,
  className = '',
  compact = false,
  hideMoreHint = false,
  showUtensilsBanner = true,
  totalItemCount,
  totalLineCount,
}: Props) {
  const [breakdownItem, setBreakdownItem] = useState<NormalizedOrderLineItem | null>(null);
  const preview = maxItems != null && maxItems > 0 ? items.slice(0, maxItems) : items;
  const lineCount = totalLineCount ?? items.length;
  const more =
    maxItems != null && maxItems > 0 && lineCount > maxItems ? lineCount - maxItems : 0;
  const headerCount =
    totalItemCount != null && totalItemCount > 0
      ? totalItemCount
      : items.reduce((acc, it) => acc + Math.max(1, Number(it.quantity) || 1), 0) ||
        lineCount;

  return (
    <div className={className}>
      {showUtensilsBanner && requiresUtensils && utensilsLabel ? (
        <div
          className={`mb-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 text-sm text-emerald-900 ${
            compact ? 'px-2.5 py-2' : 'px-3 py-2.5'
          }`}
        >
          <UtensilsCrossed size={16} className="mt-0.5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold leading-snug">{utensilsLabel}</p>
          </div>
        </div>
      ) : null}

      {!compact ? (
        <p className="mb-2 text-xs font-extrabold tracking-wide text-gray-500">
          ORDER ITEMS ({headerCount})
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {preview.length === 0 ? (
          <p className="px-3 py-4 text-sm text-gray-500">No items listed.</p>
        ) : (
          preview.map((item, i) => {
            const qty = Math.max(1, item.quantity || 1);
            const lineTotal = merchantLineTotalForItem(item);
            const clickable = orderItemHasBreakdown(item);
            const custRowsAll = orderItemCustomizationRows(item);
            const custHidden =
              compact && custRowsAll.length > COMPACT_MAX_CUST_ROWS
                ? custRowsAll.length - COMPACT_MAX_CUST_ROWS
                : 0;
            const custRows =
              custHidden > 0 ? custRowsAll.slice(0, COMPACT_MAX_CUST_ROWS) : custRowsAll;
            const variantLabel = orderItemVariantLabel(item);

            return (
              <div
                key={`${item.name}-${i}`}
                className={`${compact ? 'px-2.5 py-1.5' : 'px-3 py-2'} ${
                  i < preview.length - 1 ? 'border-b border-gray-100' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <VegMark vegNonveg={item.vegNonveg} name={item.name} />
                    <div className="min-w-0 flex-1">
                      {onItemClick ? (
                        <button
                          type="button"
                          onClick={() => onItemClick(item)}
                          className="text-left text-sm font-bold text-gray-900 underline decoration-gray-400 underline-offset-2 hover:decoration-blue-500"
                        >
                          {qty} × {item.name || `Item ${i + 1}`}
                        </button>
                      ) : (
                        <span className="text-sm font-bold text-gray-900">
                          {qty} × {item.name || `Item ${i + 1}`}
                        </span>
                      )}
                      {variantLabel ? (
                        <p className="mt-1 text-[11px] font-semibold leading-snug text-emerald-800">
                          {variantLabel}
                        </p>
                      ) : null}

                      {custRows.length > 0 ? (
                        <div className="mt-1 ml-1 border-l-2 border-teal-300 pl-2">
                          <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-700">
                            Customizations
                          </p>
                          <ul className="space-y-0">
                            {custRows.map((row, j) => (
                              <li
                                key={j}
                                className="flex items-start justify-between gap-2 text-[11px] leading-snug text-gray-600"
                              >
                                <span>
                                  <span className="mr-0.5 font-medium text-teal-700">↳</span>
                                  {row.label}
                                </span>
                                {row.amount != null ? (
                                  <span className="shrink-0 tabular-nums font-medium text-gray-800">
                                    {formatOrderRs(row.amount)}
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                    </div>
                  </div>

                  {clickable ? (
                    <button
                      type="button"
                      onClick={() => setBreakdownItem(item)}
                      className="inline-flex shrink-0 items-center gap-0.5 border-b-2 border-blue-600 pb-0.5 text-sm font-bold tabular-nums text-blue-600 hover:text-blue-700"
                      aria-label={`View price breakdown for ${item.name}`}
                    >
                      {formatOrderRs(lineTotal)}
                      <ChevronDown size={14} className="opacity-80" />
                    </button>
                  ) : (
                    <span className="shrink-0 text-sm font-bold tabular-nums text-gray-900">
                      {formatOrderRs(lineTotal)}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {more > 0 && !hideMoreHint ? (
        <p className="mt-2 text-xs font-semibold text-blue-600">+{more} more items</p>
      ) : null}

      <OrderItemPriceBreakdownModal
        item={breakdownItem}
        onClose={() => setBreakdownItem(null)}
      />
    </div>
  );
}
