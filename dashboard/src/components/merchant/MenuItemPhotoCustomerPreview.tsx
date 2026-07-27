"use client";

import { useEffect, useMemo, useState } from "react";
import { R2Image } from "@/components/ui/R2Image";
import { ITEM_PLACEHOLDER_SVG, getFoodTypeLabel } from "@/app/dashboard/merchants/stores/[id]/menu/menu-types";
import { markupCustomerPrice } from "@/lib/customer-pricing";

type PreviewItem = {
  item_name: string;
  item_description?: string | null;
  item_image_url?: string | null;
  food_type?: string | null;
  /** Merchant NET selling price (as stored in DB). */
  selling_price: number;
  /** Merchant NET base / MRP (as stored in DB). */
  base_price?: number | null;
};

type CustomerPrices = {
  ready: boolean;
  selling: number;
  base: number;
  showOffer: boolean;
};

function VegDietMark({ foodType }: { foodType?: string | null }) {
  const ft = String(foodType ?? "").toUpperCase();
  const isVeg = ft === "VEG" || ft === "VEGAN";
  const isEgg = ft === "EGG";
  const borderColor = isVeg ? "#16a34a" : isEgg ? "#ca8a04" : "#dc2626";
  return (
    <span
      className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border-2"
      style={{ borderColor }}
      aria-hidden
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: borderColor }} />
    </span>
  );
}

function formatPrice(amount: number): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "₹0";
  return `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

function WebsiteMenuItemPreview({
  item,
  categoryLabel,
  prices,
}: {
  item: PreviewItem;
  categoryLabel?: string;
  prices: CustomerPrices;
}) {
  const foodLabel = getFoodTypeLabel(item.food_type);
  const isVeg = String(item.food_type ?? "").toUpperCase() === "VEG";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex gap-4 sm:gap-5">
        <div className="h-[88px] w-[88px] shrink-0 overflow-hidden rounded-2xl ring-1 ring-gray-200 shadow-[0_12px_40px_-20px_rgba(75,42,212,0.25)] sm:h-[104px] sm:w-[104px]">
          <R2Image
            src={item.item_image_url}
            alt={item.item_name}
            className="h-full w-full object-cover"
            fallbackSrc={ITEM_PLACEHOLDER_SVG}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight text-gray-900 sm:text-lg">{item.item_name}</h3>
            {foodLabel ? (
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  isVeg ? "bg-teal-50 text-teal-700" : "bg-pink-50 text-pink-700"
                }`}
              >
                {foodLabel}
              </span>
            ) : null}
          </div>
          {categoryLabel ? <p className="mt-1 text-xs text-gray-500">{categoryLabel}</p> : null}
          {item.item_description?.trim() ? (
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-gray-600">{item.item_description.trim()}</p>
          ) : null}
          <div className="mt-3 text-right sm:text-left">
            {!prices.ready ? (
              <span className="text-sm text-gray-400">Loading price…</span>
            ) : prices.showOffer ? (
              <>
                <span className="block text-sm text-gray-400 line-through">{formatPrice(prices.base)}</span>
                <span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-teal-500 sm:text-xl">
                  {formatPrice(prices.selling)}
                </span>
              </>
            ) : (
              <span className="text-lg font-bold text-gray-900 sm:text-xl">{formatPrice(prices.selling)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomerAppMenuItemPreview({
  item,
  prices,
}: {
  item: PreviewItem;
  prices: CustomerPrices;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <VegDietMark foodType={item.food_type} />
            <p className="text-[15px] font-semibold leading-5 text-gray-900 line-clamp-2">{item.item_name}</p>
          </div>
          <div className="mt-2">
            {!prices.ready ? (
              <p className="text-sm text-gray-400">Loading price…</p>
            ) : prices.showOffer ? (
              <>
                <span className="text-sm text-gray-400 line-through">{formatPrice(prices.base)}</span>
                <p className="text-sm font-semibold text-gray-900">Get for {formatPrice(prices.selling)}</p>
              </>
            ) : (
              <p className="text-sm font-semibold text-gray-900">{formatPrice(prices.selling)}</p>
            )}
          </div>
          {item.item_description?.trim() ? (
            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-gray-500">{item.item_description.trim()}</p>
          ) : null}
        </div>
        <div className="flex w-[118px] shrink-0 flex-col items-center gap-2">
          <div className="h-[118px] w-[118px] overflow-hidden rounded-xl bg-gray-100">
            <R2Image
              src={item.item_image_url}
              alt={item.item_name}
              className="h-full w-full object-cover"
              fallbackSrc={ITEM_PLACEHOLDER_SVG}
            />
          </div>
          <div className="flex h-8 w-[88px] items-center justify-center rounded-lg border border-teal-500 text-sm font-bold text-teal-600">
            ADD
          </div>
        </div>
      </div>
    </div>
  );
}

export function MenuItemPhotoCustomerPreview({
  item,
  categoryLabel,
  storeId,
}: {
  item: PreviewItem;
  categoryLabel?: string;
  /** Numeric store PK — used to resolve live commission for customer price markup. */
  storeId?: string | number | null;
}) {
  const [commissionPercent, setCommissionPercent] = useState<number | null>(null);

  useEffect(() => {
    if (storeId == null || String(storeId).trim() === "") {
      setCommissionPercent(0);
      return;
    }
    let cancelled = false;
    setCommissionPercent(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/merchant/stores/${encodeURIComponent(String(storeId))}/effective-commission`,
          { credentials: "include", cache: "no-store" }
        );
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          percent?: number;
        };
        if (cancelled) return;
        const pct = Number(data.percent);
        setCommissionPercent(res.ok && data.success && Number.isFinite(pct) ? pct : 0);
      } catch {
        if (!cancelled) setCommissionPercent(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  const prices = useMemo<CustomerPrices>(() => {
    const netSelling = Number(item.selling_price) || 0;
    const netBase = Number(item.base_price) || 0;
    if (commissionPercent == null) {
      return { ready: false, selling: netSelling, base: netBase, showOffer: false };
    }
    // Mirror customer menu read path: mark up BOTH net selling and net base.
    const selling = markupCustomerPrice(netSelling, commissionPercent);
    const base = netBase > 0 ? markupCustomerPrice(netBase, commissionPercent) : 0;
    return {
      ready: true,
      selling,
      base,
      showOffer: base > selling && selling > 0,
    };
  }, [item.selling_price, item.base_price, commissionPercent]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Preview how this photo appears to customers after approval. Prices match the customer app
        and website (commission included).
      </p>
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">Customer website</p>
        <WebsiteMenuItemPreview item={item} categoryLabel={categoryLabel} prices={prices} />
      </div>
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">Customer app</p>
        <CustomerAppMenuItemPreview item={item} prices={prices} />
      </div>
    </div>
  );
}
