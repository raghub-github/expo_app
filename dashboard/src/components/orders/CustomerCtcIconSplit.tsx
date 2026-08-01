/**
 * Compact CTC split row — icons only (no Cashin / GatiCash text labels).
 */

import type { ReactNode } from "react";

type Props = {
  cashin: number;
  gatiCashUsed: number;
  formatCurrency: (n: number | null | undefined) => string;
  className?: string;
};

/** 💳 cashin  +  🪙 GatiCash — compact second line under CTC total. */
export function CustomerCtcIconSplit({
  cashin,
  gatiCashUsed,
  formatCurrency,
  className = "",
}: Props): ReactNode {
  if (!(gatiCashUsed > 0.005)) return null;
  return (
    <span
      className={`inline-flex flex-nowrap items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-slate-600 tabular-nums ${className}`}
      title="Cash / card + GatiCash"
    >
      <span className="inline-flex items-center gap-1">
        <i className="bi bi-credit-card-2-front text-[12px] text-slate-500" aria-hidden />
        <span className="orders-num">{formatCurrency(cashin)}</span>
      </span>
      <span className="text-slate-400 font-semibold" aria-hidden>
        +
      </span>
      <span className="inline-flex items-center gap-1">
        <i className="bi bi-coin text-[12px] text-amber-600" aria-hidden />
        <span className="orders-num">{formatCurrency(gatiCashUsed)}</span>
      </span>
    </span>
  );
}
