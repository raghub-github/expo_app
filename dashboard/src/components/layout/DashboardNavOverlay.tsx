"use client";

import { GatiSpinner } from "@/components/ui/GatiSpinner";

type Props = {
  visible: boolean;
  /** When "main", overlay covers only the scrollable workspace (sidebars stay visible). */
  scope?: "main" | "workspace";
  /** Legacy workspace overlay: offset from left to keep the primary sidebar visible. */
  leftOffsetClass?: string;
};

export function DashboardNavOverlay({
  visible,
  scope = "main",
  leftOffsetClass = "",
}: Props) {
  if (!visible) return null;

  const className =
    scope === "main"
      ? "pointer-events-auto absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/95 backdrop-blur-[1px]"
      : `pointer-events-auto fixed inset-y-0 right-0 z-[70] flex flex-col items-center justify-center bg-white/98 backdrop-blur-[2px] ${leftOffsetClass}`;

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
