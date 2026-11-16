"use client";

import React from "react";
import { Lock } from "lucide-react";

/**
 * Soft-blur sensitive profile blocks for store STAFF (still visible as a locked section).
 */
export function StaffSensitiveBlur({
  locked,
  title = "Owner access only",
  message = "This section is hidden for staff.",
  children,
  className = "",
}: {
  locked: boolean;
  title?: string;
  message?: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (!locked) return <>{children}</>;

  return (
    <div className={`relative overflow-hidden rounded-lg ${className}`}>
      <div className="select-none blur-[6px] pointer-events-none opacity-60" aria-hidden>
        {children}
      </div>
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/55 backdrop-blur-[1px]">
        <div className="mx-3 flex max-w-[240px] flex-col items-center gap-1.5 rounded-lg border border-gray-200 bg-white/95 px-3 py-2.5 text-center shadow-sm">
          <Lock className="h-4 w-4 text-gray-600" aria-hidden />
          <p className="text-xs font-semibold text-gray-900">{title}</p>
          <p className="text-[11px] leading-snug text-gray-500">{message}</p>
        </div>
      </div>
    </div>
  );
}
