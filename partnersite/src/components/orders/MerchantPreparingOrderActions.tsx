'use client';

import { Hourglass } from 'lucide-react';
import { MarkAsReadyCountdownButton } from '@/components/orders/MarkAsReadyCountdownButton';
import {
  isPrepCountdownExpired,
  isPrepPerformanceOverdue,
  prepReadyCountdownLabel,
  canUseNeedMoreTime,
  prepOverdueSeconds,
  formatPrepDelayedBannerLabel,
  formatPrepDelayedBannerLabelFromMinutes,
  type PrepCountdownOrder,
} from '@/lib/order-prep-time';

const BLOOD_RED = '#8B0000';
const ORDER_READY_PREFIX = 'Order Ready';

/** Top banner — live overdue minutes vs prep_ready_by_at (KPT + need-more-time). */
export function OrderPrepDelayedBanner({
  order,
  nowMs,
}: {
  order: PrepCountdownOrder;
  nowMs: number;
}) {
  const overdueSec = prepOverdueSeconds(order, nowMs);
  const label = formatPrepDelayedBannerLabel(overdueSec);

  return <OrderDelayTopBanner label={label} />;
}

/** Top banner on ready / picked-up cards — frozen delay from when order was marked ready. */
export function OrderPreparedLateTopBanner({ lateMinutes }: { lateMinutes: number }) {
  return <OrderDelayTopBanner label={formatPrepDelayedBannerLabelFromMinutes(lateMinutes)} />;
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

export function ExtraPrepTimeAddedBanner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center border-b border-orange-200 bg-orange-50 px-3 py-1.5">
      <span className="text-xs font-extrabold tracking-normal text-orange-900">{label}</span>
    </div>
  );
}

export function computePrepExpired(order: PrepCountdownOrder, nowMs: number): boolean {
  return isPrepPerformanceOverdue(order, nowMs);
}

export type MerchantPreparingOrderActionsProps = {
  order: PrepCountdownOrder & {
    prep_delay_use_count?: number | null;
    is_bulk_order?: boolean | null;
    prep_delay_minutes?: number | null;
  };
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
  const performanceOverdue = computePrepExpired(order, nowMs);
  const countdownExpired =
    isPrepCountdownExpired(order, nowMs, { prefix: ORDER_READY_PREFIX }) ||
    !prepReadyCountdownLabel(order, nowMs, { prefix: ORDER_READY_PREFIX }).label.includes('(');
  const canNeedMore =
    performanceOverdue &&
    countdownExpired &&
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

  if (!performanceOverdue) {
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
