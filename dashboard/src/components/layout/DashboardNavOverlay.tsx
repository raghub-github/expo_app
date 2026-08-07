"use client";

import { GatiSpinner } from "@/components/ui/GatiSpinner";
import { getSectionSkeletonForHref } from "@/components/skeletons/SectionSkeletons";

type Props = {
  visible: boolean;
  /** When "main", overlay covers only the scrollable workspace (sidebars stay visible). */
  scope?: "main" | "workspace";
  /** Legacy workspace overlay: offset from left to keep the primary sidebar visible. */
  leftOffsetClass?: string;
  /** In-flight navigation target — show a section skeleton instead of a blank overlay. */
  pendingHref?: string | null;
};

export function DashboardNavOverlay({
  visible,
  scope = "main",
  leftOffsetClass = "",
  pendingHref = null,
}: Props) {
  if (!visible) return null;

  const skeleton = pendingHref ? getSectionSkeletonForHref(pendingHref) : null;

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
      {skeleton ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{skeleton}</div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center bg-[#F3F7FA]">
          <GatiSpinner />
        </div>
      )}
    </div>
  );
}
