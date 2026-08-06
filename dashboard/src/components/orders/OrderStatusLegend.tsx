"use client";

/** Delayed table row background (ETA breached). */
export const DELAYED_ROW_BG = "#FEE2E2";
/** Delayed legend dot — darker than row fill so it stays visible. */
const DELAYED_SWATCH = "#EF4444";

/**
 * Actionable order-id badge colors (Food Orders `ORDER_TAG_*`).
 * Do not apply these as full-row backgrounds.
 */
export const ACTIONABLE_ROW_BG = "#ECF8F3";
export const ACTIONABLE_SWATCH = "#2F8F6F";

/**
 * Compact inline legend for the Food Orders toolbar middle slot.
 * Dot + label only (no pill / no background box).
 */
export function OrderStatusLegend({
  className = "",
  compact = false,
}: {
  className?: string;
  /** Single-row chips for toolbar middle (no card chrome). */
  compact?: boolean;
}) {
  const items = [
    { label: "Delayed", swatch: DELAYED_SWATCH },
    { label: "Actionable", swatch: ACTIONABLE_SWATCH },
  ] as const;

  if (compact) {
    return (
      <div
        className={`flex flex-wrap items-center justify-center gap-4 ${className}`}
        role="region"
        aria-label="Order status legend"
      >
        {items.map((item) => (
          <span
            key={item.label}
            className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-800"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: item.swatch }}
              aria-hidden
            />
            {item.label}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-4 ${className}`}
      role="region"
      aria-label="Order status legend"
    >
      {items.map((item) => (
        <span
          key={item.label}
          className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-800"
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: item.swatch }}
            aria-hidden
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}
