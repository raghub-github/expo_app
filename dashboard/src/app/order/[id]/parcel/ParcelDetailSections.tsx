"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ImageIcon, MapPin, Package, Star, User } from "lucide-react";
import type { OrderPaymentDetail } from "@/lib/orders/order-payment-types";
import { OrderMixedText } from "@/components/orders/orders-typography";
import { RiderPhotoModal } from "@/components/orders/RiderPhotoModal";
import type { ParcelDetailOrder } from "./parcel-detail-types";
import {
  formatInr,
  formatKm,
  formatLabel,
  haversineKm,
  PR_MUTED,
} from "../person-ride/person-ride-utils";
import { readRiderPayoutSnapshotFromBilling } from "@/lib/riders/rider-payout-snapshot";

function formatCollectedAt(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function resolveParcelCollectMode(
  order: ParcelDetailOrder,
  parcel: NonNullable<ParcelDetailOrder["parcelDetail"]>
): "Online" | "COD" {
  const method = String(parcel.paymentMethod ?? order.paymentMethod ?? "")
    .trim()
    .toLowerCase();
  if (
    method.includes("online") ||
    method.includes("wallet") ||
    method.includes("upi") ||
    method.includes("gati")
  ) {
    return "Online";
  }
  if (parcel.isCod === true || method.includes("cash") || method.includes("cod")) {
    return "COD";
  }
  return "Online";
}

function CompactCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`h-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

function CardHeader({
  icon,
  title,
  right,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  right?: React.ReactNode;
  tone?: "neutral" | "pickup" | "drop";
}) {
  const bar =
    tone === "pickup"
      ? "border-emerald-100"
      : tone === "drop"
        ? "border-sky-100"
        : "border-slate-100";
  return (
    <div className={`mb-2 flex items-start justify-between gap-2 border-b ${bar} pb-1.5`}>
      <span className="flex items-center gap-1.5 text-[12px] font-bold tracking-tight text-slate-900">
        {icon}
        {title}
      </span>
      {right}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  const rendered =
    typeof value === "string" || typeof value === "number" ? (
      <OrderMixedText>{String(value)}</OrderMixedText>
    ) : (
      value
    );
  return (
    <div className="grid min-h-[18px] grid-cols-[72px_1fr] items-start gap-1">
      <div className="pr-body text-[11px] font-bold" style={{ color: PR_MUTED }}>
        {label}
      </div>
      <div className="pr-body text-[11px] font-bold leading-snug text-slate-800 break-words">
        {rendered}
      </div>
    </div>
  );
}

/** Toggle Package ↔ Payment details — Payment is the default tab. */
export function PackagePaymentToggle({
  packagePanel,
  paymentPanel,
}: {
  packagePanel: ReactNode;
  paymentPanel: ReactNode;
}) {
  const [tab, setTab] = useState<"payment" | "package">("payment");

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-2">
      <div
        className="inline-flex w-full rounded-lg border border-slate-200 bg-slate-100/80 p-0.5"
        role="tablist"
        aria-label="Package or payment details"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "package"}
          onClick={() => setTab("package")}
          className={`flex-1 rounded-md px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
            tab === "package"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Package
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "payment"}
          onClick={() => setTab("payment")}
          className={`flex-1 rounded-md px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
            tab === "payment"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Payment details
        </button>
      </div>
      <div className="min-h-0 min-w-0 flex-1" role="tabpanel">
        {tab === "package" ? packagePanel : paymentPanel}
      </div>
    </div>
  );
}

function MapLink({ lat, lon }: { lat: number; lon: number }) {
  return (
    <a
      href={`https://www.google.com/maps?q=${lat},${lon}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[10px] font-semibold text-emerald-700 hover:underline"
    >
      Map
    </a>
  );
}

function OtpBadge({ otp, tone }: { otp: string; tone: "pickup" | "delivery" }) {
  const cls =
    tone === "pickup"
      ? "border-emerald-300/80 bg-emerald-50 text-emerald-800"
      : "border-sky-300/80 bg-sky-50 text-sky-800";
  return (
    <span
      className={`inline-flex items-center rounded-md border border-dashed px-1.5 py-0.5 pr-num text-[12px] font-bold tracking-[0.18em] ${cls}`}
    >
      {otp}
    </span>
  );
}

