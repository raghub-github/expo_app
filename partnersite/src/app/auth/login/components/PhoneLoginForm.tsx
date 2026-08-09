'use client';

import { ArrowRight } from 'lucide-react';
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
  onVerifyOtp: (e: React.FormEvent) => void;
  onOtpComplete?: (otp: string) => void;
  onResendOtp: () => void;
  onChangeNumber: () => void;
  phoneOtpEnabled: boolean;
}

const OTP_LABEL_CLASS = 'block text-center text-sm font-semibold text-slate-800 mb-3';

const SECONDARY_BTN =
  'py-2.5 px-4 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

export function PhoneLoginForm({
  phone,
  onPhoneChange,
  otp,
  onOtpChange,
  otpSent,
  loading,
  resendCooldown,
  onSendOtp,
  onVerifyOtp,
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
    <form onSubmit={onVerifyOtp} className="space-y-4">
      <div id="otp-input-section" className="scroll-mt-4">
        <label className={OTP_LABEL_CLASS}>Mobile OTP</label>
        <OTPInputComponent
          value={otp}
          onChange={onOtpChange}
          disabled={loading}
          onComplete={loading ? undefined : onOtpComplete}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onChangeNumber}
          disabled={loading}
          className={SECONDARY_BTN}
        >
          Change number
        </button>
        <PrimaryButton
          type="submit"
          loading={loading}
          disabled={otp.replace(/\D/g, '').length < 6}
          className="flex-1 min-w-[140px]"
        >
          Verify &amp; continue
        </PrimaryButton>
      </div>

      <p className="text-sm text-slate-600 text-center">
        Didn&apos;t receive OTP?{' '}
        {resendCooldown > 0 ? (
          <span className="text-slate-500">Resend SMS in {resendCooldown}s</span>
        ) : (
          <button
            type="button"
            onClick={onResendOtp}
            disabled={loading}
            className="font-medium text-[#00A88F] hover:text-[#009078] hover:underline disabled:opacity-50"
          >
            Resend SMS
          </button>
        )}
      </p>
    </form>
  );
}
