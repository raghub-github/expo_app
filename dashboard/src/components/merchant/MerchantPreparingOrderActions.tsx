'use client';

import { Hourglass } from 'lucide-react';
import { MarkAsReadyCountdownButton } from '@/components/orders/MarkAsReadyCountdownButton';
import {
  isPrepCountdownExpired,
  prepReadyCountdownLabel,
  canUseNeedMoreTime,
  prepOverdueMinutes,
  formatPrepDelayedBannerLabel,
} from '@/lib/order-prep-time';
import type { OrdersFoodRow } from '@/lib/types/food-orders';

const BLOOD_RED = '#8B0000';
const ORDER_READY_PREFIX = 'Order Ready';

/** Top banner — live overdue minutes vs prep_ready_by_at (KPT + need-more-time). */
export function OrderPrepDelayedBanner({
  order,
  nowMs,
}: {
  order: OrdersFoodRow;
  nowMs: number;
}) {
  const overdueMins = prepOverdueMinutes(order, nowMs);
  const label = formatPrepDelayedBannerLabel(overdueMins);

  return <OrderDelayTopBanner label={label} />;
}

/** Top banner on ready / picked-up cards — frozen delay from when order was marked ready. */
export function OrderPreparedLateTopBanner({ lateMinutes }: { lateMinutes: number }) {
  return <OrderDelayTopBanner label={formatPrepDelayedBannerLabel(lateMinutes)} />;
}

function OrderDelayTopBanner({ label }: { label: string }) {
  return (
    <div
      className="flex items-center justify-center gap-1.5 px-3 py-2 text-white"
      style={{ backgroundColor: BLOOD_RED }}
    >
      <Hourglass size={14} strokeWidth={2.5} aria-hidden />
      <span className="text-xs font-extrabold tracking-normal">{label}</span>
    </div>
  );
}

export function computePrepExpired(order: OrdersFoodRow, nowMs: number): boolean {
  return (
    isPrepCountdownExpired(order, nowMs, { prefix: ORDER_READY_PREFIX }) ||
    !prepReadyCountdownLabel(order, nowMs, { prefix: ORDER_READY_PREFIX }).label.includes('(')
  );
}

export type MerchantPreparingOrderActionsProps = {
  order: OrdersFoodRow;
  nowMs: number;
  onReady: () => void;
  onNeedMoreTime?: () => void;
  loading?: boolean;
  compact?: boolean;
  className?: string;
};

/** Footer actions for preparing orders — no delayed flash; banner shows live overdue time. */
export function MerchantPreparingOrderActions({
  order,
  nowMs,
  onReady,
  onNeedMoreTime,
  loading,
  compact,
  className = '',
}: MerchantPreparingOrderActionsProps) {
  const prepExpired = computePrepExpired(order, nowMs);
  const canNeedMore =
    prepExpired &&
    !!onNeedMoreTime &&
    canUseNeedMoreTime(
      order.prep_delay_use_count,
      Boolean(order.is_bulk_order),
      order.prep_delay_minutes
    );

  const btnSize = compact
    ? 'min-h-[40px] rounded-xl px-2 py-2 text-xs font-semibold'
    : 'min-h-[44px] rounded-xl px-3 py-2.5 text-sm font-semibold';

  const readyBtn = (
    <MarkAsReadyCountdownButton
      order={order}
      nowMs={nowMs}
      disabled={loading}
      compact={compact && !canNeedMore}
      fullWidth
      labelPrefix={ORDER_READY_PREFIX}
      className={`${btnSize} w-full min-w-0`}
      onClick={(e) => {
        e.stopPropagation();
        onReady();
      }}
    />
  );

  if (!prepExpired) {
    return <div className={`w-full ${className}`}>{readyBtn}</div>;
  }

  if (canNeedMore) {
    return (
      <div className={`grid w-full grid-cols-2 gap-2 ${className}`}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNeedMoreTime?.();
          }}
          disabled={loading}
          className={`${btnSize} border border-[#2563EB] bg-white font-bold text-[#2563EB] hover:bg-blue-50 disabled:opacity-50`}
        >
          Need more time
        </button>
        {readyBtn}
      </div>
    );
  }

  return <div className={`w-full ${className}`}>{readyBtn}</div>;
}
