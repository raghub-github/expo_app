"use client";

import { Loader2 } from "lucide-react";

function formatInrShort(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded)
    ? rounded.toLocaleString("en-IN")
    : rounded.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function meetsMin(current: number, minAmount: number): boolean {
  return Math.round(current * 100) >= Math.round(minAmount * 100);
}

type Props = {
  current: number;
  minAmount: number;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  labelReady?: string;
  className?: string;
  compact?: boolean;
};

/**
 * Withdraw CTA with left→right progress fill toward the min threshold.
 * Solid full color once `current >= minAmount` (no partial overlay).
 */
export function WithdrawProgressButton({
  current,
  minAmount,
  onClick,
  disabled = false,
  loading = false,
  labelReady = "Withdraw",
  className = "",
  compact = false,
}: Props) {
  const min = Math.max(0, minAmount);
  const value = Math.max(0, Number.isFinite(current) ? current : 0);
  const met = min <= 0 || meetsMin(value, min);
  const progress = met || min <= 0 ? 1 : Math.min(1, value / min);
  const shortfall = Math.max(0, Math.round((min - value) * 100) / 100);
  const isDisabled = disabled || loading || !met;

  const label = loading
    ? null
    : met
      ? labelReady
      : compact
        ? `Min ₹${formatInrShort(min)}`
        : shortfall > 0 && shortfall < min
          ? `Min ₹${formatInrShort(min)} · ₹${formatInrShort(shortfall)} more`
          : `Min ₹${formatInrShort(min)}`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      className={[
        "relative overflow-hidden font-semibold text-white disabled:cursor-not-allowed",
        compact
          ? "inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-sm min-w-[7.5rem]"
          : "w-full py-3 text-sm rounded-xl flex items-center justify-center gap-2",
        met ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-300",
        className,
      ].join(" ")}
    >
      {!met ? (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 pointer-events-none transition-[width] duration-200 ease-out bg-emerald-600"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      ) : null}
      <span className="relative z-10 inline-flex items-center justify-center gap-2">
        {loading ? (
          <>
            <Loader2 size={compact ? 14 : 18} className="animate-spin" />
            {!compact ? <span>Processing…</span> : null}
          </>
        ) : (
          <span className="truncate max-w-full">{label}</span>
        )}
      </span>
    </button>
  );
}
