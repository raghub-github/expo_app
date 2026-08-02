'use client';

import { useState, type ReactNode } from 'react';
import { Bike, Clock, History, MapPin, Phone } from 'lucide-react';
import { useLiveElapsedSeconds } from '@/hooks/useLiveElapsedSeconds';
import { formatRiderStoreWaitLabel } from '@/lib/rider-store-wait-display';

export type RiderDeliveryPartnerCardProps = {
  riderName: string;
  riderPhone?: string | null;
  riderSelfieUrl?: string | null;
  variant: 'on_the_way' | 'arrived' | 'picked_up' | 'delivered' | 'cancelled' | 'rto';
  /** Shown under headline when rider is en route to merchant (e.g. Arriving in 8 min · 1.2 km away). */
  arrivalSubtitle?: string | null;
  pickupOtp?: string | null;
  rtoDisplay?: string | null;
  legacyOtp?: string | null;
  legacyOtpType?: string | null;
  deliveryLabel?: string | null;
  progressPercent?: number;
  onCallRider?: () => void;
  onTrackRider?: () => void;
  onOpenRiderPhoto?: (url: string) => void;
  onUniformFeedback?: (inUniform: boolean) => void;
  uniformFeedback?: boolean | null;
  /** ISO timestamp when rider reached store — enables live waiting timer. */
  storeWaitAnchorAt?: string | null;
  storeWaitLive?: boolean;
  storeWaitFinalizedSeconds?: number | null;
  /** Opens OrderRidersHistorySidesheet (merchant “View Old Rider's Log”). */
  onViewOldRidersLog?: () => void;
  /**
   * When true (default if `onViewOldRidersLog` is set), show a full-width
   * “View Old Rider's Log” button under Track live / Call.
   */
  showOldRidersLog?: boolean;
  showHeader?: boolean;
  className?: string;
};

