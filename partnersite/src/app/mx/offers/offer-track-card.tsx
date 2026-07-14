"use client";

import React, { useMemo } from "react";
import { ChevronDown, ChevronUp, Edit2, Copy, Power } from "lucide-react";
import type { Offer } from "@/lib/database";
import {
  formatOfferActorDisplay,
  formatOfferSlotSummary,
  formatOfferValidityRange,
  getOfferLifecycle,
  getOfferMenuItemIds,
  getOfferStatusBadge,
  hasOfferScheduleRestrictions,
  isOfferCampaignExpired,
  offerWasUpdated,
} from "./offer-lifecycle";

type OfferWithAudit = Offer & {
  created_source_platform?: string | null;
  updated_source_platform?: string | null;
};

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

/** Boost / Precision apply to % and flat offers only — not BOGO. */
export function resolveOfferConditionsMode(offer: Offer): "boost" | "precision" | null {
  const type = String(offer.offer_type ?? "").toUpperCase();
  // BOGO is its own create path — never label as Boost/Precision.
  if (type === "BOGO" || type === "BUY_X_GET_Y" || type === "BUY_N_GET_M") return null;
  if (
    type === "CART_PERCENTAGE" ||
    type === "CART_FLAT" ||
    type === "FREE_DELIVERY" ||
    type === "TIERED" ||
    type === "BUNDLE"
  ) {
    return "precision";
  }
  if (type !== "PERCENTAGE" && type !== "FLAT" && type !== "COUPON") return null;

  const meta = (offer.offer_metadata ?? {}) as Record<string, unknown>;
  // Durable create-path wins over legacy conditions_mode stamps.
  if (meta.create_path === "boost" || meta.create_path === "precision") {
    return meta.create_path;
  }
  // Explicit merchant choice wins.
  if (meta.conditions_mode === "boost" || meta.conditions_mode === "precision") {
    return meta.conditions_mode;
  }

  const itemIds = getOfferMenuItemIds(offer);
  const sub = String(offer.offer_sub_type ?? "").toUpperCase();
  const itemScoped =
    itemIds.length > 0 ||
    sub === "SPECIFIC_ITEM" ||
    sub === "SPECIFIC_ITEMS" ||
    sub === "SELECTED_ITEM" ||
    sub === "SELECTED_ITEMS";

  // Legacy rows without conditions_mode: item-scoped → Boost, otherwise Precision.
  if (itemScoped && (type === "PERCENTAGE" || type === "FLAT")) return "boost";
  if (type === "PERCENTAGE" || type === "FLAT" || type === "COUPON") return "precision";
  return null;
}

function isBogoOfferType(offer: Offer): boolean {
  const type = String(offer.offer_type ?? "").toUpperCase();
  return type === "BOGO" || type === "BUY_X_GET_Y" || type === "BUY_N_GET_M";
}

