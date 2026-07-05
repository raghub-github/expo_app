'use client';

import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
import { merchantCancellationDisplay } from '@/lib/merchant-cancellation-display';
import {
  resolveCancellationMessageParts,
  formatAppliedPayoutPolicy,
  type MerchantCancellationCompensationDisplay,
} from '@/lib/merchantCancellationCompensation';
import { formatOrderPrepTimingFootnote } from '@/lib/order-prep-time';
import { CompensationPolicyModal } from '@/components/orders/CompensationPolicyModal';
import { prefetchCompensationPolicy } from '@/lib/compensationPolicyCache';

type OrderWithCompensation = OrdersFoodRow & {
  cancellation_compensation?: MerchantCancellationCompensationDisplay | null;
};

type Props = {
  order: OrderWithCompensation;
  /** List cards show only cancelled-by + reason; detail page shows policy + prep timing. */
  variant?: 'compact' | 'detail';
};

export function OrderCancellationBanner({ order, variant = 'detail' }: Props) {
  const [policyOpen, setPolicyOpen] = useState(false);
  const isCompact = variant === 'compact';

  useEffect(() => {
    prefetchCompensationPolicy();
  }, []);

  if (
    !order.rejected_reason &&
    !order.cancelled_by_label &&
    !order.cancelled_by_type &&
    !order.cancellation_compensation?.eligible_message &&
    order.order_status !== 'CANCELLED'
  ) {
    return null;
  }

  const compensation = order.cancellation_compensation;
  const isAdminOverride = compensation?.admin_override === true;
  const { headline, detail } = merchantCancellationDisplay({
    rejected_reason: order.rejected_reason,
    cancelled_by_label: order.cancelled_by_label,
    cancelled_by_type: order.cancelled_by_type,
  });

  const parts = resolveCancellationMessageParts({
    eligibleMessage: compensation?.eligible_message,
    cancelledByBrand: compensation?.cancelled_by_brand,
    reasonDetail: compensation?.reason_detail,
    rejectedReason: order.rejected_reason ?? compensation?.reason_detail,
  });

  const prepFootnote = !isCompact
    ? formatOrderPrepTimingFootnote({
        prepared_at: order.prepared_at,
        prep_ready_by_at: order.prep_ready_by_at,
        prepared_late_minutes: order.prepared_late_minutes,
      })
    : null;

  const appliedPayoutPolicy = !isCompact
    ? formatAppliedPayoutPolicy(compensation)
    : null;

  const hasEngineParts = Boolean(parts.brandPrefix || parts.cancelReason);

  return (
    <div className="rounded-lg border border-red-900/40 bg-[#1C1C1C] p-3 text-slate-100">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-red-400">Cancelled</p>

      {hasEngineParts ? (
        <p className="text-sm leading-relaxed text-slate-200">
          {parts.brandPrefix ? (
            <span className="font-semibold text-red-400">{parts.brandPrefix} </span>
          ) : null}
          {parts.cancelReason ?? ''}
        </p>
      ) : (
        <>
          {headline ? (
            <p className="text-sm font-medium leading-relaxed break-words text-slate-100">{headline}</p>
          ) : null}
          {detail ? (
            <p className="mt-1 text-xs leading-relaxed break-words text-slate-300">{detail}</p>
          ) : null}
        </>
      )}

      {!isCompact && parts.policySentence && !isAdminOverride ? (
        <p className="mt-1.5 text-sm leading-relaxed text-slate-200">{parts.policySentence}</p>
      ) : null}

      {!isCompact && appliedPayoutPolicy ? (
        <p className="mt-2 text-sm font-semibold leading-relaxed text-emerald-300">
          {appliedPayoutPolicy}
        </p>
      ) : null}

      {!isCompact && compensation?.show_policy_link && !isAdminOverride ? (
        <button
          type="button"
          onClick={() => setPolicyOpen(true)}
          className="mt-2 text-left text-sm font-semibold text-blue-400 hover:text-blue-300"
        >
          View compensation policy
        </button>
      ) : null}

      {prepFootnote ? (
        <div className="mt-3 flex items-center gap-2 border-t border-neutral-700 pt-3">
          <Clock size={14} className="shrink-0 text-amber-400" />
          <p className="text-xs font-semibold text-amber-400">{prepFootnote}</p>
        </div>
      ) : null}

      {!isCompact && order.cancelled_by_type ? (
        <p className="mt-2 text-[10px] capitalize text-slate-400">
          {order.cancelled_by_type}
          {order.cancelled_at ? (
            <span className="ml-1.5 text-slate-500">
              • {new Date(order.cancelled_at).toLocaleString('en-IN')}
            </span>
          ) : null}
        </p>
      ) : null}

      {!isCompact ? (
        <CompensationPolicyModal
          open={policyOpen}
          onClose={() => setPolicyOpen(false)}
          title={compensation?.policy_modal_title}
        />
      ) : null}
    </div>
  );
}
