"use client";

import { GatiSpinner } from "@/components/ui/GatiSpinner";

type Props = {
  visible: boolean;
  /** Offset from left to keep the primary sidebar visible. */
  leftOffsetClass: string;
};

export function DashboardNavOverlay({ visible, leftOffsetClass }: Props) {
  if (!visible) return null;

  return (
    <div
      className={`pointer-events-auto fixed inset-y-0 right-0 z-[70] flex flex-col items-center justify-center bg-white/98 backdrop-blur-[2px] ${leftOffsetClass}`}
      aria-busy
      aria-live="polite"
      aria-label="Loading module"
    >
      <GatiSpinner />
    </div>
  );
}
