"use client";

import React from "react";

export type DashboardLoginTab = "google" | "email";

interface LoginToggleProps {
  value: DashboardLoginTab;
  onChange: (value: DashboardLoginTab) => void;
  disabled?: boolean;
}

const options: { value: DashboardLoginTab; label: string }[] = [
  { value: "google", label: "Google Sign-in" },
  { value: "email", label: "Email OTP" },
];

export function LoginToggle({ value, onChange, disabled }: LoginToggleProps) {
  const index = options.findIndex((o) => o.value === value);
  return (
    <div
      role="tablist"
      aria-label="Login method"
      className="relative flex rounded-lg bg-slate-100 p-1"
    >
      <div
        className="absolute top-1 left-1 bottom-1 w-[calc(50%-4px)] rounded-md bg-white shadow-sm transition-transform duration-300 ease-out"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={`relative z-10 flex-1 rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00A88F]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
            value === opt.value ? "text-slate-900" : "text-slate-500"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
