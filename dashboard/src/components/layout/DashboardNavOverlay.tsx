"use client";

import { GatiSpinner } from "@/components/ui/GatiSpinner";

type Props = {
  visible: boolean;
  /** When "main", overlay covers main content (left sidebar stays visible). */
  scope?: "main" | "workspace";
  /** Fixed left offset — keeps the hierarchical left sidebar visible under the overlay. */
  leftOffsetClass?: string;
  /** Fixed right offset — keeps the right rail visible (do not cover store/ticket nav). */
  rightOffsetClass?: string;
  /** In-flight navigation target — kept for API compatibility; always shows GM spinner. */
  pendingHref?: string | null;
};

export function DashboardNavOverlay({
  visible,
  scope = "main",
  leftOffsetClass = "left-0 lg:left-16",
  rightOffsetClass = "right-0",
}: Props) {
  if (!visible) return null;

  const className =
    scope === "main"
      ? `pointer-events-auto fixed bottom-0 top-14 z-[80] flex flex-col items-center justify-center bg-[#F3F7FA] ${leftOffsetClass} ${rightOffsetClass}`
      : `pointer-events-auto fixed inset-y-0 z-[80] flex flex-col items-center justify-center bg-[#F3F7FA] ${leftOffsetClass} ${rightOffsetClass}`;

  return (
    <div
      className={className}
      aria-busy
      aria-live="polite"
      aria-label="Loading module"
    >
      <GatiSpinner />
    </div>
  );
}
