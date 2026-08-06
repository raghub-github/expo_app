"use client";

import Link from "next/link";
import { IndianRupee, MapPin, Package, User } from "lucide-react";
import type { OrderPaymentDetail } from "@/lib/orders/order-payment-types";
import { buildRideInvoiceLinesFromSnapshot } from "@/lib/orders/ride-invoice-lines";
import { isRideFarePaymentPending } from "@/lib/riders/ride-wallet-credit-pending";
import { readRiderPayoutSnapshotFromBilling } from "@/lib/riders/rider-payout-snapshot";
import type { ParcelDetailOrder } from "./parcel-detail-types";
import {
  formatInr,
  formatKm,
  formatLabel,
  haversineKm,
  PR_MUTED,
} from "../person-ride/person-ride-utils";

function CompactCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 shadow-sm transition-all hover:border-neutral-300 hover:shadow-md">
      {children}
    </div>
  );
}

function CardHeader({
  icon,
  title,
  right,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-start justify-between gap-2 border-b border-[#e5e5e5] pb-1.5">
      <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900">
        {icon}
        {title}
      </span>
      {right}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid min-h-[20px] grid-cols-[96px_1fr] items-start gap-1">
      <div className="pr-body text-[12px] font-medium" style={{ color: PR_MUTED }}>
        {label}
      </div>
      <div className="pr-body text-[12px] font-medium text-slate-800 break-words">{value}</div>
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

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-0.5 text-[12px] font-medium leading-snug text-slate-800">{children}</div>
    </div>
  );
}

function OtpBadge({ otp, tone }: { otp: string; tone: "pickup" | "delivery" }) {
  const cls =
    tone === "pickup"
      ? "border-emerald-400 bg-emerald-50 text-emerald-800"
      : "border-sky-400 bg-sky-50 text-sky-800";
  return (
    <span
      className={`inline-flex items-center rounded-md border border-dashed px-2 py-0.5 pr-num text-[13px] font-bold tracking-[0.2em] ${cls}`}
    >
      {otp}
    </span>
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

export function SenderCard({ order }: { order: ParcelDetailOrder }) {
  const parcel = order.parcelDetail;
  const name = parcel?.senderName?.trim() || order.customerName?.trim() || "—";
  const mobile = parcel?.senderMobile?.trim() || order.customerMobile?.trim() || "—";

  return (
    <CompactCard>
      <CardHeader icon={<User className="h-4 w-4 text-emerald-600" />} title="Sender" />
      <div className="space-y-1.5">
        <Row label="Name" value={name} />
        <Row label="Mobile" value={mobile} />
        {order.customerEmail ? <Row label="Email" value={order.customerEmail} /> : null}
        {order.customerExternalId ? (
          <Row
            label="Customer ID"
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
        <Row label="Account" value={formatLabel(order.customerAccountStatus)} />
        {order.customerTrustTierLabel ? (
          <Row label="Trust tier" value={formatLabel(order.customerTrustTierLabel)} />
        ) : null}
      </div>
    </CompactCard>
  );
}

export function ReceiverCard({ order }: { order: ParcelDetailOrder }) {
  const parcel = order.parcelDetail;
  const name = parcel?.receiverName?.trim() || "—";
  const mobile = parcel?.receiverMobile?.trim() || "—";

  return (
    <CompactCard>
      <CardHeader icon={<User className="h-4 w-4 text-sky-600" />} title="Receiver" />
      <div className="space-y-1.5">
        <Row label="Name" value={name} />
        <Row label="Mobile" value={mobile} />
        {parcel?.requiresOtpVerification ? (
          <Row label="OTP required" value="Yes — delivery OTP handoff" />
        ) : null}
      </div>
    </CompactCard>
  );
}

export function PackageCard({ order }: { order: ParcelDetailOrder }) {
  const parcel = order.parcelDetail;
  if (!parcel) {
    return (
      <CompactCard>
        <CardHeader icon={<Package className="h-4 w-4 text-amber-600" />} title="Package" />
        <p className="text-[12px] text-slate-500">Parcel details not recorded.</p>
      </CompactCard>
    );
  }

  const dims =
    parcel.lengthCm != null && parcel.widthCm != null && parcel.heightCm != null
      ? `${parcel.lengthCm} × ${parcel.widthCm} × ${parcel.heightCm} cm`
      : "—";

  const paymentLabel = parcel.isCod
    ? `COD · ${formatInr(parcel.codAmount ?? order.grandTotal)}`
    : parcel.paymentMethod === "online"
      ? "Paid online"
      : parcel.paymentMethod
        ? formatLabel(parcel.paymentMethod)
        : order.paymentMethod
          ? formatLabel(order.paymentMethod)
          : "—";

  return (
    <CompactCard>
      <CardHeader icon={<Package className="h-4 w-4 text-amber-600" />} title="Package" />
      <div className="space-y-1.5">
        <Row label="Category" value={formatVehicleLabel(parcel)} />
        {parcel.parcelType && parcel.parcelType !== parcel.vehicleCategory ? (
          <Row label="Parcel type" value={formatLabel(parcel.parcelType.replace(/_/g, " "))} />
        ) : null}
        <Row label="Weight" value={parcel.weightKg != null ? `${parcel.weightKg} kg` : "—"} />
        <Row label="Dimensions" value={dims} />
        <Row label="Payment" value={paymentLabel} />
        {parcel.payAt ? <Row label="Pay at" value={formatLabel(parcel.payAt)} /> : null}
        {parcel.couponCode ? <Row label="Coupon" value={parcel.couponCode} /> : null}
        {parcel.appliedOfferDiscount != null && parcel.appliedOfferDiscount > 0 ? (
          <Row
            label="Offer off"
            value={
              <span className="pr-num text-emerald-700">
                −{formatInr(parcel.appliedOfferDiscount)}
              </span>
            }
          />
        ) : null}
      </div>
    </CompactCard>
  );
}

export function ParcelFareSummaryCard({
  order,
  paymentDetail,
}: {
  order: ParcelDetailOrder;
  paymentDetail: OrderPaymentDetail | null;
}) {
  const parcel = order.parcelDetail;
  const parcelFare =
    parcel?.finalFare ?? parcel?.estimatedFare ?? order.grandTotal ?? order.fareAmount;

  const { lines: rawLines, totalFare: snapTotal } = buildRideInvoiceLinesFromSnapshot({
    billingSnapshot: order.billingSnapshot,
    fareAmount: order.itemTotal ?? order.fareAmount ?? parcelFare,
    tipAmount: order.tipAmount,
    grandTotal:
      paymentDetail?.totalPaid ??
      paymentDetail?.totalAmount ??
      order.grandTotal ??
      parcelFare,
  });

  const lines = rawLines.map((line) =>
    line.label === "Ride charge" ? { ...line, label: "Parcel charge" } : line
  );

  const hasOfferInLines = lines.some((l) => l.isDiscount);
  if (
    !hasOfferInLines &&
    parcel?.appliedOfferDiscount != null &&
    parcel.appliedOfferDiscount > 0.005
  ) {
    lines.push({
      label: parcel.couponCode?.trim() || "Offer discount",
      amount: parcel.appliedOfferDiscount,
      isDiscount: true,
    });
  }

  const ctc =
    snapTotal > 0
      ? snapTotal
      : Math.max(
          0,
          Number(parcelFare ?? 0) -
            (hasOfferInLines || parcel?.appliedOfferDiscount
              ? parcel?.appliedOfferDiscount ?? 0
              : 0)
        );

  const method =
    paymentDetail?.paymentMode ||
    paymentDetail?.source ||
    parcel?.paymentMethod ||
    order.paymentMethod ||
    null;
  const payStatus =
    paymentDetail?.records?.[0]?.paymentStatus || order.paymentStatus || null;
  const farePending = isRideFarePaymentPending(payStatus);
  const riderPayout = readRiderPayoutSnapshotFromBilling(order.billingSnapshot);
  const riderDeliveryCharge = riderPayout?.baseEarning ?? null;
  const ctde = riderPayout?.totalEarning ?? null;

  return (
    <CompactCard>
      <CardHeader
        icon={
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-700">
            <IndianRupee className="h-3.5 w-3.5" />
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
          ) : parcel?.isCod ? (
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              COD
            </span>
          ) : null
        }
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0 space-y-1 border-r border-slate-100 pr-2">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">CTC</p>
          {lines.length > 0 ? (
            lines.map((line, idx) => (
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
            ))
          ) : (
            <Row label="Parcel charge" value={formatInr(parcelFare)} />
          )}
          <div className="my-1 border-t border-slate-100" />
          <Row
            label="Total"
            value={
              <span className="pr-num text-[12px] font-bold text-slate-900">{formatInr(ctc)}</span>
            }
          />
          <Row label="Method" value={formatLabel(method ? String(method) : null)} />
          {parcel?.estimatedFare != null && parcel.finalFare != null &&
          Math.abs(parcel.estimatedFare - parcel.finalFare) > 0.01 ? (
            <Row
              label="Quoted"
              value={
                <span className="pr-num text-slate-500">{formatInr(parcel.estimatedFare)}</span>
              }
            />
          ) : null}
        </div>

        <div className="min-w-0 space-y-1 pl-1">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">CTDE</p>
          <Row
            label="Captain payout"
            value={
              riderDeliveryCharge != null ? (
                <span className="pr-num font-semibold text-slate-800">
                  {formatInr(riderDeliveryCharge)}
                </span>
              ) : order.riderId ? (
                "Pending assignment"
              ) : (
                "—"
              )
            }
          />
          {riderPayout != null && riderPayout.surgeEarning > 0.005 ? (
            <Row label="Surge" value={formatInr(riderPayout.surgeEarning)} />
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

export function ParcelTripDetailsCard({ order }: { order: ParcelDetailOrder }) {
  const parcel = order.parcelDetail;
  const pickup =
    parcel?.pickupAddress?.trim() ||
    order.pickupAddressNormalized?.trim() ||
    order.pickupAddressRaw?.trim() ||
    order.pickupAddressGeocoded?.trim() ||
    "—";
  const drop =
    parcel?.dropAddress?.trim() ||
    order.dropAddressNormalized?.trim() ||
    order.dropAddressRaw?.trim() ||
    order.dropAddressGeocoded?.trim() ||
    "—";
  const tripKm =
    parcel?.tripDistanceKm ??
    (order.distanceKm != null && Number.isFinite(order.distanceKm)
      ? order.distanceKm
      : haversineKm(order.pickupLat, order.pickupLon, order.dropLat, order.dropLon));

  const pickupOtp = parcel?.pickupOtp?.trim() || null;
  const deliveryOtp = parcel?.deliveryOtp?.trim() || null;

  return (
    <div className="flex h-full flex-col rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-[#e5e5e5] pb-1.5">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900">
          <MapPin className="h-4 w-4 text-emerald-600" />
          Route &amp; handoff
        </span>
        {tripKm != null ? (
          <span className="pr-num rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
            {formatKm(tripKm)}
          </span>
        ) : null}
      </div>

      <div className="grid flex-1 gap-3 lg:grid-cols-2">
        <div className="space-y-3 rounded-md border border-slate-100 bg-slate-50/60 p-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Pickup</p>
          <DetailField label="Label">{parcel?.pickupLabel?.trim() || "—"}</DetailField>
          <DetailField label="Address">{pickup}</DetailField>
          <DetailField label="Coordinates">
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
          <DetailField label="Pickup OTP">
            {pickupOtp ? <OtpBadge otp={pickupOtp} tone="pickup" /> : "—"}
          </DetailField>
        </div>

        <div className="space-y-3 rounded-md border border-slate-100 bg-slate-50/60 p-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-sky-700">Drop</p>
          <DetailField label="Label">{parcel?.dropLabel?.trim() || "—"}</DetailField>
          <DetailField label="Address">{drop}</DetailField>
          <DetailField label="Coordinates">
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
          <DetailField label="Delivery OTP">
            {deliveryOtp ? <OtpBadge otp={deliveryOtp} tone="delivery" /> : "—"}
          </DetailField>
        </div>
      </div>

      {(parcel?.instructions ||
        parcel?.cancellationReasonText ||
        parcel?.cancellationReasonCode ||
        order.etaSeconds != null) && (
        <div className="mt-3 grid gap-2 border-t border-slate-100 pt-2 sm:grid-cols-2">
          {parcel?.instructions ? (
            <DetailField label="Instructions">{parcel.instructions}</DetailField>
          ) : null}
          {order.etaSeconds != null && order.etaSeconds > 0 ? (
            <DetailField label="ETA">
              <span className="pr-num">{Math.ceil(order.etaSeconds / 60)} min</span>
            </DetailField>
          ) : null}
          {parcel?.cancellationReasonText || parcel?.cancellationReasonCode ? (
            <DetailField label="Cancel reason">
              {parcel.cancellationReasonText?.trim() ||
                formatLabel(parcel.cancellationReasonCode?.replace(/_/g, " ") ?? null)}
            </DetailField>
          ) : null}
        </div>
      )}
    </div>
  );
}
