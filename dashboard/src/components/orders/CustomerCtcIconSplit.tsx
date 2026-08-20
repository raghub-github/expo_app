/**
 * Compact CTC split row — icons only (no Cashin / GatiCash text labels).
 */

import type { ReactNode } from "react";

type Props = {
  cashin: number;
  gatiCashUsed: number;
  formatCurrency: (n: number | null | undefined) => string;
  className?: string;
  /** When true, never wrap (main payment card). Modal keeps default wrap. */
  nowrap?: boolean;
};

/** 💳 cashin  +  🪙 GatiCash — always both, ₹0.00 when unused. */
export function CustomerCtcIconSplit({
  cashin,
  gatiCashUsed,
  formatCurrency,
  className = "",
  nowrap = false,
}: Props): ReactNode {
  const card = Number.isFinite(cashin) ? Math.max(0, cashin) : 0;
  const coins = Number.isFinite(gatiCashUsed) ? Math.max(0, gatiCashUsed) : 0;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 tabular-nums ${
        nowrap ? "flex-nowrap whitespace-nowrap shrink-0" : "flex-wrap"
      } ${className}`}
      title="Cash / card + GatiCash"
    >
      <span className="inline-flex items-center gap-1 shrink-0">
        <i className="bi bi-credit-card-2-front text-[12px] text-slate-500" aria-hidden />
        <span className="orders-num">{formatCurrency(card)}</span>
      </span>
      <span className="text-slate-400 font-semibold shrink-0" aria-hidden>
        +
      </span>
      <span className="inline-flex items-center gap-1 shrink-0">
        <i className="bi bi-coin text-[12px] text-amber-600" aria-hidden />
        <span className="orders-num">{formatCurrency(coins)}</span>
      </span>
    </span>
  );
}
