'use client';

import { Phone } from 'lucide-react';

interface PhoneNumberInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
}

export function PhoneNumberInput({
  value,
  onChange,
  disabled = false,
  id = 'login-phone',
}: PhoneNumberInputProps) {
  const digits = value.replace(/\D/g, '').slice(0, 10);

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        Mobile number
      </label>
      <div className="group flex items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white transition-all duration-200 hover:border-slate-300 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-500/25">
        <span className="flex items-center pl-3.5 text-orange-500 pointer-events-none">
          <Phone className="h-5 w-5" aria-hidden />
        </span>
        <div className="flex flex-1 items-center min-w-0 pl-2 pr-4 py-3">
          <span className="shrink-0 text-sm font-semibold text-slate-700 tabular-nums">+91</span>
          <span className="mx-3 h-5 w-px shrink-0 bg-slate-200" aria-hidden />
          <input
            id={id}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={10}
            value={digits}
            disabled={disabled}
            placeholder="Enter 10-digit number"
            onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed tabular-nums tracking-wide"
          />
        </div>
      </div>
    </div>
  );
}
