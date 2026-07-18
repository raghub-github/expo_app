"use client";

import { useState } from "react";
import { Car, Clock, MapPin, Phone, User, Users } from "lucide-react";
import CustomerDetails from "./CustomerDetails";
import PaymentDetails from "./PaymentDetails";
import type { PersonRideOrderDetail } from "@/lib/orders/person-ride-order-types";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/context/ToastContext";

type OrderLike = {
  id: number;
  customerId: number | null;
  customerExternalId: string | null;
  customerName: string | null;
  customerMobile: string | null;
  customerEmail: string | null;
  customerAccountStatus: string | null;
  customerRiskFlag: string | null;
  customerUserType?: string | null;
  customerFraudReasons?: string[];
  customerTrustTierLabel?: string | null;
  pickupAddressRaw?: string | null;
  pickupAddressNormalized?: string | null;
  pickupAddressGeocoded?: string | null;
  pickupLat?: number | null;
  pickupLon?: number | null;
  dropAddressRaw: string | null;
  dropAddressNormalized?: string | null;
  dropAddressGeocoded?: string | null;
  dropLat?: number | null;
  dropLon?: number | null;
  distanceKm?: number | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  status?: string | null;
  currentStatus?: string | null;
  riderId?: number | null;
  fareAmount: number | null;
  grandTotal: number | null;
  tipAmount: number | null;
  distanceMismatchFlagged?: boolean;
  pickupAddressDeviationMeters?: number | null;
  dropAddressDeviationMeters?: number | null;
};

function formatLabel(raw: string | null | undefined): string {
  if (!raw?.trim()) return "—";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-[11px] text-slate-500 shrink-0">{label}</span>
      <span className="text-[11px] font-medium text-slate-800 text-right">{value}</span>
    </div>
  );
}

function AddressCard({
  title,
  address,
  iconColor,
}: {
  title: string;
  address: string | null | undefined;
  iconColor: string;
}) {
  const text = address?.trim() || "—";
  return (
    <div className="bg-white rounded-lg px-3 py-2 shadow-sm border border-[#e5e5e5] h-full">
      <div className="flex items-center gap-1.5 mb-2">
        <MapPin className={`h-3.5 w-3.5 ${iconColor}`} />
        <h3 className="text-[12px] font-semibold text-slate-900">{title}</h3>
      </div>
      <p className="text-[11px] text-slate-700 leading-relaxed">{text}</p>
    </div>
  );
}

