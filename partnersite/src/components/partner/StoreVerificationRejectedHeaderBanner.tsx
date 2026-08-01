"use client";

type Props = {
  /** Small pill, e.g. "Few onboarding details Rejected" */
  badgeLabel?: string;
  /** Main heading under the badge (wraps on its own line) */
  title?: string;
  /** Primary line in the middle column */
  primaryMessage?: string;
  /** Secondary / supporting line under primary */
  secondaryMessage?: string;
  /** CTA button label */
  ctaLabel?: string;
  onFix: () => void;
  className?: string;
};

/**
 * Compact alert row when store onboarding has open rejections.
 * Badge + title stack vertically (not one truncated row).
 */
export function StoreVerificationRejectedHeaderBanner({
  badgeLabel = "Few onboarding details Rejected",
  title = "Please review & fix your onboarding",
  primaryMessage = "Update the rejected steps so we can verify your store.",
  secondaryMessage = "Complete onboarding is mandatory to keep your store active on GatiMitra.",
  ctaLabel = "Fix onboarding details",
  onFix,
  className = "",
}: Props) {
  return (
    <div className={`w-full ${className}`}>
      <div
        className="relative overflow-hidden rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 shadow-sm"
        style={{ backgroundColor: "#0f3d3e" }}
        role="alert"
      >
        <svg
          className="pointer-events-none absolute inset-y-0 right-0 h-full w-[36%] opacity-[0.14]"
          viewBox="0 0 240 80"
          fill="none"
          aria-hidden
        >
          <path d="M40 70 L120 8 L200 70 Z" stroke="#5eead4" strokeWidth="1.2" />
          <path d="M70 70 L150 14 L230 70 Z" stroke="#99f6e4" strokeWidth="1" />
        </svg>

        <div className="relative flex items-center gap-3 sm:gap-4 min-w-0">
          {/* Left: badge above title — wrapped, not one line */}
          <div className="min-w-0 flex-1 flex flex-col items-start gap-1 overflow-hidden">
            <span
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold whitespace-nowrap"
              style={{ backgroundColor: "#fecaca", color: "#9f1239" }}
            >
              <span className="relative inline-flex h-1.5 w-1.5" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" />
              </span>
              {badgeLabel}
            </span>
            <p className="text-sm sm:text-[15px] font-bold text-white tracking-tight leading-snug">
              {title}
            </p>
          </div>

          <div className="hidden md:block h-10 w-px shrink-0 bg-white/20" aria-hidden />

          {/* Middle */}
          <div className="hidden md:block min-w-0 flex-[1.2] overflow-hidden">
            <p className="truncate text-sm font-medium text-white whitespace-nowrap">
              {primaryMessage}
            </p>
            <p className="truncate text-[11px] text-teal-100/85 whitespace-nowrap">
              {secondaryMessage}
            </p>
          </div>

          {/* CTA */}
          <div className="shrink-0 self-center">
            <button
              type="button"
              onClick={onFix}
              className="inline-flex items-center justify-center rounded-md px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-bold text-white shadow-sm transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f3d3e] whitespace-nowrap"
              style={{ backgroundColor: "#ea580c" }}
            >
              {ctaLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
