'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2, X } from 'lucide-react';
import type { OrdersFoodRow } from '@/lib/types/food-orders';
import type { OrderTimelineEntry } from '@/lib/orderTimelineTypes';
import {
  clearCachedOrderTimeline,
  getCachedOrderTimeline,
  prefetchOrderTimeline,
} from '@/lib/orderTimelineCache';
import {
  fetchMerchantTimelineEnrichmentCached,
  getCachedMerchantTimelineEnrichment,
  prefetchMerchantOrderTimelineBundle,
} from '@/lib/merchantTimelineEnrichmentCache';
import {
  merchantOrderTimelineApiId,
  merchantOrderTimelineFallbackUrls,
} from '@/lib/merchantOrderApiId';
import {
  buildMerchantVisibleTimeline,
  findActionForStep,
  parseActorDetailFromAction,
  type MerchantOrderActionForTimeline,
  type TimelineActorDetail,
} from '@/lib/merchantVisibleTimeline';
import { MerchantOrderTimelineStrip } from '@/components/orders/MerchantOrderTimelineStrip';
import { TimelineActorDetailModal } from '@/components/orders/TimelineActorDetailModal';

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
  storeId: string | number;
  orderIdLabel?: string;
  timelineUrl?: string | null;
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
  storeId,
  orderIdLabel,
  timelineUrl,
  variant = 'merchant',
  layout = 'horizontal',
}: OrderTimelineModalProps) {
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<OrderTimelineEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [riderReachedAt, setRiderReachedAt] = useState<string | null>(null);
  const [actions, setActions] = useState<MerchantOrderActionForTimeline[]>([]);
  const [actorDetail, setActorDetail] = useState<TimelineActorDetail | null>(null);
  const [actorOpen, setActorOpen] = useState(false);

  const isMerchant = variant === 'merchant';
  const apiOrderId = order ? merchantOrderTimelineApiId(order) : 0;

  const resolvedTimelineUrls = useMemo(() => {
    if (timelineUrl) return [timelineUrl];
    if (!order) return [];
    return merchantOrderTimelineFallbackUrls(storeId, order);
  }, [timelineUrl, order, storeId]);

  const cachedEnrichment = useMemo(() => {
    if (!open || !order || apiOrderId <= 0) return null;
    return getCachedMerchantTimelineEnrichment(storeId, apiOrderId) ?? null;
  }, [open, order, apiOrderId, storeId]);

  const effectiveRiderReachedAt = riderReachedAt ?? cachedEnrichment?.riderReachedAt ?? null;
  const effectiveActions = actions.length > 0 ? actions : (cachedEnrichment?.actions ?? []);

  const merchantSteps = useMemo(() => {
    if (!order || !isMerchant) return [];
    return buildMerchantVisibleTimeline(order, { riderReachedAt: effectiveRiderReachedAt });
  }, [order, isMerchant, effectiveRiderReachedAt]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && actorOpen) setActorOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, actorOpen]);

  useEffect(() => {
    if (!isMerchant) {
      for (const url of resolvedTimelineUrls) prefetchOrderTimeline(url);
      return;
    }
    if (apiOrderId > 0 && resolvedTimelineUrls[0]) {
      prefetchMerchantOrderTimelineBundle(storeId, apiOrderId, resolvedTimelineUrls[0]);
    }
  }, [resolvedTimelineUrls, isMerchant, storeId, apiOrderId]);

  useEffect(() => {
    if (!open || !isMerchant || !order || apiOrderId <= 0) {
      setRiderReachedAt(null);
      setActions([]);
      return;
    }

    const cached = getCachedMerchantTimelineEnrichment(storeId, apiOrderId);
    if (cached) {
      setRiderReachedAt(cached.riderReachedAt);
      setActions(cached.actions);
    }

    let cancelled = false;
    void fetchMerchantTimelineEnrichmentCached(storeId, apiOrderId).then((enrichment) => {
      if (cancelled) return;
      setRiderReachedAt(enrichment.riderReachedAt);
      setActions(enrichment.actions);
    });

    return () => {
      cancelled = true;
    };
  }, [open, isMerchant, order, apiOrderId, storeId]);

  useEffect(() => {
    if (isMerchant || !open || resolvedTimelineUrls.length === 0) {
      if (!open) {
        setEntries([]);
        setError(null);
        setLoading(false);
      }
      return;
    }

    for (const url of resolvedTimelineUrls) {
      const cached = getCachedOrderTimeline(url);
      if (cached !== undefined && cached.length > 0) {
        setEntries(cached);
        setError(null);
        setLoading(false);
        return;
      }
    }

    let cancelled = false;
    setLoading(true);

    const tryFetch = async (urls: string[]): Promise<void> => {
      let lastError = 'Could not load timeline';
      for (const url of urls) {
        try {
          const res = await fetch(url, { credentials: 'include' });
          const json = (await res.json().catch(() => ({}))) as {
            error?: string;
            timeline?: OrderTimelineEntry[];
          };
          if (cancelled) return;
          if (!res.ok || json.error) {
            clearCachedOrderTimeline(url);
            lastError = String(json.error || 'Could not load timeline');
            continue;
          }
          const list = (json.timeline ?? []) as OrderTimelineEntry[];
          setEntries(list);
          setError(null);
          setLoading(false);
          return;
        } catch {
          lastError = 'Could not load timeline';
        }
      }
      if (!cancelled) {
        setError(lastError);
        setEntries([]);
        setLoading(false);
      }
    };

    void tryFetch(resolvedTimelineUrls);

    return () => {
      cancelled = true;
    };
  }, [open, resolvedTimelineUrls, isMerchant]);

  const handleView = (action: 'accepted' | 'ready') => {
    if (!order) return;
    if (action === 'accepted') {
      const act = findActionForStep(effectiveActions, ['ACCEPTED']);
      setActorDetail(parseActorDetailFromAction(act, order.accepted_by_label));
    } else {
      const act = findActionForStep(effectiveActions, ['READY_FOR_PICKUP', 'READY', 'PREPARED']);
      setActorDetail(parseActorDetailFromAction(act));
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
                {entries.map((entry) => (
                  <li key={entry.id} className="flex gap-3">
                    <div className="pb-5 min-w-0 flex-1">
                      <TimelineStepContent entry={entry} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <TimelineActorDetailModal
        open={actorOpen}
        detail={actorDetail}
        onClose={() => setActorOpen(false)}
      />
    </>,
    document.body
  );
}