export default function PersonRideOrderSections({
  order,
  rideDetail,
  displayId,
  createdLabel,
  paymentDetail,
  orderRefunds,
  recoveryRecords,
  onCopy,
  onPhoneClick,
  onRefresh,
}: {
  order: OrderLike;
  rideDetail: PersonRideOrderDetail | null;
  displayId: string;
  createdLabel: string;
  paymentDetail: unknown;
  orderRefunds: unknown[];
  recoveryRecords?: unknown[];
  onCopy: (text: string) => void;
  onPhoneClick: (title: string, phone: string) => void;
  onRefresh?: () => void;
}) {
  const [clearingHold, setClearingHold] = useState(false);
  const [holdCleared, setHoldCleared] = useState(false);
  const [clearHoldModalOpen, setClearHoldModalOpen] = useState(false);
  const { toast } = useToast();

  const statusUpper = String(order.currentStatus ?? order.status ?? "")
    .trim()
    .toUpperCase();
  const paymentUpper = String(order.paymentStatus ?? "").trim().toLowerCase();
  const paymentPending = paymentUpper !== "paid" && paymentUpper !== "completed";
  const canClearRiderHold =
    statusUpper === "DELIVERED" &&
    paymentPending &&
    order.riderId != null &&
    order.riderId > 0 &&
    !holdCleared;

  const handleClearRiderHold = async () => {
    if (!canClearRiderHold || clearingHold) return;
    setClearingHold(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/clear-rider-payment-hold`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        toast(json.error ?? "Could not clear rider payment hold.", "error");
        return;
      }
      setHoldCleared(true);
      setClearHoldModalOpen(false);
      toast("Rider payment hold cleared. Rider can accept new offers.", "success");
      onRefresh?.();
    } finally {
      setClearingHold(false);
    }
  };

  const passengerName =
    rideDetail?.passengerName?.trim() ||
    order.customerName?.trim() ||
    "—";
  const passengerPhone =
    rideDetail?.passengerPhone?.trim() || order.customerMobile?.trim() || null;

  const isLocationMismatch =
    Boolean(order.distanceMismatchFlagged) ||
    (order.pickupAddressDeviationMeters ?? 0) > 800 ||
    (order.dropAddressDeviationMeters ?? 0) > 800;

  return (
    <div className="mt-3 space-y-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {/* Passenger */}
        <div className="bg-white rounded-lg px-3 py-2 shadow-sm border border-[#e5e5e5]">
          <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-slate-100">
            <User className="h-3.5 w-3.5 text-blue-600" />
            <h3 className="text-[12px] font-semibold text-slate-900">Passenger</h3>
          </div>
          <DetailRow label="Name" value={passengerName} />
          <DetailRow
            label="Mobile"
            value={
              passengerPhone ? (
                <button
                  type="button"
                  onClick={() => onPhoneClick("Passenger", passengerPhone)}
                  className="inline-flex items-center gap-1 text-blue-700 hover:underline cursor-pointer"
                >
                  <Phone className="h-3 w-3" />
                  {passengerPhone}
                </button>
              ) : (
                "—"
              )
            }
          />
          <DetailRow
            label="Passengers"
            value={rideDetail?.passengerCount ?? 1}
          />
          <DetailRow
            label="Booked for"
            value={rideDetail?.bookedForSelf === false ? "Someone else" : "Self"}
          />
          {!rideDetail?.bookedForSelf && order.customerName ? (
            <DetailRow label="Booked by" value={order.customerName} />
          ) : null}
        </div>

        {/* Trip */}
        <div className="bg-white rounded-lg px-3 py-2 shadow-sm border border-[#e5e5e5]">
          <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-slate-100">
            <Car className="h-3.5 w-3.5 text-indigo-600" />
            <h3 className="text-[12px] font-semibold text-slate-900">Trip details</h3>
          </div>
          <DetailRow label="Vehicle" value={formatLabel(rideDetail?.vehicleTypeRequired ?? rideDetail?.rideType)} />
          <DetailRow label="Ride type" value={formatLabel(rideDetail?.rideType)} />
          <DetailRow
            label="Distance"
            value={
              order.distanceKm != null && Number.isFinite(Number(order.distanceKm))
                ? `${Number(order.distanceKm).toFixed(1)} km`
                : "—"
            }
          />
          <DetailRow
            label="Scheduled"
            value={
              rideDetail?.scheduledRide ? (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3 text-amber-600" />
                  {rideDetail.scheduledPickupTime
                    ? new Date(rideDetail.scheduledPickupTime).toLocaleString("en-IN")
                    : "Yes"}
                </span>
              ) : (
                "Instant"
              )
            }
          />
          <DetailRow label="Return trip" value={rideDetail?.returnTrip ? "Yes" : "No"} />
          {rideDetail?.pickupOtp ? (
            <DetailRow label="Pickup OTP" value={<span className="font-mono">{rideDetail.pickupOtp}</span>} />
          ) : null}
          {rideDetail?.intermediateStopsCount ? (
            <DetailRow label="Stops" value={rideDetail.intermediateStopsCount} />
          ) : null}
          {rideDetail?.waitingCharges != null && rideDetail.waitingCharges > 0 ? (
            <DetailRow label="Waiting" value={`₹${Math.round(rideDetail.waitingCharges)}`} />
          ) : null}
          {rideDetail?.tollCharges != null && rideDetail.tollCharges > 0 ? (
            <DetailRow label="Toll" value={`₹${Math.round(rideDetail.tollCharges)}`} />
          ) : null}
        </div>

        {/* Payment */}
        <PaymentDetails
          order={{
            id: order.id,
            orderType: "person_ride",
            orderSource: "internal",
            paymentStatus: order.paymentStatus ?? null,
            paymentMethod: order.paymentMethod ?? null,
            fareAmount: order.fareAmount,
            totalAmount: order.grandTotal ?? order.fareAmount,
            grandTotal: order.grandTotal,
            tipAmount: order.tipAmount,
          }}
          displayId={displayId}
          orderRefunds={orderRefunds as Parameters<typeof PaymentDetails>[0]["orderRefunds"]}
          recoveryRecords={
            recoveryRecords as Parameters<typeof PaymentDetails>[0]["recoveryRecords"]
          }
          paymentDetail={paymentDetail as Parameters<typeof PaymentDetails>[0]["paymentDetail"]}
          orderItemsPricing={null}
        />
        {canClearRiderHold ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
            <p className="text-[11px] font-medium text-amber-900 leading-relaxed">
              Customer fare is still unpaid. The assigned rider may be stuck on the payment-wait screen.
            </p>
            <button
              type="button"
              onClick={() => setClearHoldModalOpen(true)}
              disabled={clearingHold}
              className="mt-2 inline-flex items-center rounded-md bg-amber-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {clearingHold ? "Clearing…" : "Clear rider payment hold"}
            </button>
          </div>
        ) : holdCleared ? (
          <p className="mt-2 text-[11px] font-medium text-emerald-700">
            Rider payment hold cleared — rider can receive new offers.
          </p>
        ) : null}
      </div>

      {/* Booker / customer account */}
      <div className="grid gap-3 md:grid-cols-2">
        <CustomerDetails
          order={{
            userId: order.customerExternalId ?? order.customerId ?? order.id,
            customerDbId: order.customerId,
            customerLatLon:
              order.dropLat != null && order.dropLon != null
                ? `${order.dropLat}, ${order.dropLon}`
                : null,
            customerName: order.customerName,
            customerMobile: order.customerMobile,
            customerEmail: order.customerEmail,
            customerAddress: order.dropAddressNormalized ?? order.dropAddressRaw,
            dropAddressRaw: order.dropAddressRaw,
            dropAddressNormalized: order.dropAddressNormalized,
            dropAddressGeocoded: order.dropAddressGeocoded,
            userType: order.customerUserType ?? order.customerTrustTierLabel ?? null,
            fraudReasons: order.customerFraudReasons ?? [],
            locationMismatch: isLocationMismatch,
            accountStatus: order.customerAccountStatus,
            riskFlag: order.customerRiskFlag,
          }}
          onCopy={onCopy}
          onPhoneClick={onPhoneClick}
        />

        <div className="bg-white rounded-lg px-3 py-2 shadow-sm border border-[#e5e5e5]">
          <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-slate-100">
            <Users className="h-3.5 w-3.5 text-slate-600" />
            <h3 className="text-[12px] font-semibold text-slate-900">Booking info</h3>
          </div>
          <DetailRow label="Order time" value={createdLabel} />
          <DetailRow label="Order ID" value={displayId} />
          {rideDetail?.pickupDistanceFromBookerKm != null ? (
            <DetailRow
              label="Pickup distance from booker"
              value={`${rideDetail.pickupDistanceFromBookerKm.toFixed(1)} km`}
            />
          ) : null}
        </div>
      </div>

      {/* Pickup & drop */}
      <div className="grid gap-3 md:grid-cols-2">
        <AddressCard
          title="Pickup"
          address={order.pickupAddressNormalized ?? order.pickupAddressRaw}
          iconColor="text-emerald-600"
        />
        <AddressCard
          title="Drop"
          address={order.dropAddressNormalized ?? order.dropAddressRaw}
          iconColor="text-red-500"
        />
      </div>

      <ConfirmModal
        open={clearHoldModalOpen}
        title="Clear rider payment hold?"
        description={
          <>
            Release this rider from the payment-wait hold? The rider will receive earnings and can
            accept new offers. The customer will still need to pay before booking another ride.
          </>
        }
        confirmLabel="Clear hold"
        cancelLabel="Cancel"
        confirmBusy={clearingHold}
        onClose={() => {
          if (!clearingHold) setClearHoldModalOpen(false);
        }}
        onConfirm={handleClearRiderHold}
      />
    </div>
  );
}
