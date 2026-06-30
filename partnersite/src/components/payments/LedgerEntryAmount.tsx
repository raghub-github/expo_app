import { formatInr } from '@/lib/format-inr';
import type { CancellationLedgerDisplay } from '@/lib/merge-cancellation-ledger-entries';

type Props = {
  display: CancellationLedgerDisplay;
};

export function LedgerEntryAmount({ display }: Props) {
  const { originalAmount, creditAmount } = display;
  const showStrike =
    originalAmount > 0 && (creditAmount <= 0 || originalAmount > creditAmount);

  return (
    <div className="flex flex-col items-end gap-0.5">
      {showStrike ? (
        <span className="text-xs font-medium text-gray-400 line-through tabular-nums">
          {formatInr(originalAmount)}
        </span>
      ) : null}
      <span
        className={`font-semibold tabular-nums ${
          creditAmount > 0 ? 'text-emerald-600' : 'text-gray-600'
        }`}
      >
        {creditAmount > 0 ? `+ ${formatInr(creditAmount)}` : formatInr(0)}
      </span>
    </div>
  );
}
