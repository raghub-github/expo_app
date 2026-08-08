'use client';

import React, { useRef, useCallback } from 'react';

interface OTPInputComponentProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  length?: number;
  /** Called when all digits are entered (e.g. to auto-submit) */
  onComplete?: (otp: string) => void;
}

export function OTPInputComponent({
  value,
  onChange,
  disabled = false,
  length = 6,
  onComplete,
}: OTPInputComponentProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.replace(/\D/g, '').slice(0, length).split('');
  while (digits.length < length) digits.push('');

  const setOtp = useCallback(
    (newDigits: string[]) => {
      const joined = newDigits.join('').slice(0, length);
      onChange(joined);
      if (joined.length === length && onComplete) onComplete(joined);
    },
    [onChange, onComplete, length]
  );

  const focusAt = useCallback((index: number) => {
    const i = Math.max(0, Math.min(index, length - 1));
    inputRefs.current[i]?.focus();
  }, [length]);

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      setOtp(next);
      focusAt(index - 1);
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      focusAt(index - 1);
      e.preventDefault();
    }
    if (e.key === 'ArrowRight' && index < length - 1) {
      focusAt(index + 1);
      e.preventDefault();
    }
  };

  const handleInput = (index: number, e: React.FormEvent<HTMLInputElement>) => {
    const input = (e.target as HTMLInputElement).value;
    const digit = input.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setOtp(next);
    if (digit) focusAt(index + 1);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    const next = pasted.split('');
    while (next.length < length) next.push('');
    setOtp(next);
    focusAt(Math.min(pasted.length, length - 1));
  };

  return (
    <div
      className={`flex gap-1.5 sm:gap-2 justify-center ${length > 6 ? 'max-w-full mx-auto' : ''}`}
      role="group"
      aria-label="OTP digits"
    >
      {digits.map((d, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={2}
          value={d}
          disabled={disabled}
          onPaste={handlePaste}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onInput={(e) => handleInput(index, e)}
          className={`text-center font-semibold rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#00A88F]/30 focus:border-[#00A88F] disabled:opacity-50 ${
            length > 6
              ? 'h-11 w-9 text-base sm:h-12 sm:w-10'
              : 'h-12 w-10 text-lg sm:h-[3.25rem] sm:w-11'
          }`}
          aria-label={`Digit ${index + 1} of ${length}`}
        />
      ))}
    </div>
  );
}
