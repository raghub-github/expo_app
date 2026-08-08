"use client";

import { DashboardPageLoader } from "@/components/ui/DashboardPageLoader";

type Props = {
  visible: boolean;
  /** When "main", overlay covers only the scrollable workspace (sidebars stay visible). */
  scope?: "main" | "workspace";
  /** Legacy workspace overlay: offset from left to keep the primary sidebar visible. */
  leftOffsetClass?: string;
  /** In-flight navigation target — kept for API compatibility; always shows GM spinner. */
  pendingHref?: string | null;
};

export function DashboardNavOverlay({
  visible,
  scope = "main",
  leftOffsetClass = "",
}: Props) {
  if (!visible) return null;

  const className =
    scope === "main"
      ? "pointer-events-auto absolute inset-0 z-[80] flex min-h-0 flex-col overflow-hidden bg-white"
      : `pointer-events-auto fixed inset-y-0 right-0 z-[70] flex min-h-0 flex-col overflow-hidden bg-white ${leftOffsetClass}`;

  return (
    <div
      className={className}
      aria-busy
      aria-live="polite"
      aria-label="Loading module"
    >
      <DashboardPageLoader className="relative inset-auto z-0 min-h-0 flex-1" />
    </div>
  );
}
