'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2, X } from 'lucide-react';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
import type { OrderTimelineEntry } from '@/app/api/food-orders/[id]/timeline/route';
import {
  fetchOrderTimelineCached,
  getCachedOrderTimeline,
} from '@/lib/orderTimelineCache';
import {
  fetchMerchantTimelineEnrichmentCached,
  getCachedMerchantTimelineEnrichment,
  prefetchMerchantOrderTimelineBundle,
} from '@/lib/merchantTimelineEnrichmentCache';
import {
  buildMerchantVisibleTimeline,
  findActionForStep,
  parseActorDetailFromAction,
  type MerchantOrderActionForTimeline,
  type TimelineActorDetail,
} from '@/lib/merchantVisibleTimeline';
import { MerchantOrderTimelineStrip } from '@/components/orders/MerchantOrderTimelineStrip';
import { TimelineActorDetailModal } from '@/components/orders/TimelineActorDetailModal';
import { isPartnerOrderClosedForContact } from '@/lib/partner-orders-unify';

function formatTs(s: string | null | undefined) {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-IN', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function formatPlacedAgo(createdAt: string) {
  const ms = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Placed just now';
  if (mins < 60) return `Placed ${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  return `Placed ${hrs} hour${hrs === 1 ? '' : 's'} ago`;
}

export type OrderTimelineModalProps = {
  open: boolean;
  onClose: () => void;
  order: OrdersFoodRow | null;
  orderIdLabel?: string;
  timelineUrl?: string | null;
  /** Public store_id for activity API */
  storeId?: string | null;
  /** Merchant: 6-step strip. Full: raw order_timelines rows. */
  variant?: 'merchant' | 'full';
  layout?: 'horizontal' | 'vertical';
};

function TimelineStepContent({ entry }: { entry: OrderTimelineEntry }) {
  return (
    <>
      <p className="text-sm font-semibold text-gray-900">{entry.status}</p>
      {entry.status_message ? (
        <p className="text-xs text-gray-600 mt-0.5 leading-relaxed line-clamp-3">{entry.status_message}</p>
      ) : null}
      <p className="text-[11px] text-gray-500 mt-1">{formatTs(entry.occurred_at)}</p>
      {entry.actor_type ? (
        <p className="text-[10px] text-gray-400 mt-0.5 capitalize">{entry.actor_type}</p>
      ) : null}
    </>
  );
}

export function OrderTimelineModal({
  open,
  onClose,
  order,
  orderIdLabel,
  timelineUrl,
  storeId,
  variant = 'merchant',
  layout = 'horizontal',
}: OrderTimelineModalProps) {
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<OrderTimelineEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [riderReachedAt, setRiderReachedAt] = useState<string | null>(null);
  const [riderAssignedAt, setRiderAssignedAt] = useState<string | null>(null);
  const [actions, setActions] = useState<MerchantOrderActionForTimeline[]>([]);
  const [timelineEntries, setTimelineEntries] = useState<
    Array<{ status: string; occurred_at: string; status_message?: string | null }>
  >([]);
  const [actorDetail, setActorDetail] = useState<TimelineActorDetail | null>(null);
  const [actorOpen, setActorOpen] = useState(false);

  const orderFoodId = order?.id ?? 0;
  const isMerchant = variant === 'merchant';
  const resolvedTimelineUrl =
    timelineUrl ?? (orderFoodId > 0 ? `/api/food-orders/${orderFoodId}/timeline` : '');

  const cachedTimelineEntries = useMemo(() => {
    if (!open || orderFoodId <= 0) return [];
    const cached = getCachedOrderTimeline(orderFoodId);
    return (
      cached?.map((e) => ({
        status: e.status,
        occurred_at: e.occurred_at,
        status_message: e.status_message,
      })) ?? []
    );
  }, [open, orderFoodId]);

  const cachedEnrichment = useMemo(() => {
    if (!open || orderFoodId <= 0) return null;
    return getCachedMerchantTimelineEnrichment(orderFoodId) ?? null;
  }, [open, orderFoodId]);

  const effectiveTimelineEntries =
    timelineEntries.length > 0 ? timelineEntries : cachedTimelineEntries;

  const effectiveRiderReachedAt = riderReachedAt ?? cachedEnrichment?.riderReachedAt ?? null;
  const effectiveRiderAssignedAt = riderAssignedAt ?? cachedEnrichment?.riderAssignedAt ?? null;
  const effectiveActions = actions.length > 0 ? actions : (cachedEnrichment?.actions ?? []);

  const merchantSteps = useMemo(() => {
    if (!order || !isMerchant) return [];
    return buildMerchantVisibleTimeline(order, {
      riderReachedAt: effectiveRiderReachedAt,
      riderAssignedAt: effectiveRiderAssignedAt,
      actions: effectiveActions,
      timelineEntries: effectiveTimelineEntries,
    });
  }, [
    order,
    isMerchant,
    effectiveRiderReachedAt,
    effectiveRiderAssignedAt,
    effectiveActions,
    effectiveTimelineEntries,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && actorOpen) setActorOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, actorOpen]);

  useEffect(() => {
    if (orderFoodId > 0 && resolvedTimelineUrl) {
      prefetchMerchantOrderTimelineBundle(orderFoodId, storeId, resolvedTimelineUrl);
    }
  }, [orderFoodId, resolvedTimelineUrl, storeId]);

  /** Merchant strip — show cached rows instantly, refresh in background. */
  useEffect(() => {
    if (!open || !isMerchant || orderFoodId <= 0 || !resolvedTimelineUrl) {
      if (!open) setTimelineEntries([]);
      return;
    }

    const cached = getCachedOrderTimeline(orderFoodId);
    if (cached) {
      setTimelineEntries(
        cached.map((e) => ({
          status: e.status,
          occurred_at: e.occurred_at,
          status_message: e.status_message,
        }))
      );
    }

    let cancelled = false;
    void fetchOrderTimelineCached(orderFoodId, resolvedTimelineUrl).then((list) => {
      if (cancelled) return;
      setTimelineEntries(
        list.map((e) => ({
          status: e.status,
          occurred_at: e.occurred_at,
          status_message: e.status_message,
        }))
      );
    });

    return () => {
      cancelled = true;
    };
  }, [open, isMerchant, orderFoodId, resolvedTimelineUrl]);

  useEffect(() => {
    if (!open || !isMerchant || orderFoodId <= 0) {
      setRiderReachedAt(null);
      setRiderAssignedAt(null);
      setActions([]);
      return;
    }

    const cached = getCachedMerchantTimelineEnrichment(orderFoodId);
    if (cached) {
      setRiderReachedAt(cached.riderReachedAt);
      setRiderAssignedAt(cached.riderAssignedAt);
      setActions(cached.actions);
    }

    let cancelled = false;
    void fetchMerchantTimelineEnrichmentCached(orderFoodId, storeId).then((enrichment) => {
      if (cancelled) return;
      setRiderReachedAt(enrichment.riderReachedAt);
      setRiderAssignedAt(enrichment.riderAssignedAt);
      setActions(enrichment.actions);
    });

    return () => {
      cancelled = true;
    };
  }, [open, isMerchant, orderFoodId, storeId]);

  useEffect(() => {
    if (isMerchant || !open || orderFoodId <= 0) {
      if (!open) {
        setEntries([]);
        setError(null);
        setLoading(false);
      }
      return;
    }

    const cached = getCachedOrderTimeline(orderFoodId);
    if (cached !== undefined) {
      setEntries(cached);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void fetchOrderTimelineCached(orderFoodId, resolvedTimelineUrl).then((list) => {
      if (cancelled) return;
      setEntries(list);
      setError(null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, orderFoodId, resolvedTimelineUrl, isMerchant]);

  const handleView = (action: 'accepted' | 'ready' | 'cancelled') => {
    if (!order) return;
    if (action === 'accepted') {
      const act = findActionForStep(effectiveActions, ['ACCEPTED']);
      setActorDetail(parseActorDetailFromAction(act, order.accepted_by_label));
    } else if (action === 'ready') {
      const act = findActionForStep(effectiveActions, ['READY_FOR_PICKUP', 'READY', 'PREPARED']);
      setActorDetail(parseActorDetailFromAction(act));
    } else {
      const act = findActionForStep(effectiveActions, ['CANCELLED']);
      setActorDetail(
        parseActorDetailFromAction(act, order.cancelled_by_label ?? order.rejected_reason, {
          cancelledByType: order.cancelled_by_type,
          rejectedReason: order.rejected_reason,
        })
      );
    }
    setActorOpen(true);
  };

  if (!open || !order || typeof document === 'undefined') return null;

  const idText =
    orderIdLabel ??
    (order.formatted_order_id ? `ID: ${order.formatted_order_id}` : `ID: ${order.order_id}`);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4" role="presentation">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden />
        <div
          className={`relative w-full rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[85vh] ${
            isMerchant ? 'max-w-3xl' : layout === 'horizontal' ? 'max-w-4xl' : 'max-w-lg'
          }`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-timeline-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            <h2 id="order-timeline-title" className="text-lg font-bold text-gray-900">
              Order Timeline
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-6 py-4 overflow-y-auto hide-scrollbar flex-1 min-h-0 overflow-x-hidden">
            <div className="flex items-center justify-between gap-4 mb-6 text-sm">
              <span className="font-semibold text-gray-900">{idText}</span>
              <span className="text-gray-500">{formatPlacedAgo(order.created_at)}</span>
            </div>

            {isMerchant ? (
              <MerchantOrderTimelineStrip steps={merchantSteps} onView={handleView} />
            ) : loading && entries.length === 0 ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : error ? (
              <p className="text-sm text-red-600 text-center py-8">{error}</p>
            ) : entries.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No timeline events recorded yet.</p>
            ) : layout === 'horizontal' ? (
              <div className="overflow-x-auto pb-2 -mx-1 px-1">
                <ol className="flex items-start min-w-min gap-0">
                  {entries.map((entry, i) => {
                    const isLast = i === entries.length - 1;
                    const isCancel = /cancel/i.test(entry.status);
                    return (
                      <li key={entry.id} className="flex items-start shrink-0 max-w-[200px]">
                        <div className="flex flex-col items-center px-2 min-w-[140px]">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0 ${
                              isCancel
                                ? 'bg-red-500 border-red-500 text-white'
                                : 'bg-green-500 border-green-500 text-white'
                            }`}
                          >
                            <Check className="w-4 h-4" strokeWidth={3} />
                          </div>
                          <div className="mt-2 text-center w-full">
                            <TimelineStepContent entry={entry} />
                          </div>
                        </div>
                        {!isLast ? <div className="h-0.5 w-8 bg-gray-200 mt-4 shrink-0" aria-hidden /> : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : (
              <ul className="space-y-0">
                {entries.map((entry, i) => {
                  const isLast = i === entries.length - 1;
                  return (
                    <li key={entry.id} className="flex gap-3">
                      <div className="pb-5 min-w-0 flex-1">
                        <TimelineStepContent entry={entry} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <TimelineActorDetailModal
        open={actorOpen}
        detail={actorDetail}
        hidePhone={isPartnerOrderClosedForContact(order?.order_status)}
        onClose={() => setActorOpen(false)}
      />
    </>,
    document.body
  );
}
