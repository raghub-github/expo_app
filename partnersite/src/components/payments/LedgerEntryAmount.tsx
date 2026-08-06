import { formatInr } from "@/lib/format-inr";
import type { LedgerAmountDisplay } from "@/lib/merchant-payout-utils";

type Props = {
  display: LedgerAmountDisplay;
};

export function LedgerEntryAmount({ display }: Props) {
  if (display.compensationPolicy) {
    const { orderCtm, receivedAmount } = display.compensationPolicy;
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const showStrike = round2(orderCtm) > 0 && Math.abs(round2(orderCtm) - round2(receivedAmount)) > 0.005;
    return (
      <span className="inline-flex flex-col items-end tabular-nums leading-tight whitespace-nowrap">
        {showStrike ? (
          <span className="text-xs font-medium text-gray-400 line-through">
            {formatInr(orderCtm)}
          </span>
        ) : null}
        <span
          className={
            receivedAmount > 0
              ? "text-sm font-semibold text-emerald-600"
              : "text-sm font-semibold text-gray-500"
          }
        >
          {receivedAmount > 0 ? `+${formatInr(receivedAmount)}` : formatInr(0)}
        </span>
      </span>
    );
  }

  const color =
    display.accent === "credit"
      ? "text-emerald-600"
      : display.accent === "debit"
        ? "text-red-600"
        : "text-gray-500";

  return (
    <span className={`font-semibold tabular-nums whitespace-nowrap ${color}`}>
      {display.text}
    </span>
  );
}
