"use client";

import { GatiSpinner } from "@/components/ui/GatiSpinner";

type DashboardPageLoaderProps = {
  className?: string;
  backgroundClassName?: string;
};

/** Full-page GM spinner — matches dashboard home initial load. */
export function DashboardPageLoader({
  className = "",
  backgroundClassName = "bg-white",
}: DashboardPageLoaderProps) {
  return (
    <div
      className={`absolute inset-0 z-[90] flex flex-1 items-center justify-center min-h-[200px] ${backgroundClassName} ${className}`}
      aria-busy
      aria-label="Loading"
    >
      <GatiSpinner />
    </div>
  );
}

/** Inline centered GM spinner for client pages (tables, search results, etc.). */
export function DashboardCenterSpinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex min-h-[240px] w-full flex-1 items-center justify-center ${className}`}
      aria-busy
      aria-label="Loading"
    >
      <GatiSpinner />
    </div>
  );
}
