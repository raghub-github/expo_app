'use client';

import { ClipboardList, KeyRound } from 'lucide-react';
import type { OrderOtpBundle } from '@/lib/orderOtps';
import {
  formatPickupOtpForMerchantDisplay,
  formatRtoOtpDisplay,
  shouldShowPickupOtp,
  shouldShowRtoOtp,
} from '@/lib/orderOtps';

export type OrderOtpSectionProps = {
  status: string;
  otps: OrderOtpBundle;
  pickupVerified?: boolean;
  rtoVerified?: boolean;
  compact?: boolean;
  /** Self-pickup: mask code — customer shares OTP at the counter. */
  selfPickup?: boolean;
  /** From DB merchant_instructions_list (kitchen notes, cutlery choice, etc.). */
  merchantInstructions?: string[] | null;
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
  selfPickup,
  merchantInstructions,
}: OrderOtpSectionProps) {
  const showPickup = shouldShowPickupOtp(status, otps.pickup, { selfPickup });
  const showRto = shouldShowRtoOtp(status, otps.rto);
  const instructions = (merchantInstructions ?? []).filter((s) => s.trim().length > 0);
  const showInstructions = instructions.length > 0;
  if (!showPickup && !showRto && !showInstructions) return null;

  const pad = compact ? 'p-2' : 'p-3';
  const hasOtps = showPickup || showRto;
  const pickupDisplay = formatPickupOtpForMerchantDisplay(otps.pickup, { selfPickup });

  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50/80 ${pad}`}>
      {hasOtps ? (
        <>
          <div className={`flex items-center gap-1.5 ${compact ? 'mb-1.5' : 'mb-2'}`}>
            <KeyRound size={compact ? 12 : 16} className="text-slate-600 shrink-0" />
            <p
              className={`font-semibold text-slate-700 uppercase tracking-wide ${compact ? 'text-[10px]' : 'text-xs'}`}
            >
              Order OTPs
            </p>
          </div>
          <div className={compact ? 'grid grid-cols-2 gap-1.5' : 'space-y-2'}>
            {showPickup && pickupDisplay ? (
              <OtpRow
                label="Pickup OTP"
                code={pickupDisplay}
                verified={pickupVerified}
                compact={compact}
              />
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
        </>
      ) : null}

      {showInstructions ? (
        <div className={hasOtps ? (compact ? 'mt-1.5 pt-1.5 border-t border-slate-200' : 'mt-2 pt-2 border-t border-slate-200') : ''}>
          <div className={`flex items-center gap-1 ${compact ? 'mb-0.5' : 'mb-1'}`}>
            <ClipboardList size={compact ? 12 : 14} className="shrink-0 text-amber-700" />
            <p
              className={`font-semibold uppercase tracking-wide text-amber-900 ${compact ? 'text-[10px]' : 'text-xs'}`}
            >
              Merchant instructions
            </p>
          </div>
          <ul className={`space-y-1 ${compact ? 'text-[11px]' : 'text-xs'} text-gray-800 leading-relaxed`}>
            {instructions.map((line, i) => (
              <li key={`${i}-${line}`} className="break-words">
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
