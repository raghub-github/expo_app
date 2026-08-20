'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, UtensilsCrossed } from 'lucide-react';
import type { NormalizedOrderLineItem } from '@/lib/orderLineItems';
import {
  formatOrderRs,
  merchantItemCatalogAndNet,
  orderItemCookingNote,
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

const COMPACT_MAX_CUST_ROWS = 4;

type Props = {
  items: NormalizedOrderLineItem[];
  requiresUtensils?: boolean | null;
  utensilsLabel?: string | null;
  maxItems?: number;
  onItemClick?: (item: NormalizedOrderLineItem) => void;
  className?: string;
  compact?: boolean;
  hideMoreHint?: boolean;
  showUtensilsBanner?: boolean;
  totalItemCount?: number;
  totalLineCount?: number;
  headerRight?: ReactNode;
  /** Incoming-order: Item | Qty box | Amount (same as bill sidesheet). */
  showQuantityColumn?: boolean;
  onViewMore?: () => void;
  showOrderItemsHeader?: boolean;
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
  headerRight,
  showQuantityColumn = false,
  onViewMore,
  showOrderItemsHeader = false,
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
  const showHeader = !compact || showOrderItemsHeader;
  const showCardFooter = more > 0 && !!onViewMore;

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

      {showHeader ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-extrabold tracking-wide text-gray-500">
            ORDER ITEMS ({headerCount})
          </p>
          {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {preview.length === 0 ? (
          <p className="px-3 py-4 text-sm text-gray-500">No items listed.</p>
        ) : (
          <>
            {showQuantityColumn ? (
              <div className="grid grid-cols-[minmax(0,1fr)_48px_96px] items-center gap-x-2 border-b border-stone-200 bg-stone-50 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                <span>Item</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Amount</span>
              </div>
            ) : null}
            {preview.map((item, i) => {
              const qty = Math.max(1, item.quantity || 1);
              const {
                catalog: catalogTotal,
                net: netTotal,
                showStrike: showOfferStrike,
                offerBadge,
                offerKind,
              } = merchantItemCatalogAndNet(item);
              const clickable = orderItemHasBreakdown(item);
              const custRowsAll = orderItemCustomizationRows(item);
              const custHidden =
                compact && custRowsAll.length > COMPACT_MAX_CUST_ROWS
                  ? custRowsAll.length - COMPACT_MAX_CUST_ROWS
                  : 0;
              const custRows =
                custHidden > 0 ? custRowsAll.slice(0, COMPACT_MAX_CUST_ROWS) : custRowsAll;
              const variantLabel = orderItemVariantLabel(item);
              const cookingNote = orderItemCookingNote(item);

              return (
                <div
                  key={`${item.name}-${i}`}
                  className={`${compact ? 'px-2.5 py-2' : 'px-3 py-2'} ${
                    i < preview.length - 1 ? 'border-b border-stone-100' : ''
                  }`}
                >
                  <div
                    className={
                      showQuantityColumn
                        ? 'grid grid-cols-[minmax(0,1fr)_48px_96px] items-center gap-x-2'
                        : `flex justify-between gap-3 ${compact ? 'items-center' : 'items-start'}`
                    }
                  >
                    <div
                      className={`flex min-w-0 flex-1 gap-2 ${
                        compact && !cookingNote && !showQuantityColumn ? 'items-center' : 'items-start'
                      }`}
                    >
                      <VegMark vegNonveg={item.vegNonveg} name={item.name} />
                      <div className="min-w-0 flex-1">
                        {offerBadge ? (
                          <span
                            className={`mb-0.5 inline-flex max-w-full items-center rounded-md px-1.5 py-0.5 text-[9px] font-bold leading-tight tracking-wide ${
                              offerKind === 'bogo'
                                ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300/70'
                                : 'bg-amber-100 text-amber-950 ring-1 ring-amber-300/70'
                            }`}
                          >
                            <span className="truncate">{offerBadge}</span>
                          </span>
                        ) : null}
                        {onItemClick ? (
                          <button
                            type="button"
                            onClick={() => onItemClick(item)}
                            className={`block text-left font-semibold text-stone-900 underline decoration-stone-300 underline-offset-2 hover:decoration-emerald-600 ${
                              compact ? 'text-[13px]' : 'text-sm font-bold'
                            }`}
                          >
                            {showQuantityColumn ? null : (
                              <>
                                <span className="tabular-nums">{qty}</span> ×{' '}
                              </>
                            )}
                            {item.name || `Item ${i + 1}`}
                          </button>
                        ) : (
                          <span
                            className={`block font-semibold text-stone-900 ${
                              compact ? 'text-[13px]' : 'text-sm font-bold'
                            }`}
                          >
                            {showQuantityColumn ? null : (
                              <>
                                <span className="tabular-nums">{qty}</span> ×{' '}
                              </>
                            )}
                            {item.name || `Item ${i + 1}`}
                          </span>
                        )}
                        {cookingNote ? (
                          <p className="mt-1 text-[11px] font-semibold leading-snug text-amber-800">
                            Cooking: {cookingNote}
                          </p>
                        ) : null}
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
                            {custHidden > 0 ? (
                              <p className="mt-0.5 text-[10px] font-semibold text-teal-700">
                                +{custHidden} more
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {showQuantityColumn ? (
                      <div className="relative z-10 flex min-w-0 justify-center self-center">
                        <span className="inline-flex h-7 min-w-8 items-center justify-center rounded border border-stone-300 bg-white px-1.5 text-[13px] font-semibold tabular-nums text-stone-900">
                          {qty}
                        </span>
                      </div>
                    ) : null}

                    {clickable ? (
                      <button
                        type="button"
                        onClick={() => setBreakdownItem(item)}
                        className={`inline-flex shrink-0 flex-col items-end gap-0.5 text-sm font-bold text-stone-900 hover:text-emerald-800 ${
                          showQuantityColumn ? 'w-full min-w-0 justify-self-end overflow-hidden' : ''
                        }`}
                        aria-label={`View price breakdown for ${item.name}`}
                      >
                        {showOfferStrike ? (
                          <span className="block max-w-full truncate text-[11px] font-semibold text-stone-400 line-through">
                            {formatOrderRs(catalogTotal)}
                          </span>
                        ) : null}
                        <span className="inline-flex max-w-full items-center gap-0.5">
                          <span className="truncate">{formatOrderRs(netTotal)}</span>
                          <ChevronDown size={14} className="text-stone-500 opacity-80" />
                        </span>
                      </button>
                    ) : (
                      <span
                        className={`inline-flex shrink-0 flex-col items-end self-start pt-0.5 ${
                          showQuantityColumn ? 'w-full min-w-0 justify-self-end overflow-hidden' : ''
                        }`}
                      >
                        {showOfferStrike ? (
                          <span className="block max-w-full truncate text-[11px] font-semibold text-stone-400 line-through">
                            {formatOrderRs(catalogTotal)}
                          </span>
                        ) : null}
                        <span className="block max-w-full truncate text-sm font-bold tabular-nums text-stone-900">
                          {formatOrderRs(netTotal)}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {showCardFooter ? (
          <button
            type="button"
            onClick={onViewMore}
            className="w-full border-t border-blue-100 bg-blue-50 py-2.5 text-center text-sm font-bold text-blue-700 hover:bg-blue-100"
          >
            +{more} more items — view all
          </button>
        ) : null}
      </div>

      {more > 0 && !hideMoreHint && !showCardFooter ? (
        <p className="mt-2 text-xs font-semibold text-blue-600">+{more} more items</p>
      ) : null}

      <OrderItemPriceBreakdownModal
        item={breakdownItem}
        onClose={() => setBreakdownItem(null)}
      />
    </div>
  );
}
