"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import {
  AlertTriangle,
  Bike,
  Check,
  Copy,
  Star,
  Timer,
} from "lucide-react";
import type { OrderPaymentDetail } from "@/lib/orders/order-payment-types";
import { buildRideInvoiceLinesFromSnapshot } from "@/lib/orders/ride-invoice-lines";
import { isRideFarePaymentPending } from "@/lib/riders/ride-wallet-credit-pending";
import { readRiderPayoutSnapshotFromBilling } from "@/lib/riders/rider-payout-snapshot";
import { RiderPhotoModal } from "@/components/orders/RiderPhotoModal";
import {
  prefetchRiderActivityLog,
} from "@/lib/riderActivityLogCache";
import { RiderLogModal } from "../RiderDetails";
import type { PersonRideDetailOrder } from "./person-ride-detail-types";
import {
  PR_BLACK,
  PR_BORDER,
  PR_GREEN,
  PR_MUTED,
  PR_RED,
  PR_SURFACE,
  PR_WHITE,
  RIDE_MILESTONES,
  activeMilestoneIndex,
  formatDateTime,
  formatDurationFromSeconds,
  formatEtaLabel,
  formatInr,
  formatKm,
  formatLabel,
  haversineKm,
  normalizeStatus,
} from "./person-ride-utils";

/** Food-order style compact card shell */
function CompactCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 shadow-sm transition-all hover:border-neutral-300 hover:shadow-md">
      {children}
    </div>
  );
}

