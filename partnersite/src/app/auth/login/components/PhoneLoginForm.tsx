'use client';

import { Loader2, MessageSquare, PencilLine, ArrowRight } from 'lucide-react';
import { PhoneNumberInput } from './PhoneNumberInput';
import { PrimaryButton } from './PrimaryButton';
import { OTPInputComponent } from './OTPInputComponent';

export interface PhoneLoginFormProps {
  phone: string;
  onPhoneChange: (value: string) => void;
  otp: string;
  onOtpChange: (value: string) => void;
  otpSent: boolean;
  loading: boolean;
  resendCooldown: number;
  onSendOtp: (e: React.FormEvent) => void;
  onOtpComplete?: (otp: string) => void;
  onResendOtp: () => void;
  onChangeNumber: () => void;
  phoneOtpEnabled: boolean;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').slice(-10);
  if (digits.length < 10) return digits;
  return `${digits.slice(0, 2)}******${digits.slice(-2)}`;
}

export function PhoneLoginForm({
  phone,
  onPhoneChange,
  otp,
  onOtpChange,
  otpSent,
  loading,
  resendCooldown,
  onSendOtp,
  onOtpComplete,
  onResendOtp,
  onChangeNumber,
  phoneOtpEnabled,
}: PhoneLoginFormProps) {
  if (!phoneOtpEnabled) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center">
        <p className="text-sm text-slate-600">
          Phone login is not enabled. Please use Google Sign-in.
        </p>
      </div>
    );
  }

  const phoneDigits = phone.replace(/\D/g, '').slice(0, 10);

  if (!otpSent) {
    return (
      <form onSubmit={onSendOtp} className="space-y-5">
        <PhoneNumberInput value={phone} onChange={onPhoneChange} disabled={loading} />

        <PrimaryButton
          type="submit"
          loading={loading}
          disabled={phoneDigits.length !== 10}
          className="inline-flex items-center justify-center gap-2"
        >
          {!loading && (
            <>
              Send OTP
              <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </PrimaryButton>
      </form>
    );
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
      <div className="rounded-xl border border-orange-100 bg-orange-50/60 px-4 py-3.5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
            <MessageSquare className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800">OTP sent to +91 {maskPhone(phone)}</p>
            <p className="mt-0.5 text-xs text-slate-500">Enter the 6-digit code</p>
          </div>
          <button
            type="button"
            onClick={onChangeNumber}
            disabled={loading}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700 disabled:opacity-50"
          >
            <PencilLine className="h-3.5 w-3.5" aria-hidden />
            Edit
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-center text-sm font-medium text-slate-700">Enter OTP</p>
        <OTPInputComponent
          value={otp}
          onChange={onOtpChange}
          disabled={loading}
          onComplete={loading ? undefined : onOtpComplete}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-orange-50 py-3.5 text-sm font-medium text-orange-700">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Verifying OTP…
        </div>
      ) : null}

      <p className="text-center text-sm text-slate-600">
        Didn&apos;t receive the code?{' '}
        {resendCooldown > 0 ? (
          <span className="text-slate-500">Resend in {resendCooldown}s</span>
        ) : (
          <button
            type="button"
            onClick={onResendOtp}
            disabled={loading}
            className="font-semibold text-orange-600 hover:text-orange-700 hover:underline disabled:opacity-50"
          >
            Resend OTP
          </button>
        )}
      </p>
    </form>
  );
}
