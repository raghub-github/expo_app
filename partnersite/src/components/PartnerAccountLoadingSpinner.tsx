"use client";

import { Store } from "lucide-react";

/** Two opposite-direction gradient rings with a store icon in the center. */
export function PartnerAccountLoadingSpinner({
  size = "md",
  label = "Loading your account...",
}: {
  size?: "sm" | "md";
  label?: string;
}) {
  return (
    <div className="text-center space-y-5">
      <div
        className={size === "sm" ? "partner-dual-spinner partner-dual-spinner--sm" : "partner-dual-spinner"}
        role="status"
        aria-label={label}
      >
        <div className="partner-dual-spinner__ring" aria-hidden />
        <div className="partner-dual-spinner__ring partner-dual-spinner__ring--rev" aria-hidden />
        <div className="partner-dual-spinner__core">
          <div
            className={`flex items-center justify-center rounded-full bg-blue-50 shadow-sm ring-1 ring-blue-100 ${
              size === "sm" ? "h-12 w-12" : "h-14 w-14"
            }`}
          >
            <Store className={size === "sm" ? "h-6 w-6 text-blue-600" : "h-7 w-7 text-blue-600"} aria-hidden />
          </div>
        </div>
      </div>
      {label ? <p className="text-sm font-medium text-slate-700">{label}</p> : null}
    </div>
  );
}