function CardHeader({
  icon,
  title,
  right,
}: {
  icon: ReactNode;
  title: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-start justify-between gap-2 border-b border-[#e5e5e5] pb-1.5">
      <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900">
        {icon}
        {title}
      </span>
      {right ? <div className="flex shrink-0 items-center gap-1.5">{right}</div> : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid min-h-[20px] grid-cols-[96px_1fr] items-start gap-1">
      <div className="pr-body text-[12px] font-medium" style={{ color: PR_MUTED }}>
        {label}
      </div>
      <div className="pr-body text-[12px] font-medium text-slate-800 break-words">{value}</div>
    </div>
  );
}

function RatingPill({ value }: { value: number | null | undefined }) {
  const has = value != null && Number.isFinite(Number(value)) && Number(value) > 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold"
      style={{
        background: has ? "#ECFDF5" : PR_SURFACE,
        borderColor: has ? "#A7F3D0" : PR_BORDER,
        color: has ? PR_GREEN : PR_MUTED,
      }}
    >
      <Star className={`h-3 w-3 ${has ? "fill-current" : ""}`} />
      <span className="pr-num">{has ? Number(value).toFixed(1) : "—"}</span>
    </span>
  );
}

export type CaptainInfo = {
  name: string | null;
  mobile: string | null;
  countryCode: string | null;
  selfieUrl: string | null;
  rating: number | null;
  vehicleName: string | null;
  vehicleNumber: string | null;
  vehicleType: string | null;
  fuelType: string | null;
  color: string | null;
  city: string | null;
  state: string | null;
  status: string | null;
  kycStatus: string | null;
  isOnline: boolean | null;
};

export type RideRatings = {
  riderAvgRating: number | null;
  orderRiderRating: number | null;
  customerAvgRating: number | null;
};

export function CaptainCard({
  captain,
  fallbackName,
  fallbackMobile,
  ratings,
  orderId,
  riderId,
}: {
  captain: CaptainInfo | null;
  fallbackName: string | null;
  fallbackMobile: string | null;
  ratings?: RideRatings | null;
  /** orders_core.id — enables View Rider's Log */
  orderId?: number | null;
  /** riders.id */
  riderId?: number | null;
}) {
  const [showLogModal, setShowLogModal] = useState(false);
  const [riderPhotoOpen, setRiderPhotoOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<"riderId" | "mobile" | null>(null);
  const name = captain?.name?.trim() || fallbackName?.trim() || "Not assigned";
  const mobileRaw = captain?.mobile?.trim() || fallbackMobile?.trim() || null;
  const cc = captain?.countryCode?.trim() || "+91";
  const mobileDisplay = mobileRaw
    ? mobileRaw.startsWith("+")
      ? mobileRaw
      : `${cc}${mobileRaw.replace(/^\+?91/, "")}`
    : null;
  const rating =
    ratings?.riderAvgRating ?? ratings?.orderRiderRating ?? captain?.rating ?? null;
  const hasRider = Boolean(
    orderId != null &&
      orderId > 0 &&
      ((captain?.name || fallbackName)?.trim() || captain != null)
  );
  const selfieUrl = captain?.selfieUrl?.trim() || null;
  const showSelfie = Boolean(selfieUrl);
  const resolvedRiderId =
    riderId != null && Number.isFinite(riderId) && riderId > 0 ? riderId : null;

  const copyText = (text: string, field: "riderId" | "mobile") => {
    if (!text || typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 1500);
    });
  };

  return (
    <CompactCard>
      <CardHeader
        icon={
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-700">
            R
          </span>
        }
        title="Rider"
        right={
          <div className="flex items-center gap-1.5">
            <RatingPill value={rating} />
            {hasRider ? (
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-emerald-700"
                onMouseEnter={() => {
                  if (orderId != null) prefetchRiderActivityLog(orderId);
                }}
                onFocus={() => {
                  if (orderId != null) prefetchRiderActivityLog(orderId);
                }}
                onClick={() => setShowLogModal(true)}
              >
                View Rider&apos;s Log
              </button>
            ) : null}
          </div>
        }
      />
      <div className="mb-2 flex items-center gap-2">
        {showSelfie ? (
          <button
            type="button"
            onClick={() => setRiderPhotoOpen(true)}
            className="h-9 w-9 shrink-0 overflow-hidden rounded-md border ring-2 ring-white shadow-sm cursor-zoom-in transition hover:ring-emerald-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            style={{ borderColor: PR_BORDER, background: PR_SURFACE }}
            aria-label={name !== "Not assigned" ? `View photo of ${name}` : "View rider photo"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selfieUrl!} alt={name} className="h-full w-full object-cover" />
          </button>
        ) : (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border"
            style={{ borderColor: PR_BORDER, background: PR_SURFACE }}
          >
            <Bike className="h-4 w-4" style={{ color: PR_MUTED }} />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold text-slate-900">{name}</p>
          <p className="pr-num truncate text-[11px] font-semibold" style={{ color: PR_GREEN }}>
            {mobileDisplay ? (
              <span className="inline-flex items-center gap-1">
                <a href={`tel:${mobileDisplay}`} className="hover:underline">
                  {mobileDisplay}
                </a>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center justify-center opacity-80 transition-opacity hover:opacity-100"
                  onClick={() => copyText(mobileDisplay, "mobile")}
                  aria-label="Copy rider mobile"
                >
                  {copiedField === "mobile" ? (
                    <Check className="h-3 w-3 text-emerald-600" />
                  ) : (
                    <Copy className="h-3 w-3 text-emerald-600" />
                  )}
                </button>
              </span>
            ) : (
              "—"
            )}
          </p>
        </div>
      </div>
      <div className="grid gap-1">
        <Row
          label="Rider ID"
          value={
            resolvedRiderId != null ? (
              <span className="inline-flex items-center gap-1">
                <span className="pr-num font-semibold text-slate-800">#{resolvedRiderId}</span>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center justify-center opacity-80 transition-opacity hover:opacity-100"
                  onClick={() => copyText(String(resolvedRiderId), "riderId")}
                  aria-label="Copy rider id"
                >
                  {copiedField === "riderId" ? (
                    <Check className="h-3 w-3 text-emerald-600" />
                  ) : (
                    <Copy className="h-3 w-3 text-emerald-600" />
                  )}
                </button>
              </span>
            ) : (
              "—"
            )
          }
        />
        <Row
          label="Vehicle"
          value={
            [captain?.vehicleName, captain?.vehicleNumber].filter(Boolean).join(" · ") || "—"
          }
        />
        <Row label="Type" value={formatLabel(captain?.vehicleType || captain?.fuelType)} />
        <Row
          label="Location"
          value={[captain?.city, captain?.state].filter(Boolean).join(", ") || "—"}
        />
        <Row
          label="Duty"
          value={
            captain?.isOnline == null ? "—" : captain.isOnline ? "Online" : "Offline"
          }
        />
        <Row label="KYC" value={formatLabel(captain?.kycStatus)} />
      </div>

      {orderId != null && orderId > 0 ? (
        <RiderLogModal
          isOpen={showLogModal}
          orderId={orderId}
          onClose={() => setShowLogModal(false)}
          onCopy={(text) => {
            if (typeof navigator !== "undefined" && navigator.clipboard) {
              void navigator.clipboard.writeText(text);
            }
          }}
        />
      ) : null}

      <RiderPhotoModal
        open={riderPhotoOpen}
        imageUrl={selfieUrl}
        riderName={name !== "Not assigned" ? name : null}
        onClose={() => setRiderPhotoOpen(false)}
      />
    </CompactCard>
  );
}

export function PassengerCard({
  order,
  ratings,
  walletBalance,
}: {
  order: PersonRideDetailOrder;
  ratings?: RideRatings | null;
  walletBalance?: number | null;
}) {
  const ride = order.rideDetail;
  const name = ride?.passengerName?.trim() || order.customerName?.trim() || "—";
  const phone = ride?.passengerPhone?.trim() || order.customerMobile?.trim() || null;
  const rating =
    ratings?.customerAvgRating ??
    order.customerFeedback?.storeRating ??
    order.customerFeedback?.foodRating ??
    null;
  const formattedCustomerId =
    order.customerExternalId?.trim() ||
    (order.customerId != null ? String(order.customerId) : null);
  const [copiedField, setCopiedField] = useState<
    "customerId" | "mobile" | "email" | null
  >(null);
  const cxDashHref = (() => {
    const externalId = order.customerExternalId?.trim() || "";
    const dbId = order.customerId;
    if (!dbId && !externalId) return null;
    const searchQ = externalId ? `search=${encodeURIComponent(externalId)}&` : "";
    if (dbId) return `/dashboard/customers/${dbId}?${searchQ}fromOrder=1`;
    return `/dashboard/customers/all?${searchQ}fromOrder=1`;
  })();
  const walletLedgerHref = (() => {
    const externalId = order.customerExternalId?.trim() || "";
    const dbId = order.customerId;
    if (!dbId) return null;
    const searchQ = externalId ? `search=${encodeURIComponent(externalId)}&` : "";
    return `/dashboard/customers/${dbId}?${searchQ}fromOrder=1&nav=transactions`;
  })();
  const copyText = (text: string, field: "customerId" | "mobile" | "email") => {
    if (!text || typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 1500);
    });
  };

  const walletLabel =
    walletBalance === undefined
      ? "…"
      : walletBalance == null || Number.isNaN(walletBalance)
        ? "—"
        : `₹${Number(walletBalance).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`;

  const CopyBtn = ({
    field,
    value,
    label,
  }: {
    field: "customerId" | "mobile" | "email";
    value: string;
    label: string;
  }) => (
    <button
      type="button"
      className="inline-flex shrink-0 items-center justify-center opacity-80 transition-opacity hover:opacity-100"
      onClick={() => copyText(value, field)}
      aria-label={label}
    >
      {copiedField === field ? (
        <Check className="h-3 w-3 text-emerald-600" />
      ) : (
        <Copy className="h-3 w-3 text-emerald-600" />
      )}
    </button>
  );

  return (
    <CompactCard>
      <CardHeader
        icon={
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-700">
            C
          </span>
        }
        title="Customer"
        right={
          <>
            <RatingPill value={rating} />
            {cxDashHref ? (
              <a
                href={cxDashHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
              >
                Cx-Das
              </a>
            ) : null}
          </>
        }
      />
      <div className="grid gap-1">
        <Row
          label="Customer ID"
          value={
            formattedCustomerId ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <span className="pr-num truncate font-semibold text-slate-800">
                  {formattedCustomerId}
                </span>
                <CopyBtn
                  field="customerId"
                  value={formattedCustomerId}
                  label="Copy customer id"
                />
              </span>
            ) : (
              "—"
            )
          }
        />
        <Row
          label="Risk"
          value={
            order.customerRiskFlag?.trim() ? (
              <span className="inline-flex items-center rounded-full border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                {order.customerRiskFlag.trim()}
              </span>
            ) : (
              "—"
            )
          }
        />
        <Row
          label="Name"
          value={
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span className="font-semibold">{name}</span>
              {order.customerTrustTierLabel?.trim() ? (
                <span className="inline-flex rounded-full bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-slate-200">
                  {order.customerTrustTierLabel.trim()}
                </span>
              ) : null}
            </span>
          }
        />
        <Row
          label="Mobile"
          value={
            phone ? (
              <span className="inline-flex items-center gap-1.5">
                <a
                  href={`tel:${phone}`}
                  className="font-semibold hover:underline"
                  style={{ color: PR_GREEN }}
                >
                  {phone}
                </a>
                <CopyBtn field="mobile" value={phone} label="Copy mobile" />
              </span>
            ) : (
              "—"
            )
          }
        />
        <Row
          label="Email"
          value={
            order.customerEmail?.trim() ? (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <span className="truncate">{order.customerEmail.trim()}</span>
                <CopyBtn
                  field="email"
                  value={order.customerEmail.trim()}
                  label="Copy email"
                />
              </span>
            ) : (
              "—"
            )
          }
        />
        <Row
          label="Wallet"
          value={
            walletLedgerHref ? (
              <a
                href={walletLedgerHref}
                target="_blank"
                rel="noopener noreferrer"
                title="Open full wallet ledger"
                className="pr-num cursor-pointer whitespace-nowrap font-semibold text-emerald-700 no-underline hover:text-emerald-800 hover:no-underline"
              >
                {walletLabel}
              </a>
            ) : (
              <span className="pr-num whitespace-nowrap font-semibold text-slate-900">
                {walletLabel}
              </span>
            )
          }
        />
      </div>
    </CompactCard>
  );
}

