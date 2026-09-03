"use client";

import type { ReactNode } from "react";

/** Compact list chrome for All Merchants CTA / KPI inner pages. */
export function MerchantAdminListShell({
  description,
  toolbar,
  countLabel,
  children,
}: {
  description?: string;
  toolbar?: ReactNode;
  countLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      {(description || toolbar) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {description ? (
            <p className="max-w-2xl text-xs leading-relaxed text-[#121212]/55">{description}</p>
          ) : (
            <span />
          )}
          {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-[#121212]/10 bg-white shadow-[0_1px_2px_rgba(18,18,18,0.04)]">
        {countLabel ? (
          <div className="flex items-center justify-between border-b border-[#121212]/08 bg-[#F3F7FA] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#121212]/50">
              {countLabel}
            </p>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function PulseBar({ className }: { className: string }) {
  return <div className={`animate-pulse bg-[#121212]/08 ${className}`} />;
}

export function MerchantAdminStoreRowSkeletons({ rows = 8 }: { rows?: number }) {
  return (
    <div className="divide-y divide-[#121212]/06" aria-busy aria-label="Loading stores">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <PulseBar className="h-9 w-9 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <PulseBar className="h-3.5 w-[46%] max-w-[220px] rounded" />
              <PulseBar className="h-2.5 w-[32%] max-w-[140px] rounded" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <PulseBar className="h-5 w-14 rounded-full" />
            <PulseBar className="h-8 w-[88px] rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Matches ChildStoreRow list while inner merchant pages load. */
export function MerchantAdminStoreListSkeleton({
  rows = 8,
  countLabel = "Stores",
}: {
  rows?: number;
  countLabel?: string;
}) {
  return (
    <MerchantAdminListShell countLabel={countLabel}>
      <MerchantAdminStoreRowSkeletons rows={rows} />
    </MerchantAdminListShell>
  );
}

/** Matches Partners grouped list while it loads. */
export function MerchantAdminPartnerListSkeleton() {
  return (
    <MerchantAdminListShell
      description="Parent accounts and their child stores."
      countLabel="Partners"
    >
      <div className="divide-y divide-[#121212]/08" aria-busy aria-label="Loading partners">
        {[0, 1, 2].map((group) => (
          <div key={group}>
            <div className="flex items-center justify-between gap-2 border-b border-[#121212]/06 bg-[#F3F7FA]/80 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <PulseBar className="h-8 w-8 rounded-lg" />
                <div className="space-y-1.5">
                  <PulseBar className="h-3.5 w-36" />
                  <PulseBar className="h-2.5 w-24" />
                </div>
              </div>
              <PulseBar className="h-5 w-16 rounded-full" />
            </div>
            <div className="divide-y divide-[#121212]/06">
              {[0, 1].map((row) => (
                <div key={row} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <PulseBar className="h-9 w-9 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <PulseBar className="h-3.5 w-[40%] max-w-[180px]" />
                      <PulseBar className="h-2.5 w-[26%] max-w-[120px]" />
                    </div>
                  </div>
                  <PulseBar className="h-8 w-[88px] rounded-md" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </MerchantAdminListShell>
  );
}