function RiderAvatar({
  selfieUrl,
  name,
  onOpenPhoto,
}: {
  selfieUrl?: string | null;
  name: string;
  onOpenPhoto?: (url: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(selfieUrl?.trim()) && !failed;
  const canOpen = showPhoto && onOpenPhoto;

  const inner = showPhoto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={selfieUrl!}
      alt={name}
      className="h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  ) : (
    <Bike size={22} className="text-gray-500" aria-hidden />
  );

  const shell = (
    <div
      className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-gray-100 shadow-md ring-2 ring-sky-100 ${
        canOpen ? 'cursor-zoom-in transition hover:ring-sky-300 hover:shadow-lg' : ''
      }`}
    >
      {inner}
    </div>
  );

  if (canOpen) {
    return (
      <button
        type="button"
        onClick={() => onOpenPhoto(selfieUrl!.trim())}
        className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label={`View photo of ${name}`}
      >
        {shell}
      </button>
    );
  }

  return shell;
}

function RiderStoreWaitBadge({
  anchorAt,
  live,
  finalizedSeconds,
}: {
  anchorAt?: string | null;
  live?: boolean;
  finalizedSeconds?: number | null;
}) {
  const liveSeconds = useLiveElapsedSeconds(anchorAt, Boolean(live));
  const displaySeconds = live ? liveSeconds : finalizedSeconds;
  if (!live && (displaySeconds == null || displaySeconds <= 0)) return null;
  if (live && !anchorAt?.trim()) return null;

  return (
    <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-semibold tabular-nums text-amber-900">
      <Clock size={12} aria-hidden />
      Waiting{' '}
      {formatRiderStoreWaitLabel(displaySeconds, { live: Boolean(live) })}
    </span>
  );
}

export function RiderDeliveryPartnerCard({
  riderName,
  riderPhone,
  riderSelfieUrl,
  variant,
  arrivalSubtitle,
  pickupOtp,
  rtoDisplay,
  legacyOtp,
  legacyOtpType,
  deliveryLabel,
  progressPercent = 66,
  onCallRider,
  onTrackRider,
  onOpenRiderPhoto,
  onUniformFeedback,
  uniformFeedback,
  storeWaitAnchorAt,
  storeWaitLive = false,
  storeWaitFinalizedSeconds,
  onViewOldRidersLog,
  showOldRidersLog,
  showHeader = true,
  className = '',
}: RiderDeliveryPartnerCardProps) {
  const headline =
    variant === 'delivered'
      ? 'Order delivered'
      : variant === 'cancelled'
        ? 'Delivery cancelled'
        : variant === 'rto'
          ? 'Return to origin (RTO)'
          : variant === 'picked_up'
            ? `${riderName} is out for delivery`
            : variant === 'on_the_way'
              ? `${riderName} is on the way`
              : `${riderName} has arrived`;

  const isTerminalVariant =
    variant === 'delivered' || variant === 'cancelled' || variant === 'rto';

  const metaChips: ReactNode[] = [];
  if (variant === 'arrived') {
    if (riderPhone) {
      metaChips.push(
        <span
          key="phone"
          className="inline-flex rounded-md bg-gray-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-gray-800"
        >
          {riderPhone}
        </span>
      );
    }
    if (pickupOtp) {
      metaChips.push(
        <span
          key="pickup"
          className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-gray-900"
        >
          Pickup: {pickupOtp}
        </span>
      );
    }
    if (rtoDisplay) {
      metaChips.push(
        <span
          key="rto"
          className="inline-flex rounded-md bg-orange-50 px-2 py-0.5 font-mono text-[11px] font-bold text-orange-800"
        >
          RTO: {rtoDisplay}
        </span>
      );
    }
    if (!pickupOtp && !rtoDisplay && legacyOtp) {
      metaChips.push(
        <span
          key="otp"
          className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-gray-900"
        >
          OTP: {legacyOtp}
          {legacyOtpType ? (
            <span className="ml-1 font-normal text-gray-500">({legacyOtpType})</span>
          ) : null}
        </span>
      );
    }
  }

  const showTrackLive = Boolean(onTrackRider) && !isTerminalVariant && variant !== 'picked_up';
  const showActions = Boolean(showTrackLive || riderPhone);
  // Prefer explicit flag; otherwise show whenever a handler is wired.
  const showLogControl = Boolean(
    onViewOldRidersLog && (showOldRidersLog ?? true)
  );

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm ${className}`}
    >
      {showHeader ? (
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white px-3 py-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Delivery partner
          </p>
        </div>
      ) : null}

      <div className="flex items-center gap-3 p-3">
        <RiderAvatar
          selfieUrl={riderSelfieUrl}
          name={riderName}
          onOpenPhoto={onOpenRiderPhoto}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold leading-tight text-gray-900 sm:text-sm">{headline}</p>
          {variant === 'on_the_way' && arrivalSubtitle ? (
            <p className="mt-1.5 text-xs font-semibold text-teal-700 tabular-nums">{arrivalSubtitle}</p>
          ) : null}
          {variant === 'on_the_way' && riderName ? (
            <p className="mt-1 text-xs text-gray-600">
              <span className="font-semibold text-gray-800">{riderName}</span> is heading to your store
            </p>
          ) : null}
          {variant === 'arrived' && metaChips.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">{metaChips}</div>
          ) : null}
          {variant === 'arrived' ? (
            <RiderStoreWaitBadge
              anchorAt={storeWaitAnchorAt}
              live={storeWaitLive}
              finalizedSeconds={storeWaitFinalizedSeconds}
            />
          ) : null}
          {isTerminalVariant ? (
            <p className="mt-1 text-xs text-gray-600">
              {variant === 'delivered' ? (
                <>
                  Delivered by <span className="font-semibold text-gray-800">{riderName}</span>
                </>
              ) : variant === 'cancelled' ? (
                riderName ? (
                  <>
                    Assigned rider: <span className="font-semibold text-gray-800">{riderName}</span>
                  </>
                ) : (
                  'This order was cancelled before delivery.'
                )
              ) : riderName ? (
                <>
                  Rider: <span className="font-semibold text-gray-800">{riderName}</span>
                </>
              ) : null}
            </p>
          ) : null}
          {(variant === 'picked_up' || (isTerminalVariant && riderPhone)) && riderPhone ? (
            <p className="mt-1 text-xs text-gray-600 tabular-nums">{riderPhone}</p>
          ) : null}
        </div>
      </div>

      {showActions || showLogControl ? (
        <div className="flex flex-col gap-2 border-t border-gray-100 px-3 py-2.5">
          {showActions ? (
            <div className="flex gap-2">
              {showTrackLive ? (
                <button
                  type="button"
                  onClick={onTrackRider}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
                >
                  <MapPin size={14} aria-hidden />
                  Track live
                </button>
              ) : null}
              {riderPhone ? (
                <a
                  href={`tel:${riderPhone}`}
                  onClick={(e) => {
                    if (onCallRider) {
                      e.preventDefault();
                      onCallRider();
                    }
                  }}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-800 hover:bg-gray-50"
                >
                  <Phone size={14} aria-hidden />
                  Call
                </a>
              ) : null}
            </div>
          ) : null}
          {showLogControl ? (
            <button
              type="button"
              onClick={onViewOldRidersLog}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800 hover:bg-teal-100"
              aria-label="View old rider's log"
            >
              <History size={14} aria-hidden />
              View Old Rider&apos;s Log
            </button>
          ) : null}
        </div>
      ) : null}

      {variant === 'picked_up' && deliveryLabel ? (
        <div className="border-t border-gray-100 px-3 py-3">
          <p className="mb-1.5 text-xs font-medium text-gray-700">{deliveryLabel}</p>
          <div className="h-2 overflow-hidden rounded-full bg-teal-100">
            <div
              className="h-full rounded-full bg-teal-500 transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(8, progressPercent))}%` }}
            />
          </div>
        </div>
      ) : null}

      {variant === 'picked_up' && onUniformFeedback ? (
        <div className="border-t border-gray-100 px-3 py-3">
          <p className="mb-2 text-sm text-gray-800">Was {riderName} in uniform?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onUniformFeedback(false)}
              className={`flex-1 rounded-lg border-2 py-2 text-sm font-semibold ${
                uniformFeedback === false
                  ? 'border-red-500 bg-red-50 text-red-700'
                  : 'border-red-300 bg-white text-red-600 hover:bg-red-50'
              }`}
            >
              No
            </button>
            <button
              type="button"
              onClick={() => onUniformFeedback(true)}
              className={`flex-1 rounded-lg border-2 py-2 text-sm font-semibold ${
                uniformFeedback === true
                  ? 'border-green-600 bg-green-50 text-green-700'
                  : 'border-green-400 bg-white text-green-600 hover:bg-green-50'
              }`}
            >
              Yes
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
