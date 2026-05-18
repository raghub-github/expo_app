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
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-slate-200 px-3 py-2">
      <OtpRowInner label={label} code={code} compact={compact} />
      {verified ? <span className="text-green-600 text-xs font-semibold">Verified</span> : null}
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
    <div className="min-w-0">
      <p className="text-[10px] font-medium text-slate-500">{label}</p>
      <p className={`font-mono font-bold text-slate-900 tracking-widest ${compact ? 'text-base' : 'text-lg'}`}>
        {code}
      </p>
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

  const pad = compact ? 'p-2' : 'p-3';

  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50/80 ${pad}`}>
      <div className={`flex items-center gap-1.5 ${compact ? 'mb-1.5' : 'mb-2'}`}>
        <KeyRound size={compact ? 12 : 16} className="text-slate-600 shrink-0" />
        <p className={`font-semibold text-slate-700 uppercase tracking-wide ${compact ? 'text-[10px]' : 'text-xs'}`}>
          Order OTPs
        </p>
      </div>
      <div className={compact ? 'grid grid-cols-2 gap-1.5' : 'space-y-2'}>
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