function ProofThumb({
  url,
  label,
  tone,
  onOpen,
}: {
  url: string;
  label: string;
  tone: "pickup" | "drop";
  onOpen: () => void;
}) {
  const border = tone === "pickup" ? "border-emerald-200" : "border-sky-200";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group relative block h-16 w-full overflow-hidden rounded-lg border ${border} bg-slate-50 text-left`}
      aria-label={label}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={label}
        className="h-full w-full object-cover transition group-hover:opacity-90"
      />
      <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded bg-black/55 px-1 py-0.5 text-[9px] font-semibold text-white">
        <ImageIcon className="h-2.5 w-2.5" />
        View
      </span>
    </button>
  );
}

function formatVehicleLabel(parcel: NonNullable<ParcelDetailOrder["parcelDetail"]>): string {
  const category = parcel.vehicleCategory?.replace(/_/g, " ").trim();
  const type = parcel.vehicleTypeRequired?.replace(/_/g, " ").trim();
  if (category && type && category.toLowerCase() !== type.toLowerCase()) {
    return `${formatLabel(category)} · ${formatLabel(type)}`;
  }
  return formatLabel(category || type || parcel.parcelType?.replace(/_/g, " ") || null);
}

export function SenderCard({
  order,
  overallRating,
  onOpenPartnerChat,
}: {
  order: ParcelDetailOrder;
  /** Customer overall rating (avg across orders). */
  overallRating?: number | null;
  onOpenPartnerChat?: () => void;
}) {
  const parcel = order.parcelDetail;
  const [proofOpen, setProofOpen] = useState(false);
  const name = parcel?.senderName?.trim() || order.customerName?.trim() || "—";
  const mobile = parcel?.senderMobile?.trim() || order.customerMobile?.trim() || "—";
  const pickup =
    parcel?.pickupAddress?.trim() ||
    order.pickupAddressNormalized?.trim() ||
    order.pickupAddressRaw?.trim() ||
    order.pickupAddressGeocoded?.trim() ||
    "—";
  const pickupOtp = parcel?.pickupOtp?.trim() || null;
  const pickupProofUrl = parcel?.pickupProofImageUrl?.trim() || null;
  const pickupLabel = parcel?.pickupLabel?.trim() || null;

  return (
    <>
      <CompactCard>
        <CardHeader
          tone="pickup"
          icon={<User className="h-3.5 w-3.5 text-emerald-600" />}
          title="Sender · Pickup"
          right={
            pickupOtp ? (
              <OtpBadge otp={pickupOtp} tone="pickup" />
            ) : (
              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700">
                Pickup
              </span>
            )
          }
        />
        <div className="space-y-1">
          <Row label="Name" value={name} />
          <Row label="Mobile" value={<span className="pr-num">{mobile}</span>} />
          {order.customerExternalId ? (
            <Row
              label="ID"
              value={
                order.customerId ? (
                  <Link
                    href={`/dashboard/customers/${order.customerId}`}
                    className="font-semibold text-emerald-700 hover:underline"
                  >
                    {order.customerExternalId}
                  </Link>
                ) : (
                  order.customerExternalId
                )
              }
            />
          ) : null}
          {order.customerTrustTierLabel || order.customerAccountStatus ? (
            <Row
              label="Account"
              value={[
                formatLabel(order.customerAccountStatus),
                order.customerTrustTierLabel
                  ? formatLabel(order.customerTrustTierLabel)
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          ) : null}
          <Row
            label="Rating"
            value={
              overallRating != null &&
              Number.isFinite(overallRating) &&
              overallRating > 0 ? (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                  <span className="pr-num">{Number(overallRating).toFixed(1)}</span>
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
                </span>
              ) : (
                <span className="text-slate-400">—</span>
              )
            }
          />

          <div className="mt-1.5 space-y-1 rounded-lg border border-emerald-100/80 bg-emerald-50/40 px-2 py-1.5">
            {pickupLabel ? (
              <p className="text-[10px] font-semibold text-emerald-800">{pickupLabel}</p>
            ) : null}
            <p className="text-[11px] leading-snug text-slate-700">{pickup}</p>
            {order.pickupLat != null && order.pickupLon != null ? (
              <div className="flex items-center gap-1.5">
                <span className="pr-num text-[10px] text-slate-500">
                  {order.pickupLat.toFixed(5)}, {order.pickupLon.toFixed(5)}
                </span>
                <MapLink lat={order.pickupLat} lon={order.pickupLon} />
              </div>
            ) : null}
            {pickupProofUrl ? (
              <div className="pt-1">
                <ProofThumb
                  url={pickupProofUrl}
                  label="Pickup parcel photo"
                  tone="pickup"
                  onOpen={() => setProofOpen(true)}
                />
              </div>
            ) : (
              <p className="pt-0.5 text-[10px] text-slate-400">Pickup image not uploaded</p>
            )}
          </div>

          {onOpenPartnerChat ? (
            <div className="mt-1.5 flex justify-end border-t border-slate-100 pt-1.5">
              <button
                type="button"
                onClick={onOpenPartnerChat}
                className="inline-flex cursor-pointer items-center gap-0.5 border-0 bg-transparent p-0 py-0.5 text-[11px] font-semibold whitespace-nowrap text-emerald-700 hover:text-emerald-800"
              >
                <i className="bi bi-chat-left-text text-[10px]" />
                Chat history
              </button>
            </div>
          ) : null}
        </div>
      </CompactCard>
      <RiderPhotoModal
        open={proofOpen}
        imageUrl={pickupProofUrl}
        riderName="Pickup parcel photo"
        onClose={() => setProofOpen(false)}
      />
    </>
  );
}

export function ReceiverCard({ order }: { order: ParcelDetailOrder }) {
  const parcel = order.parcelDetail;
  const [proofOpen, setProofOpen] = useState(false);
  const name = parcel?.receiverName?.trim() || "—";
  const mobile = parcel?.receiverMobile?.trim() || "—";
  const drop =
    parcel?.dropAddress?.trim() ||
    order.dropAddressNormalized?.trim() ||
    order.dropAddressRaw?.trim() ||
    order.dropAddressGeocoded?.trim() ||
    "—";
  // Delivery OTP lives on RiderDetails only — avoid duplicate badge here.
  const deliveryProofUrl = parcel?.deliveryProofImageUrl?.trim() || null;
  const dropLabel = parcel?.dropLabel?.trim() || null;
  const riderPayout = readRiderPayoutSnapshotFromBilling(order.billingSnapshot);
  // Prefer frozen accept quote trip km (dispatch/settlement SSOT) over core/haversine.
  const tripKm =
    riderPayout?.tripDistanceKm ??
    parcel?.tripDistanceKm ??
    (order.distanceKm != null && Number.isFinite(order.distanceKm)
      ? order.distanceKm
      : haversineKm(order.pickupLat, order.pickupLon, order.dropLat, order.dropLon));

  return (
    <>
      <CompactCard>
        <CardHeader
          tone="drop"
          icon={<MapPin className="h-3.5 w-3.5 text-sky-600" />}
          title="Receiver · Drop"
          right={
            <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-700">
              Drop
            </span>
          }
        />
        <div className="space-y-1">
          <Row label="Name" value={name} />
          <Row label="Mobile" value={<span className="pr-num">{mobile}</span>} />
          {tripKm != null ? (
            <Row label="Trip" value={<span className="pr-num">{formatKm(tripKm)}</span>} />
          ) : null}
          {riderPayout?.pickupDistanceKm != null ? (
            <Row
              label="Quoted pickup"
              value={
                <span className="pr-num">{formatKm(riderPayout.pickupDistanceKm)}</span>
              }
            />
          ) : null}

          <div className="mt-1.5 space-y-1 rounded-lg border border-sky-100/80 bg-sky-50/40 px-2 py-1.5">
            {dropLabel ? (
              <p className="text-[10px] font-semibold text-sky-800">{dropLabel}</p>
            ) : null}
            <p className="text-[11px] leading-snug text-slate-700">{drop}</p>
            {order.dropLat != null && order.dropLon != null ? (
              <div className="flex items-center gap-1.5">
                <span className="pr-num text-[10px] text-slate-500">
                  {order.dropLat.toFixed(5)}, {order.dropLon.toFixed(5)}
                </span>
                <MapLink lat={order.dropLat} lon={order.dropLon} />
              </div>
            ) : null}
            {deliveryProofUrl ? (
              <div className="pt-1">
                <ProofThumb
                  url={deliveryProofUrl}
                  label="Drop parcel photo"
                  tone="drop"
                  onOpen={() => setProofOpen(true)}
                />
              </div>
            ) : (
              <p className="pt-0.5 text-[10px] text-slate-400">Drop image not uploaded</p>
            )}
          </div>

          {parcel?.instructions ? (
            <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-500">
              <span className="font-semibold text-slate-600">Note: </span>
              {parcel.instructions}
            </p>
          ) : null}
          {parcel?.cashCollectedAt ? (
            <Row
              label="Collected at"
              value={
                <span className="flex flex-col items-end gap-0.5">
                  <span className="pr-num text-[10px]">
                    {formatCollectedAt(parcel.cashCollectedAt)}
                  </span>
                  <span className="text-[9px] font-semibold text-violet-700">
                    {resolveParcelCollectMode(order, parcel)}
                  </span>
                </span>
              }
            />
          ) : null}
        </div>
      </CompactCard>
      <RiderPhotoModal
        open={proofOpen}
        imageUrl={deliveryProofUrl}
        riderName="Drop parcel photo"
        onClose={() => setProofOpen(false)}
      />
    </>
  );
}

/** Package specs only — payment lives in shared PaymentDetails (food-parity). */
export function PackageCard({ order }: { order: ParcelDetailOrder }) {
  const parcel = order.parcelDetail;
  const dims =
    parcel?.lengthCm != null && parcel?.widthCm != null && parcel?.heightCm != null
      ? `${parcel.lengthCm}×${parcel.widthCm}×${parcel.heightCm} cm`
      : "—";

  const paymentLabel = parcel?.isCod
    ? `COD · ${formatInr(parcel.codAmount ?? order.grandTotal)}`
    : parcel?.paymentMethod === "online"
      ? "Paid online"
      : parcel?.paymentMethod
        ? formatLabel(parcel.paymentMethod)
        : order.paymentMethod
          ? formatLabel(order.paymentMethod)
          : "—";

  const riderPayout = readRiderPayoutSnapshotFromBilling(order.billingSnapshot);

  return (
    <CompactCard>
      <CardHeader
        icon={<Package className="h-3.5 w-3.5 text-amber-600" />}
        title="Package"
      />
      {parcel ? (
        <div className="space-y-1">
          <Row label="Category" value={formatVehicleLabel(parcel)} />
          <Row
            label="Weight"
            value={parcel.weightKg != null ? `${parcel.weightKg} kg` : "—"}
          />
          <Row label="Size" value={dims} />
          <Row label="Payment" value={paymentLabel} />
          {parcel.payAt ? <Row label="Pay at" value={formatLabel(parcel.payAt)} /> : null}
          {parcel.couponCode ? <Row label="Coupon" value={parcel.couponCode} /> : null}
          {riderPayout ? (
            <>
              <div className="my-1 border-t border-slate-100" />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Rider quote (accept)
              </p>
              <Row
                label="Quoted earning"
                value={
                  <span className="pr-num font-semibold text-slate-800">
                    {formatInr(riderPayout.totalEarning)}
                  </span>
                }
              />
              {riderPayout.tripDistanceKm != null ? (
                <Row
                  label="Quoted trip"
                  value={
                    <span className="pr-num">{formatKm(riderPayout.tripDistanceKm)}</span>
                  }
                />
              ) : null}
              {riderPayout.pickupDistanceKm != null ? (
                <Row
                  label="Quoted pickup"
                  value={
                    <span className="pr-num">{formatKm(riderPayout.pickupDistanceKm)}</span>
                  }
                />
              ) : null}
            </>
          ) : null}
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">Not recorded.</p>
      )}
    </CompactCard>
  );
}

/** @deprecated Prefer PackageCard + PaymentDetails */
export function PackageFareCard({
  order,
  paymentDetail: _paymentDetail,
}: {
  order: ParcelDetailOrder;
  paymentDetail: OrderPaymentDetail | null;
}) {
  return <PackageCard order={order} />;
}

/** @deprecated Prefer PackageCard + PaymentDetails */
export function ParcelFareSummaryCard({
  order,
  paymentDetail: _paymentDetail,
}: {
  order: ParcelDetailOrder;
  paymentDetail: OrderPaymentDetail | null;
}) {
  return <PackageCard order={order} />;
}
