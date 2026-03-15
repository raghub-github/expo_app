'use client';

import React from 'react';

interface LoginInputFieldProps {
  type: 'tel' | 'email' | 'text' | 'password';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  helperText?: string;
  icon: React.ReactNode;
  maxLength?: number;
  inputMode?: 'numeric' | 'email' | 'text';
  autoComplete?: string;
  id?: string;
  disabled?: boolean;
}

export function LoginInputField({
  type,
  value,
  onChange,
  placeholder,
  label,
  helperText,
  icon,
  maxLength,
  inputMode,
  autoComplete,
  id,
  disabled = false,
}: LoginInputFieldProps) {
  const fieldId = id ?? `login-field-${type}-${label?.replace(/\s/g, '-') ?? 'input'}`;
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={fieldId} className="block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <div className="relative group">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none transition-colors duration-200 group-focus-within:text-orange-500">
          {icon}
        </span>
        <input
          id={fieldId}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          inputMode={inputMode}
          autoComplete={autoComplete}
          disabled={disabled}
          className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 placeholder:text-slate-400 text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:ring-offset-2 focus:border-orange-400 focus:bg-white hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>
      {helperText && (
        <p className="text-xs text-slate-500">{helperText}</p>
      )}
    </div>
  );
}
