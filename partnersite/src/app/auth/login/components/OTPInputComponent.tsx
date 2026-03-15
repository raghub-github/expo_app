'use client';

import React, { useRef, useCallback, useEffect } from 'react';

const LENGTH = 6;

interface OTPInputComponentProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Called when all 6 digits are entered (e.g. to auto-submit) */
  onComplete?: (otp: string) => void;
}

export function OTPInputComponent({
  value,
  onChange,
  disabled = false,
  onComplete,
}: OTPInputComponentProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.replace(/\D/g, '').slice(0, LENGTH).split('');
  while (digits.length < LENGTH) digits.push('');

  const setOtp = useCallback(
    (newDigits: string[]) => {
      const joined = newDigits.join('').slice(0, LENGTH);
      onChange(joined);
      if (joined.length === LENGTH && onComplete) onComplete(joined);
    },
    [onChange, onComplete]
  );

  const focusAt = useCallback((index: number) => {
    const i = Math.max(0, Math.min(index, LENGTH - 1));
    inputRefs.current[i]?.focus();
  }, []);

  useEffect(() => {
    if (value.length === LENGTH && onComplete) onComplete(value);
  }, [value, onComplete]);

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
    if (e.key === 'ArrowRight' && index < LENGTH - 1) {
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
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH);
    if (!pasted) return;
    const next = pasted.split('');
    while (next.length < LENGTH) next.push('');
    setOtp(next);
    focusAt(Math.min(pasted.length, LENGTH - 1));
  };

  return (
    <div className="flex gap-2 sm:gap-3 justify-center" role="group" aria-label="OTP digits">
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
          className="w-10 h-12 sm:w-12 sm:h-14 text-center text-lg sm:text-xl font-semibold rounded-xl border-2 border-slate-200 bg-slate-50/50 text-slate-900 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-400 focus:bg-white disabled:opacity-50"
          aria-label={`Digit ${index + 1} of 6`}
        />
      ))}
    </div>
  );
}
