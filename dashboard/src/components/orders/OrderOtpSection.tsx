'use client';

import { KeyRound } from 'lucide-react';
import type { OrderOtpBundle } from '@/lib/orderOtps';
import { formatRtoOtpDisplay, shouldShowPickupOtp, shouldShowRtoOtp } from '@/lib/orderOtps';

export type OrderOtpSectionProps = {
  status: string;
  otps: OrderOtpBundle;
  pickupVerified?: boolean;
  rtoVerified?: boolean;
  compact?: boolean;
};

function OtpRow({
  label,
  code,
  verified,
  compact,
}: {
  label: string;
  code: string;
  verified?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden rounded-md border border-slate-200 bg-white px-2 py-1">
      <OtpRowInner label={label} code={code} compact={compact} />
      {verified ? (
        <span className="shrink-0 text-[10px] font-semibold text-green-600 whitespace-nowrap">
          Verified
        </span>
      ) : null}
    </div>
  );
}

function OtpRowInner({
  label,
  code,
  compact,
}: {
  label: string;
  code: string;
  compact?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden whitespace-nowrap">
      <span className="shrink-0 text-[10px] font-medium text-slate-500">{label}</span>
      <span
        className={`min-w-0 truncate font-mono font-bold tabular-nums tracking-wide text-slate-900 ${
          compact ? 'text-sm' : 'text-base'
        }`}
      >
        {code}
      </span>
    </div>
  );
}

export function OrderOtpSection({
  status,
  otps,
  pickupVerified,
  rtoVerified,
  compact,
}: OrderOtpSectionProps) {
  const showPickup = shouldShowPickupOtp(status, otps.pickup);
  const showRto = shouldShowRtoOtp(status, otps.rto);
  if (!showPickup && !showRto) return null;

  const pad = compact ? 'p-2' : 'p-2.5';

  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50/80 ${pad}`}>
      <div className={`flex items-center gap-1 ${compact ? 'mb-1' : 'mb-1.5'}`}>
        <KeyRound size={compact ? 12 : 14} className="text-slate-600 shrink-0" />
        <p className={`font-semibold text-slate-700 uppercase tracking-wide ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
          Order OTPs
        </p>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {showPickup && otps.pickup ? (
          <OtpRow label="Pickup OTP" code={otps.pickup} verified={pickupVerified} compact={compact} />
        ) : null}
        {showRto && otps.rto ? (
          <OtpRow
            label="RTO OTP"
            code={formatRtoOtpDisplay(status, otps.rto) ?? 'XXXX'}
            verified={rtoVerified && status.toUpperCase() === 'RTO'}
            compact={compact}
          />
        ) : null}
      </div>
    </div>
  );
}
