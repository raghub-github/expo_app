'use client';

import { useState, type ReactNode } from 'react';
import { Bike, MapPin, Phone } from 'lucide-react';

export type RiderDeliveryPartnerCardProps = {
  riderName: string;
  riderPhone?: string | null;
  riderSelfieUrl?: string | null;
  variant: 'arrived' | 'picked_up';
  pickupOtp?: string | null;
  rtoDisplay?: string | null;
  legacyOtp?: string | null;
  legacyOtpType?: string | null;
  deliveryLabel?: string | null;
  progressPercent?: number;
  onCallRider?: () => void;
  onTrackRider?: () => void;
  onUniformFeedback?: (inUniform: boolean) => void;
  uniformFeedback?: boolean | null;
  showHeader?: boolean;
  className?: string;
};

function RiderAvatar({ selfieUrl, name }: { selfieUrl?: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(selfieUrl?.trim()) && !failed;

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-gray-100 shadow-sm ring-1 ring-gray-200">
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={selfieUrl!}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Bike size={18} className="text-gray-500" aria-hidden />
      )}
    </div>
  );
}

export function RiderDeliveryPartnerCard({
  riderName,
  riderPhone,
  riderSelfieUrl,
  variant,
  pickupOtp,
  rtoDisplay,
  legacyOtp,
  legacyOtpType,
  deliveryLabel,
  progressPercent = 66,
  onCallRider,
  onTrackRider,
  onUniformFeedback,
  uniformFeedback,
  showHeader = true,
  className = '',
}: RiderDeliveryPartnerCardProps) {
  const headline =
    variant === 'picked_up'
      ? `${riderName} has picked up your order`
      : `${riderName} has arrived`;

  const metaParts: ReactNode[] = [];
  if (variant === 'arrived') {
    if (riderPhone) {
      metaParts.push(
        <span key="phone" className="font-semibold tabular-nums text-gray-800">
          {riderPhone}
        </span>
      );
    }
    if (pickupOtp) {
      if (metaParts.length) metaParts.push(<span key="s1" className="text-gray-300">|</span>);
      metaParts.push(
        <span key="pickup" className="font-mono font-bold text-gray-900">
          Pickup: {pickupOtp}
        </span>
      );
    }
    if (rtoDisplay) {
      if (metaParts.length) metaParts.push(<span key="s2" className="text-gray-300">|</span>);
      metaParts.push(
        <span key="rto" className="font-mono font-bold text-orange-800">
          RTO: {rtoDisplay}
        </span>
      );
    }
    if (!pickupOtp && !rtoDisplay && legacyOtp) {
      if (metaParts.length) metaParts.push(<span key="s3" className="text-gray-300">|</span>);
      metaParts.push(
        <span key="otp" className="font-mono font-bold text-gray-900">
          OTP: {legacyOtp}
          {legacyOtpType ? <span className="text-gray-500"> ({legacyOtpType})</span> : null}
        </span>
      );
    }
  }

  return (
    <div
      className={`overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm ${className}`}
    >
      {showHeader ? (
        <div className="border-b border-gray-100 bg-gradient-to-b from-slate-50 to-white px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Delivery partner
          </p>
        </div>
      ) : null}

      <div className="flex items-start gap-3 p-3">
        <RiderAvatar selfieUrl={riderSelfieUrl} name={riderName} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-gray-900">{headline}</p>
          {variant === 'picked_up' ? (
            <div className="mt-1.5">
              {riderPhone ? (
                <a
                  href={`tel:${riderPhone}`}
                  onClick={(e) => {
                    if (onCallRider) {
                      e.preventDefault();
                      onCallRider();
                    }
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
                >
                  <Phone size={13} aria-hidden />
                  Call
                </a>
              ) : null}
              {onTrackRider ? (
                <button
                  type="button"
                  onClick={onTrackRider}
                  className={`inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline ${riderPhone ? 'ml-3' : ''}`}
                >
                  <MapPin size={12} aria-hidden />
                  Track location
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {metaParts.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  {metaParts}
                </div>
              ) : null}
              {onTrackRider ? (
                <button
                  type="button"
                  onClick={onTrackRider}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
                >
                  <MapPin size={12} aria-hidden />
                  Track location
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

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