function offerTypeModeLabel(offer: Offer): "Boost" | "Precision" | "BOGO" | null {
  if (isBogoOfferType(offer)) return "BOGO";
  const mode = resolveOfferConditionsMode(offer);
  if (mode === "boost") return "Boost";
  if (mode === "precision") return "Precision";
  return null;
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

  const itemIds = getOfferMenuItemIds(offer);
  const isSpecific =
    offer.offer_sub_type === "SPECIFIC_ITEM" ||
    (offer as Offer & { applicability_type?: string }).applicability_type === "SPECIFIC_ITEMS_SET";
  if (isSpecific && itemIds.length) {
    const names = itemIds.slice(0, 3).map(getMenuItemName);
    const more = itemIds.length > 3 ? ` +${itemIds.length - 3} more` : "";
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

function getOfferImageUrl(offer: Offer): string | null {
  const withLegacy = offer as Offer & { image_url?: string | null };
  const url = (offer.offer_image_url ?? withLegacy.image_url ?? "").trim();
  return url || null;
}

/** Mini banner preview — matches customer app home promo carousel layout. */
function OfferCustomerAppPreview({
  imageUrl,
  title,
  subline,
}: {
  imageUrl: string;
  title: string;
  subline?: string | null;
}) {
  return (
    <div className="flex shrink-0 flex-col items-end">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        Customer app preview
      </p>
      <div className="relative w-[156px] overflow-hidden rounded-xl border border-gray-200 bg-gray-900 shadow-md sm:w-[172px]">
        <div className="relative aspect-[16/9] w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Offer banner preview"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-2">
            <p className="text-[9px] font-bold leading-tight text-white line-clamp-2 drop-shadow-sm">
              {title}
            </p>
            {subline ? (
              <p className="mt-0.5 text-[8px] leading-tight text-white/90 line-clamp-1">{subline}</p>
            ) : null}
          </div>
        </div>
        <div className="absolute left-2 top-2 rounded bg-white/90 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wide text-emerald-700">
          Limited time
        </div>
      </div>
    </div>
  );
}

export function OfferTrackCard({
  offer,
  storeName,
  ownerDisplayName,
  expanded,
  onToggleExpand,
  onEdit,
  onDeactivate,
  onActivate,
  onCopyCoupon,
  getMenuItemName,
}: {
  offer: Offer;
  storeName: string | null;
  ownerDisplayName?: string | null;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDeactivate?: () => void;
  onActivate?: () => void;
  onCopyCoupon?: (code: string) => void;
  getMenuItemName: (id: string) => string;
}) {
  const audited = offer as OfferWithAudit;
  const lifecycle = useMemo(() => getOfferLifecycle(offer), [offer]);
  const status = getOfferStatusBadge(lifecycle);
  const canDeactivate = offer.is_active !== false && onDeactivate != null;
  const canActivate =
    onActivate != null &&
    (offer.is_active === false || lifecycle.reason === "disabled") &&
    !isOfferCampaignExpired(offer);
  const analytics = useMemo(() => getOfferAnalytics(offer), [offer]);
  const headline = offerHeadline(offer);
  const typeModeLabel = offerTypeModeLabel(offer);
  const dateRange = formatOfferValidityRange(offer);
  const slotSummary = formatOfferSlotSummary(offer);
  const offerImageUrl = getOfferImageUrl(offer);
  const previewSubline =
    offer.offer_description?.trim() ||
    (offer.min_order_amount ? `on orders above ${formatInr(Number(offer.min_order_amount))}` : null);
  const showStopped = lifecycle.phase === "inactive" && (lifecycle.reason === "expired" || lifecycle.reason === "disabled");
  const disabledAt = (offer as Offer & { disabled_at?: string | null }).disabled_at;
  const actorOpts = { ownerDisplayName };
  const createdByDisplay = formatOfferActorDisplay(
    audited.created_source_platform,
    offer.created_by_name,
    actorOpts
  );
  const updatedByDisplay = offerWasUpdated(offer)
    ? formatOfferActorDisplay(
        audited.updated_source_platform ?? audited.created_source_platform,
        offer.updated_by_name,
        actorOpts
      )
    : null;

  const detailRows: { label: string; value: React.ReactNode }[] = [
    ...(showStopped
      ? [{
          label: lifecycle.reason === "disabled" ? "Deactivated at:" : "Stopped at:",
          value: formatStoppedAt(
            lifecycle.reason === "disabled" && disabledAt
              ? disabledAt
              : offer.updated_at || offer.valid_till
          ),
        }]
      : []),
    { label: "", value: buildApplicableForText(offer, storeName, getMenuItemName) },
    {
      label: "Time slot:",
      value: (
        <span className={hasOfferScheduleRestrictions(offer) ? "text-gray-800" : "text-amber-700"}>
          {slotSummary}
          {!hasOfferScheduleRestrictions(offer) ? " — shows Active for full campaign dates" : ""}
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
      ? [{ label: "Redemptions:", value: `${offer.current_uses ?? 0} / ${offer.max_uses_total}` }]
      : []),
    {
      label: "Created by:",
      value: <strong className="text-gray-800">{createdByDisplay}</strong>,
    },
    {
      label: "Updated by:",
      value: (
        <strong className="text-gray-800">{updatedByDisplay ?? "Not updated yet"}</strong>
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
    <article className="w-full min-w-0 shrink-0 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
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
            {typeModeLabel ? (
              <p
                className={`text-[11px] font-semibold mt-0.5 ${
                  typeModeLabel === "Boost"
                    ? "text-emerald-700"
                    : typeModeLabel === "BOGO"
                      ? "text-violet-700"
                      : "text-indigo-700"
                }`}
              >
                {typeModeLabel}
              </p>
            ) : null}
            <p className="text-[11px] text-gray-500 mt-0.5 truncate" title={dateRange}>
              {dateRange}
            </p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            {canActivate ? (
              <button
                type="button"
                onClick={onActivate}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100"
                title="Activate offer"
              >
                <Power size={13} />
                Activate
              </button>
            ) : null}
            {canDeactivate ? (
              <button
                type="button"
                onClick={onDeactivate}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100"
                title="Deactivate offer"
              >
                <Power size={13} />
                Deactivate
              </button>
            ) : null}
            <button type="button" onClick={onEdit} className="p-1.5 rounded-md text-blue-600 hover:bg-blue-50" title="Edit offer">
              <Edit2 size={15} />
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

      {expanded ? (
        <div className="border-t border-gray-100 bg-gray-50/40 px-3 py-2.5 sm:px-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 w-full sm:flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-gray-600">
              {detailRows.map((row, i) => (
                <p
                  key={i}
                  className={`min-w-0 leading-snug ${!row.label ? "sm:col-span-2" : ""}`}
                >
                  {row.label ? (
                    <>
                      <span className="text-gray-500">{row.label}</span> {row.value}
                    </>
                  ) : (
                    <span className="text-gray-700 block">{row.value}</span>
                  )}
                </p>
              ))}
            </div>
            {offerImageUrl ? (
              <OfferCustomerAppPreview
                imageUrl={offerImageUrl}
                title={offer.offer_title || headline}
                subline={previewSubline}
              />
            ) : null}
          </div>
          {offer.offer_description ? (
            <p className="mt-2 border-t border-gray-100 pt-2 text-[11px] text-gray-500 line-clamp-2">
              {offer.offer_description}
            </p>
          ) : null}
        </div>
      ) : offerImageUrl ? (
        <div className="flex justify-end border-t border-gray-100 bg-gray-50/30 px-3 py-2 sm:px-4">
          <OfferCustomerAppPreview
            imageUrl={offerImageUrl}
            title={offer.offer_title || headline}
            subline={previewSubline}
          />
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