function MapLink({ lat, lon }: { lat: number | null; lon: number | null }) {
  if (lat == null || lon == null) return null;
  const q = `${lat},${lon}`;
  return (
    <a
      href={`https://www.google.com/maps?q=${encodeURIComponent(q)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-full border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
    >
      View on Map
    </a>
  );
}

function DetailField({
  label,
  children,
  inline = false,
}: {
  label: string;
  children: ReactNode;
  /** Label and value on the same row */
  inline?: boolean;
}) {
  if (inline) {
    return (
      <div className="grid min-h-[22px] grid-cols-[7.5rem_1fr] items-center gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <div className="min-w-0 text-[12px] font-medium leading-snug text-slate-800">
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-0.5 text-[12px] font-medium leading-snug text-slate-800">{children}</div>
    </div>
  );
}

/** Food-style details card (beside live map): pickup / drop / OTP & trip meta. */
export function TripDetailsCard({
  order,
}: {
  order: PersonRideDetailOrder;
}) {
  const ride = order.rideDetail;
  const pickup =
    order.pickupAddressNormalized?.trim() ||
    order.pickupAddressRaw?.trim() ||
    order.pickupAddressGeocoded?.trim() ||
    "—";
  const drop =
    order.dropAddressNormalized?.trim() ||
    order.dropAddressRaw?.trim() ||
    order.dropAddressGeocoded?.trim() ||
    "—";
  const otp = ride?.pickupOtp?.trim() || null;
  const locationMismatch =
    order.distanceMismatchFlagged ||
    (order.pickupAddressDeviationMeters ?? 0) > 800 ||
    (order.dropAddressDeviationMeters ?? 0) > 800;
  const scheduled = ride?.scheduledRide
    ? ride.scheduledPickupTime
      ? formatDateTime(ride.scheduledPickupTime)
      : "Yes"
    : null;
  const riderPayout = readRiderPayoutSnapshotFromBilling(order.billingSnapshot);
  const payoutPickupKm = riderPayout?.pickupDistanceKm ?? null;
  const payoutTripKm = riderPayout?.tripDistanceKm ?? null;
  const dropDistKm =
    payoutTripKm ??
    (order.distanceKm != null && Number.isFinite(order.distanceKm)
      ? order.distanceKm
      : haversineKm(order.pickupLat, order.pickupLon, order.dropLat, order.dropLon));
  const pickupDistLabel =
    ride?.pickupDistanceFromBookerKm != null
      ? `${ride.pickupDistanceFromBookerKm.toFixed(1)} km`
      : payoutPickupKm != null
        ? formatKm(payoutPickupKm)
        : "—";
  const durationLabel =
    formatDurationFromSeconds(order.etaSeconds) !== "—"
      ? formatDurationFromSeconds(order.etaSeconds)
      : formatEtaLabel(order.etaSeconds);

  return (
    <div className="flex h-full flex-col rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-[#e5e5e5] pb-1.5">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-700">
            ↕
          </span>
          Ride details
        </span>
        {locationMismatch ? (
          <span className="inline-flex rounded-full border border-red-100 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
            Address mismatch
          </span>
        ) : null}
      </div>

      <div className="grid flex-1 gap-3 sm:grid-cols-2">
        {/* Col 1: Pickup + Drop */}
        <div className="space-y-2.5 border-b border-slate-100 pb-2 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3">
          <div className="grid grid-cols-2 gap-2">
            <DetailField label="Pickup dist.">{pickupDistLabel}</DetailField>
            <DetailField label="Drop dist.">{formatKm(dropDistKm)}</DetailField>
          </div>

          <div className="border-t border-slate-100 pt-2.5" />

          <DetailField label="Pickup">
            <span>{pickup}</span>
          </DetailField>
          <DetailField label="Pickup lat/lon">
            {order.pickupLat != null && order.pickupLon != null ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span className="pr-num text-[11px]">
                  {order.pickupLat}, {order.pickupLon}
                </span>
                <MapLink lat={order.pickupLat} lon={order.pickupLon} />
              </span>
            ) : (
              "—"
            )}
          </DetailField>

          <div className="border-t border-slate-100 pt-2.5" />

          <DetailField label="Drop">
            <span>{drop}</span>
          </DetailField>
          <DetailField label="Drop lat/lon">
            {order.dropLat != null && order.dropLon != null ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span className="pr-num text-[11px]">
                  {order.dropLat}, {order.dropLon}
                </span>
                <MapLink lat={order.dropLat} lon={order.dropLon} />
              </span>
            ) : (
              "—"
            )}
          </DetailField>
        </div>

        {/* Col 2: Total / Duration + unwrapped meta */}
        <div className="space-y-2">
          <DetailField label="Total trip distance" inline>
            <span className="pr-num font-semibold">{formatKm(order.distanceKm)}</span>
          </DetailField>
          <DetailField label="Duration / ETA" inline>
            <span className="pr-num">{durationLabel}</span>
          </DetailField>

          <div className="border-t border-slate-100 pt-2" />

          <DetailField label="Pickup OTP" inline>
            {otp ? (
              <span className="inline-flex items-center rounded-md border border-dashed border-emerald-400 bg-emerald-50 px-2 py-0.5 pr-num text-[13px] font-bold tracking-[0.2em] text-emerald-800">
                {otp}
              </span>
            ) : (
              "—"
            )}
          </DetailField>
          <DetailField label="Passengers" inline>
            {ride?.passengerCount ?? 1}
          </DetailField>
          <DetailField label="Booked for" inline>
            {ride?.bookedForSelf === false ? "Someone else" : "Self"}
          </DetailField>
          {!ride?.bookedForSelf && order.customerName ? (
            <DetailField label="Booked by" inline>
              {order.customerName}
            </DetailField>
          ) : null}
          <DetailField label="Ride type" inline>
            {formatLabel(ride?.rideType ?? ride?.vehicleTypeRequired)}
          </DetailField>
          <DetailField label="Account" inline>
            {formatLabel(order.customerAccountStatus)}
          </DetailField>
          {ride?.returnTrip ? (
            <DetailField label="Return trip" inline>
              Yes
            </DetailField>
          ) : null}
          {scheduled ? (
            <DetailField label="Scheduled" inline>
              {scheduled}
            </DetailField>
          ) : null}
          {ride?.intermediateStopsCount ? (
            <DetailField label="Stops" inline>
              {ride.intermediateStopsCount}
            </DetailField>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function FareSummaryCard({
  order,
  paymentDetail,
}: {
  order: PersonRideDetailOrder;
  paymentDetail: OrderPaymentDetail | null;
}) {
  const ride = order.rideDetail;
  const { lines, totalFare } = buildRideInvoiceLinesFromSnapshot({
    billingSnapshot: order.billingSnapshot,
    fareAmount: order.itemTotal ?? order.fareAmount,
    tipAmount: order.tipAmount,
    grandTotal:
      paymentDetail?.totalPaid ??
      paymentDetail?.totalAmount ??
      order.grandTotal ??
      order.fareAmount,
    waitingCharges: ride?.waitingCharges,
    tollCharges: ride?.tollCharges,
    parkingCharges: ride?.parkingCharges,
  });

  const method =
    paymentDetail?.paymentMode ||
    paymentDetail?.source ||
    order.paymentMethod ||
    null;
  const payStatus =
    paymentDetail?.records?.[0]?.paymentStatus ||
    order.paymentStatus ||
    null;
  const farePending = isRideFarePaymentPending(payStatus);
  const riderPayout = readRiderPayoutSnapshotFromBilling(order.billingSnapshot);
  const riderDeliveryCharge = riderPayout?.baseEarning ?? null;
  const ctde = riderPayout?.totalEarning ?? null;
  const ctc = totalFare;

  return (
    <CompactCard>
      <CardHeader
        icon={
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-700">
            ₹
          </span>
        }
        title="Fare"
        right={
          payStatus ? (
            <span
              className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                farePending
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              {formatLabel(String(payStatus))}
            </span>
          ) : null
        }
      />
      <div className="grid grid-cols-2 gap-2">
        {/* CTC — customer payable */}
        <div className="min-w-0 space-y-1 border-r border-slate-100 pr-2">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            CTC
          </p>
          {lines.map((line, idx) => (
            <Row
              key={`ctc-${line.label}-${idx}`}
              label={line.label}
              value={
                line.isDiscount ? (
                  <span className="pr-num text-emerald-700">−{formatInr(line.amount)}</span>
                ) : (
                  formatInr(line.amount)
                )
              }
            />
          ))}
          <div className="my-1 border-t border-slate-100" />
          <Row
            label="Total"
            value={
              <span className="pr-num text-[12px] font-bold text-slate-900">
                {formatInr(ctc)}
              </span>
            }
          />
          <Row label="Method" value={formatLabel(method ? String(method) : null)} />
        </div>

        {/* CTDE — rider earnings */}
        <div className="min-w-0 space-y-1 pl-1">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            CTDE
          </p>
          <Row
            label="Rider delivery charge"
            value={
              riderDeliveryCharge != null ? (
                <span className="pr-num font-semibold text-slate-800">
                  {formatInr(riderDeliveryCharge)}
                </span>
              ) : (
                "—"
              )
            }
          />
          {riderPayout != null && riderPayout.waitingEarning > 0.005 ? (
            <Row label="Rider waiting" value={formatInr(riderPayout.waitingEarning)} />
          ) : null}
          {riderPayout != null && riderPayout.surgeEarning > 0.005 ? (
            <Row label="Rider surge" value={formatInr(riderPayout.surgeEarning)} />
          ) : null}
          <div className="my-1 border-t border-slate-100" />
          <Row
            label="Total"
            value={
              <span className="pr-num text-[12px] font-bold text-emerald-700">
                {ctde != null ? formatInr(ctde) : "—"}
              </span>
            }
          />
        </div>
      </div>
    </CompactCard>
  );
}

export type TimelineStamp = { stageKey: string; at: string | null };

export function RouteCard({ order }: { order: PersonRideDetailOrder }) {
  const pickup =
    order.pickupAddressNormalized?.trim() ||
    order.pickupAddressRaw?.trim() ||
    "Pickup unavailable";
  const drop =
    order.dropAddressNormalized?.trim() ||
    order.dropAddressRaw?.trim() ||
    "Drop unavailable";
  const scheduled = order.rideDetail?.scheduledRide
    ? order.rideDetail.scheduledPickupTime
    : null;

  return (
    <CompactCard>
      <CardHeader
        icon={
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-700">
            ↕
          </span>
        }
        title="Pickup & drop"
      />
      <div className="relative mt-1 space-y-0 pl-0.5">
        <div className="absolute bottom-2 left-[7px] top-2 w-px bg-slate-200" />
        <div className="relative flex gap-2.5 pb-3">
          <div
            className="relative z-10 mt-1 h-[14px] w-[14px] shrink-0 rounded-full"
            style={{ background: PR_GREEN }}
          />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Pickup
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-800">{pickup}</p>
            <p className="pr-num mt-0.5 text-[10px] text-slate-500">
              {scheduled ? formatDateTime(scheduled) : formatDateTime(order.createdAt)}
            </p>
          </div>
        </div>
        <div className="relative flex gap-2.5">
          <div
            className="relative z-10 mt-1 h-[14px] w-[14px] shrink-0 rounded-full"
            style={{ background: PR_BLACK }}
          />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Drop
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-800">{drop}</p>
            <p className="pr-num mt-0.5 text-[10px] text-slate-500">
              {order.estimatedDeliveryTime
                ? formatDateTime(order.estimatedDeliveryTime)
                : formatEtaLabel(order.etaSeconds)}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
        <div>
          <p className="text-[10px] text-slate-500">Distance</p>
          <p className="pr-num text-[12px] font-semibold">{formatKm(order.distanceKm)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500">Duration</p>
          <p className="pr-num text-[12px] font-semibold">
            {formatDurationFromSeconds(order.etaSeconds)}
          </p>
        </div>
      </div>
    </CompactCard>
  );
}

export function RideTimelineCard({
  order,
  stamps,
}: {
  order: PersonRideDetailOrder;
  stamps: TimelineStamp[];
  compact?: boolean;
}) {
  const status = normalizeStatus(order.currentStatus ?? order.status);
  const currentIdx = activeMilestoneIndex(status);
  const cancelled = status === "cancelled";
  const stampMap = new Map(stamps.map((s) => [s.stageKey, s.at]));

  return (
    <CompactCard>
      <CardHeader
        icon={
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-semibold text-emerald-700">
            <Timer className="h-3 w-3" />
          </span>
        }
        title="Ride timeline"
      />
      <ol className="mt-0.5 space-y-0">
        {RIDE_MILESTONES.map((m, i) => {
          const done = !cancelled && currentIdx >= 0 && i <= currentIdx;
          const current = !cancelled && i === currentIdx;
          const stamp =
            stampMap.get(m.key) ||
            (i === 0 ? order.createdAt : null) ||
            (m.statuses.includes(status) ? order.updatedAt : null);
          return (
            <li key={m.key} className="relative flex gap-2 pb-1.5 last:pb-0">
              {i < RIDE_MILESTONES.length - 1 ? (
                <div
                  className="absolute bottom-0 left-[5px] top-3 w-px"
                  style={{ background: done ? PR_GREEN : "#E5E7EB" }}
                />
              ) : null}
              <div
                className="relative z-10 mt-0.5 flex h-[11px] w-[11px] shrink-0 items-center justify-center rounded-full"
                style={{
                  background: done ? PR_GREEN : PR_SURFACE,
                  border: `1.5px solid ${done ? PR_GREEN : "#D1D5DB"}`,
                }}
              />
              <div className="min-w-0 flex-1 leading-tight">
                <p
                  className="text-[11px] font-medium"
                  style={{ color: done || current ? PR_BLACK : PR_MUTED }}
                >
                  {m.label}
                </p>
                <p className="pr-num text-[9px] text-slate-500">
                  {stamp ? formatDateTime(stamp) : current ? "In progress" : "—"}
                </p>
              </div>
            </li>
          );
        })}
        {cancelled ? (
          <li className="relative flex gap-2 pb-0">
            <div
              className="relative z-10 flex h-[11px] w-[11px] shrink-0 items-center justify-center rounded-full"
              style={{ background: PR_RED }}
            >
              <AlertTriangle className="h-2 w-2 text-white" />
            </div>
            <div className="leading-tight">
              <p className="text-[11px] font-medium" style={{ color: PR_RED }}>
                Cancelled
              </p>
              <p className="pr-num text-[9px] text-slate-500">
                {formatDateTime(order.updatedAt)}
              </p>
            </div>
          </li>
        ) : null}
      </ol>
    </CompactCard>
  );
}
