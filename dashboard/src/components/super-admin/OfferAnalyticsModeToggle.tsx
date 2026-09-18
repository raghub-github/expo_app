"use client";

import Link from "next/link";

export type OfferAnalyticsMode = "normal" | "flash";

export function OfferAnalyticsModeToggle({ mode }: { mode: OfferAnalyticsMode }) {
  return (
    <div
      className="inline-flex rounded-lg border border-slate-200 bg-slate-100/80 p-0.5 shadow-sm"
      role="tablist"
      aria-label="Offer analytics mode"
    >
      <Link
        href="/dashboard/super-admin/offers-coupons/analytics"
        role="tab"
        aria-selected={mode === "normal"}
        className={
          mode === "normal"
            ? "rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm"
            : "rounded-md px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
        }
      >
        NORMAL
      </Link>
      <Link
        href="/dashboard/super-admin/offers-coupons/flash-tracker"
        role="tab"
        aria-selected={mode === "flash"}
        className={
          mode === "flash"
            ? "rounded-md bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
            : "rounded-md px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
        }
      >
        FLASH
      </Link>
    </div>
  );
}
