"use client";

import React, { useMemo } from "react";
import { ChevronDown, ChevronUp, Edit2, Trash2, Copy } from "lucide-react";
import type { Offer } from "./offers-types";
import {
  formatOfferActorDisplay,
  formatOfferSlotSummary,
  formatOfferValidityRange,
  getOfferLifecycle,
  getOfferStatusBadge,
  hasOfferScheduleRestrictions,
  offerWasUpdated,
} from "./offer-lifecycle";

/** @deprecated Use getOfferPlatformLabel from offer-lifecycle */
export { getOfferPlatformLabel as getOfferCreatedByLabel } from "./offer-lifecycle";

function formatStoppedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${date}, ${time}`;
}

function formatInr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function offerHeadline(offer: Offer): string {
  const flat = offer.discount_value != null && offer.discount_value !== "" ? Number(offer.discount_value) : null;
  const pct =
    offer.discount_percentage != null && offer.discount_percentage !== ""
      ? Number(offer.discount_percentage)
      : flat;
  switch (offer.offer_type) {
    case "FLAT":
    case "CART_FLAT":
      return flat != null && !Number.isNaN(flat) ? `flat ${formatInr(flat)} off` : offer.offer_title;
    case "PERCENTAGE":
    case "CART_PERCENTAGE":
      return pct != null && !Number.isNaN(pct) ? `${pct}% off` : offer.offer_title;
    case "FREE_DELIVERY":
      return "Free delivery";
    case "BUY_X_GET_Y":
    case "BUY_N_GET_M":
    case "BOGO":
      return `Buy ${offer.buy_quantity ?? 1} get ${offer.get_quantity ?? 1} free`;
    case "COUPON":
      return offer.coupon_code ? `Coupon · ${offer.coupon_code}` : "Coupon offer";
    case "FREE_ITEM":
      return "Free item offer";
    case "TIERED":
      return "Tiered discount";
    case "BUNDLE":
      return offer.offer_title || "Bundle deal";
    default:
      return offer.offer_title || "Offer";
  }
}

function getOfferAnalytics(offer: Offer) {
  const meta = (offer.offer_metadata ?? {}) as Record<string, unknown>;
  const orders = Number(meta.orders_delivered ?? offer.current_uses ?? 0) || 0;
  const gross = Number(meta.gross_sales ?? 0) || 0;
  const discount = Number(meta.discount_given ?? 0) || 0;
  let effPct: number | null =
    meta.effective_discount_pct != null ? Number(meta.effective_discount_pct) : null;
  if ((effPct == null || Number.isNaN(effPct)) && gross > 0 && discount > 0) {
    effPct = Math.round((discount / gross) * 1000) / 10;
  }
  if (effPct == null || Number.isNaN(effPct)) {
    const p = offer.discount_percentage != null ? Number(offer.discount_percentage) : null;
    effPct = p != null && !Number.isNaN(p) ? p : 0;
  }
  return { gross, orders, discount, effPct };
}

function buildApplicableForText(
  offer: Offer,
  storeName: string | null,
  getMenuItemName: (id: string) => string
): string {
  const parts: string[] = [];
  if (offer.first_order_only) parts.push("first-order customers");
  else if (offer.new_user_only) parts.push("new users");
  else parts.push("all users");

  if (offer.offer_sub_type === "SPECIFIC_ITEM" && offer.menu_item_ids?.length) {
    const names = offer.menu_item_ids.slice(0, 3).map(getMenuItemName);
    const more = offer.menu_item_ids.length > 3 ? ` +${offer.menu_item_ids.length - 3} more` : "";
    parts.push(`on selected menu items (${names.join(", ")}${more})`);
  } else {
    parts.push("on all menu items");
  }

  return `Offer applicable for: ${parts.join(" ")}${storeName ? ` at ${storeName}` : ""}`;
}

function MetricBox({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 rounded-md border border-gray-200/90 bg-white px-2 py-1.5 text-center">
      <p className="text-sm font-bold text-gray-900 tabular-nums leading-tight truncate">{value}</p>
      <p className="text-[10px] text-gray-500 mt-0.5 leading-tight truncate">{label}</p>
    </div>
  );
}

export function OfferTrackCard({
  offer,
  storeName,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onCopyCoupon,
  getMenuItemName,
}: {
  offer: Offer;
  storeName: string | null;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopyCoupon?: (code: string) => void;
  getMenuItemName: (id: string) => string;
}) {
  const lifecycle = useMemo(() => getOfferLifecycle(offer), [offer]);
  const status = getOfferStatusBadge(lifecycle);
  const analytics = useMemo(() => getOfferAnalytics(offer), [offer]);
  const headline = offerHeadline(offer);
  const dateRange = formatOfferValidityRange(offer);
  const slotSummary = formatOfferSlotSummary(offer);
  const showStopped = lifecycle.phase === "inactive" && lifecycle.reason === "expired";
  const createdByDisplay = formatOfferActorDisplay(offer.created_source_platform, offer.created_by_name);
  const updatedByDisplay = offerWasUpdated(offer)
    ? formatOfferActorDisplay(
        offer.updated_source_platform ?? offer.created_source_platform,
        offer.updated_by_name
      )
    : null;

  const detailRows: { label: string; value: React.ReactNode }[] = [
    ...(showStopped
      ? [{ label: "Stopped at:", value: formatStoppedAt(offer.updated_at || offer.valid_till) }]
      : []),
    {
      label: "",
      value: buildApplicableForText(offer, storeName, getMenuItemName),
    },
    {
      label: "Time slot:",
      value: (
        <span className={hasOfferScheduleRestrictions(offer) ? "text-gray-800" : "text-amber-700"}>
          {slotSummary}
          {!hasOfferScheduleRestrictions(offer) ? " — Active for full campaign dates (no slot)" : ""}
        </span>
      ),
    },
    ...(offer.min_order_amount
      ? [{ label: "Min order:", value: formatInr(Number(offer.min_order_amount)) }]
      : []),
    ...(offer.max_discount_amount
      ? [{ label: "Max discount:", value: formatInr(Number(offer.max_discount_amount)) }]
      : []),
    ...(storeName ? [{ label: "Valid at:", value: storeName }] : []),
    { label: "Funding:", value: "100% merchant-funded" },
    ...(offer.max_uses_total != null
      ? [
          {
            label: "Redemptions:",
            value: `${offer.current_uses ?? 0} / ${offer.max_uses_total}`,
          },
        ]
      : []),
    {
      label: "Created by:",
      value: <strong className="text-gray-800">{createdByDisplay}</strong>,
    },
    {
      label: "Updated by:",
      value: (
        <strong className="text-gray-800">
          {updatedByDisplay ?? "Not updated yet"}
        </strong>
      ),
    },
  ];

  if (offer.offer_type === "COUPON" && offer.coupon_code) {
    detailRows.unshift({
      label: "Coupon:",
      value: (
        <span className="inline-flex items-center gap-1 font-mono font-semibold text-xs">
          {offer.coupon_code}
          {onCopyCoupon ? (
            <button
              type="button"
              onClick={() => onCopyCoupon(offer.coupon_code!)}
              className="text-gray-400 hover:text-blue-600"
              aria-label="Copy coupon"
            >
              <Copy size={11} />
            </button>
          ) : null}
        </span>
      ),
    });
  }

  return (
    <article className="w-full min-w-0 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Compact header + metrics row */}
      <div className="bg-gradient-to-r from-sky-50/90 via-blue-50/50 to-white px-3 sm:px-4 py-2.5 border-b border-gray-100">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <h3 className="text-base font-bold text-gray-900 capitalize leading-tight">{headline}</h3>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${status.className}`}
              >
                {status.label}
              </span>
            </div>
            {offer.offer_title && offer.offer_title.toLowerCase() !== headline.toLowerCase() ? (
              <p className="text-xs text-gray-600 truncate mt-0.5">{offer.offer_title}</p>
            ) : null}
            <p className="text-[11px] text-gray-500 mt-0.5 truncate" title={dateRange}>
              {dateRange}
            </p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={onEdit}
              className="p-1.5 rounded-md text-blue-600 hover:bg-blue-50"
              title="Edit offer"
            >
              <Edit2 size={15} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 rounded-md text-red-600 hover:bg-red-50"
              title="Delete offer"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 mt-2.5">
          <MetricBox value={formatInr(analytics.gross)} label="Gross sales" />
          <MetricBox value={String(analytics.orders)} label="Orders" />
          <MetricBox value={formatInr(analytics.discount)} label="Discount" />
          <MetricBox value={`${analytics.effPct}%`} label="Eff. discount" />
        </div>
      </div>

      {/* Collapsible details */}
      {expanded ? (
        <div className="px-3 sm:px-4 py-2.5 border-t border-gray-100 bg-gray-50/40">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-gray-600">
            {detailRows.map((row, i) => (
              <p key={i} className="min-w-0 leading-snug">
                {row.label ? (
                  <>
                    <span className="text-gray-500">{row.label}</span> {row.value}
                  </>
                ) : (
                  <span className="text-gray-700 sm:col-span-2 block">{row.value}</span>
                )}
              </p>
            ))}
          </div>
          {offer.offer_description ? (
            <p className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100 line-clamp-2">
              {offer.offer_description}
            </p>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center justify-center py-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 border-t border-gray-100 text-[11px] gap-1"
        aria-expanded={expanded}
      >
        {expanded ? (
          <>
            <ChevronUp size={14} /> Hide details
          </>
        ) : (
          <>
            <ChevronDown size={14} /> Show details
          </>
        )}
      </button>
    </article>
  );
}
