'use client';

import React from 'react';
import { Phone } from 'lucide-react';
import { LoginInputField } from './LoginInputField';
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
  onResendOtp: () => void;
  onChangeNumber: () => void;
  phoneOtpEnabled: boolean;
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
  onVerifyOtp,
  onResendOtp,
  onChangeNumber,
  phoneOtpEnabled,
}: PhoneLoginFormProps) {
  if (!phoneOtpEnabled) {
    return (
      <p className="text-sm text-slate-600 py-6 text-center">
        Phone login is not enabled. Please use Google Sign-in.
      </p>
    );
  }

  if (!otpSent) {
    return (
      <form onSubmit={onSendOtp} className="space-y-4">
        <LoginInputField
          type="tel"
          value={phone}
          onChange={(v) => onPhoneChange(v.replace(/\D/g, '').slice(0, 10))}
          placeholder="9876543210"
          label="Mobile number"
          helperText="We'll send a 6-digit OTP via SMS."
          icon={<Phone className="w-5 h-5" />}
          maxLength={10}
          inputMode="numeric"
        />
        <PrimaryButton
          type="submit"
          loading={loading}
          disabled={phone.replace(/\D/g, '').length !== 10}
        >
          Send OTP
        </PrimaryButton>
      </form>
    );
  }

  return (
    <form onSubmit={onVerifyOtp} className="space-y-5">
      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700">
        OTP sent to <strong>+91 {phone.replace(/\D/g, '').slice(-10)}</strong>. Enter the 6-digit code.
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2 text-center">
          Enter OTP
        </label>
        <OTPInputComponent
          value={otp}
          onChange={onOtpChange}
          disabled={loading}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onChangeNumber}
          className="py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          Change number
        </button>
        <PrimaryButton type="submit" loading={loading} disabled={otp.replace(/\D/g, '').length < 6}>
          Verify OTP
        </PrimaryButton>
      </div>
      <p className="text-sm text-slate-600 text-center">
        Didn&apos;t receive OTP?{' '}
        {resendCooldown > 0 ? (
          <span className="text-slate-500">Resend OTP in {resendCooldown}s</span>
        ) : (
          <button
            type="button"
            onClick={onResendOtp}
            disabled={loading}
            className="text-orange-600 hover:underline font-medium disabled:opacity-50"
          >
            Resend OTP
          </button>
        )}
      </p>
    </form>
  );
}
