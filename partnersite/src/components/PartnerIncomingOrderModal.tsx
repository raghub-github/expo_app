'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Volume2, VolumeX, Clock, Minus, Plus, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
import { fetchStoreById } from '@/lib/database';
import { createClient } from '@/lib/supabase/client';
import {
  PARTNER_INCOMING_MODAL_CLOSED,
  PARTNER_INCOMING_MODAL_OPEN,
  PARTNER_PENDING_ORDERS_REFRESH,
  usePartnerSelectedStore,
} from '@/lib/partner-selected-store';
import {
  readPartnerDeviceOrderAlerts,
  resolveAlertUrlFromSlots,
  volumeStepTo01,
} from '@/lib/partner-device-order-alerts';
import { resolvePartnerPipeline } from '@/lib/partner-orders-unify';
import {
  hasShownPartnerOrderActionToast,
  markPartnerOrderActionToastShown,
  type PartnerOrderActionToastKind,
} from '@/lib/partner-order-action-toast';
import { RejectOrderSidesheet } from '@/components/orders/RejectOrderSidesheet';
import { OrderBillSidesheet } from '@/components/orders/OrderBillSidesheet';
import { MerchantOrderItemsList } from '@/components/orders/MerchantOrderItemsList';
import { MerchantOrderBillSummary } from '@/components/orders/MerchantOrderBillSummary';
import { getUtensilsCustomerLabel } from '@/lib/orderUtensilsLabel';
import type { NormalizedOrderLineItem, OrderPricingBreakdown } from '@/lib/orderLineItems';
import {
  PREP_TIME_MIN,
  PREP_TIME_MAX,
  PLATFORM_DEFAULT_PREP_MINUTES,
  clampPrepMinutes,
  resolveStoreDefaultPrepMinutes,
} from '@/lib/order-prep-time';

const PREP_STEP_MINUTES = 5;
/** Max line items in accept popup; rest via +N more → sidesheet. */
const MAX_PREVIEW_ITEMS = 3;

const MUTE_KEY = 'partner_incoming_order_mute_sound';
const DEFAULT_ALERT_SOUND = '/notification.wav';
const FALLBACK_POLL_MS = 8_000;
const FALLBACK_SCAN_LIMIT = 12;
const DISMISS_KEY = 'partner_incoming_order_dismissed_v1';

type AcceptanceSettings = {
  store_type?: string;
  acceptance_window_minutes: number;
  alert_sound_enabled: boolean;
  alert_sound_url: string | null;
  alert_sound_repeat_count: number;
  alert_sound_urls_by_slot?: [string | null, string | null, string | null];
};

const DEFAULT_SETTINGS: AcceptanceSettings = {
  store_type: 'GENERAL',
  acceptance_window_minutes: 5,
  alert_sound_enabled: true,
  alert_sound_url: null,
  alert_sound_repeat_count: 1,
  alert_sound_urls_by_slot: [null, null, null],
};

function orderTotalRs(order: OrdersFoodRow): number {
  const n = Number(order.food_items_total_value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isBulkOrderFlag(order: OrdersFoodRow | null): boolean {
  if (!order) return false;
  const anyOrder = order as unknown as Record<string, unknown>;
  return anyOrder.is_bulk_order === true || anyOrder.isBulkOrder === true;
}

async function playChimeSequential(
  url: string | null | undefined,
  repeatCount: number,
  opts: {
    volume01: number;
    /** Best-effort hint for mobile browsers (cannot override hardware silent switch). */
    ringInSilent: boolean;
    /** Unique token for this run; if it changes, playback stops. */
    getRunId: () => number;
    runId: number;
    /** For stopping current audio when cancelled/closed. */
    setAudioRef: (a: HTMLAudioElement | null) => void;
  }
) {
  if (typeof window === 'undefined') return;
  const src = (url || '').trim() || DEFAULT_ALERT_SOUND;
  if (!src) return;

  const safeRepeats = Math.max(1, Math.min(25, Math.floor(repeatCount || 1)));
  try {
    for (let i = 0; i < safeRepeats; i += 1) {
      // Cancel if a newer run started or modal closed.
      if (opts.getRunId() !== opts.runId) break;
      const audio = new Audio(src);
      audio.loop = false;
      audio.setAttribute('playsinline', '');
      audio.preload = 'auto';
      audio.volume = Math.min(1, Math.max(0, opts.volume01));
      if (opts.ringInSilent) {
        try {
          audio.muted = false;
        } catch {
          /* ignore */
        }
      }
      opts.setAudioRef(audio);

      // Attach listeners BEFORE calling play() so we never miss 'ended'.
      const done = new Promise<void>((resolve) => {
        const finish = () => resolve();
        audio.addEventListener('ended', finish, { once: true });
        audio.addEventListener('error', finish, { once: true });
      });

      try {
        // If cancelled right before play, don't start.
        if (opts.getRunId() !== opts.runId) break;
        await audio.play();
      } catch {
        // Autoplay blocked / invalid URL — stop looping.
        break;
      }

      await done;
    }
  } catch {
    /* ignore */
  } finally {
    // Clear ref only if no newer run took over.
    if (opts.getRunId() === opts.runId) opts.setAudioRef(null);
  }
}

/** Device-local partner settings + modal mute toggle (same browser only). */
function shouldPlayIncomingSound(storeId: string | null | undefined) {
  if (typeof window === 'undefined' || !storeId) return false;
  const d = readPartnerDeviceOrderAlerts(storeId);
  if (!d.orderAlertsEnabled || !d.soundAlertsEnabled) return false;
  try {
    if (localStorage.getItem(MUTE_KEY) === '1') return false;
  } catch {
    /* ignore */
  }
  return true;
}

function MiniOrderId({
  formattedOrderId,
  fallbackOrderId,
}: {
  formattedOrderId?: string | null;
  fallbackOrderId: number;
}) {
  if (formattedOrderId) {
    const last4 = formattedOrderId.slice(-4);
    const prefix = formattedOrderId.slice(0, -4);
    return (
      <span className="font-mono text-lg font-extrabold tracking-wide text-gray-900">
        <span className="text-gray-900">{prefix}</span>
        <span className="px-0.5" aria-hidden />
        <span className="text-orange-600">{last4}</span>
      </span>
    );
  }
  return <span className="font-mono text-lg font-extrabold tracking-wide text-gray-900">#{fallbackOrderId}</span>;
}

/**
 * Global overlay: new store orders (orders_core assigned, or orders_food CREATED). Partnersite only.
 */
export function PartnerIncomingOrderModal({ restaurantId }: { restaurantId?: string }) {
  const { storeId, storeInternalId, ready: storeReady } = usePartnerSelectedStore(restaurantId);
  const [muted, setMuted] = useState(false);
  const [modalOrder, setModalOrder] = useState<OrdersFoodRow | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [itemsSheetOpen, setItemsSheetOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [settings, setSettings] = useState<AcceptanceSettings>(DEFAULT_SETTINGS);
  /** Dedupe by orders_core.id */
  const shownInsertIds = useRef<Set<string>>(new Set());
  const hydrateBusyRef = useRef(false);
  const chimeRunIdRef = useRef(0);
  const chimeAudioRef = useRef<HTMLAudioElement | null>(null);
  const autoAcceptTimerRef = useRef<number | null>(null);
  /** Prevents duplicate auto-cancel + toast when the acceptance timer hits zero. */
  const autoCancelFiredForOrderIdRef = useRef<number | null>(null);
  const [storeOpsSettings, setStoreOpsSettings] = useState<{ auto_accept_orders: boolean; auto_accept_time_seconds: number; show_floating_orders: boolean } | null>(null);
  const [prepMinutes, setPrepMinutes] = useState(PLATFORM_DEFAULT_PREP_MINUTES);
  const [maxPrepMinutes, setMaxPrepMinutes] = useState(PREP_TIME_MAX);
  const storeDefaultPrepRef = useRef(PLATFORM_DEFAULT_PREP_MINUTES);

  const getDismissed = () => {
    if (typeof window === 'undefined') return new Set<number>();
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) return new Set<number>();
      const arr = JSON.parse(raw) as Array<{ order_id: number; t: number }>;
      const out = new Set<number>();
      const now = Date.now();
      for (const it of Array.isArray(arr) ? arr : []) {
        if (it && typeof it.order_id === 'number' && typeof it.t === 'number' && now - it.t < 7 * 86400_000) {
          out.add(it.order_id);
        }
      }
      return out;
    } catch {
      return new Set<number>();
    }
  };

  const addDismissed = (orderId: number) => {
    if (typeof window === 'undefined') return;
    try {
      const prev = getDismissed();
      prev.add(orderId);
      const arr = Array.from(prev).map((oid) => ({ order_id: oid, t: Date.now() }));
      localStorage.setItem(DISMISS_KEY, JSON.stringify(arr.slice(-200)));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    try {
      setMuted(localStorage.getItem(MUTE_KEY) === '1');
    } catch {
      setMuted(false);
    }
  }, []);

  const reloadAcceptanceSettings = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetch(
        `/api/merchant/order-acceptance-settings?store_id=${encodeURIComponent(storeId)}`
      );
      const data = (await res.json().catch(() => ({}))) as { settings?: Partial<AcceptanceSettings> };
      if (res.ok && data.settings) setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      else setSettings(DEFAULT_SETTINGS);
    } catch {
      setSettings(DEFAULT_SETTINGS);
    }
  }, [storeId]);

  useEffect(() => {
    void reloadAcceptanceSettings();
  }, [reloadAcceptanceSettings]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onRefresh = () => {
      void reloadAcceptanceSettings();
    };
    window.addEventListener('partner-order-acceptance-settings-changed', onRefresh);
    return () => window.removeEventListener('partner-order-acceptance-settings-changed', onRefresh);
  }, [reloadAcceptanceSettings]);

  useEffect(() => {
    if (!storeId) return;
    void (async () => {
      try {
        const res = await fetch(`/api/merchant/store-settings?storeId=${encodeURIComponent(storeId)}`, { credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setStoreOpsSettings(null);
          return;
        }
        setStoreOpsSettings({
          auto_accept_orders: data.auto_accept_orders === true,
          auto_accept_time_seconds: typeof data.auto_accept_time_seconds === 'number' ? Math.max(0, Math.min(600, Math.floor(data.auto_accept_time_seconds))) : 30,
          show_floating_orders: data.show_floating_orders !== false,
        });
        const maxPrep =
          typeof data.max_preparation_time_minutes === 'number' && data.max_preparation_time_minutes >= PREP_TIME_MIN
            ? Math.min(PREP_TIME_MAX, Math.floor(data.max_preparation_time_minutes))
            : PREP_TIME_MAX;
        setMaxPrepMinutes(maxPrep);
      } catch {
        setStoreOpsSettings(null);
      }
    })();
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    void (async () => {
      const s = await fetchStoreById(storeId);
      const def = resolveStoreDefaultPrepMinutes(s?.avg_preparation_time_minutes);
      storeDefaultPrepRef.current = def;
      setPrepMinutes(def);
    })();
  }, [storeId]);

  useEffect(() => {
    if (!modalOrder) return;
    setPrepMinutes(storeDefaultPrepRef.current);
  }, [modalOrder?.order_id]);

  const fetchByFoodRow = useCallback(
    async (foodRowId: number) => {
      if (!storeId) return null;
      const res = await fetch(
        `/api/food-orders?store_id=${encodeURIComponent(storeId)}&orders_food_id=${foodRowId}`
      );
      const data = (await res.json().catch(() => ({}))) as { orders?: OrdersFoodRow[] };
      if (!res.ok || !Array.isArray(data.orders) || data.orders.length === 0) return null;
      return data.orders[0] ?? null;
    },
    [storeId]
  );

  const fetchByCoreId = useCallback(
    async (coreId: number) => {
      if (!storeId) return null;
      const res = await fetch(
        `/api/food-orders?store_id=${encodeURIComponent(storeId)}&orders_core_id=${coreId}`
      );
      const data = (await res.json().catch(() => ({}))) as { orders?: OrdersFoodRow[] };
      if (!res.ok || !Array.isArray(data.orders) || data.orders.length === 0) return null;
      return data.orders[0] ?? null;
    },
    [storeId]
  );

  useEffect(() => {
    // Ensure modal has customer name + items + bulk flag by re-fetching full order (DB-backed)
    // in case it was opened from a partial row or older cached data.
    if (!storeId || !modalOrder) return;
    const itemsArr = Array.isArray(modalOrder.items) ? modalOrder.items : [];
    const needsHydrate =
      !modalOrder.customer_name ||
      itemsArr.length === 0 ||
      (modalOrder as unknown as Record<string, unknown>).is_bulk_order === undefined ||
      itemsArr.some((it) => {
        const row = it as NormalizedOrderLineItem;
        const hasCust =
          (row.customizations?.length ?? 0) > 0 ||
          Boolean(row.variantName) ||
          Boolean(row.variantTag);
        const hasStructured =
          (row.customizationLines?.length ?? 0) > 0 || Boolean(row.variantTag);
        return hasCust && !hasStructured;
      });
    if (!needsHydrate) return;
    if (hydrateBusyRef.current) return;
    hydrateBusyRef.current = true;
    void (async () => {
      try {
        const full = await fetchByCoreId(modalOrder.order_id);
        if (full) setModalOrder(full);
      } finally {
        hydrateBusyRef.current = false;
      }
    })();
  }, [storeId, modalOrder?.order_id, fetchByCoreId]);

  const openIfNew = useCallback(
    async (full: OrdersFoodRow | null) => {
      if (!full) return;
      const dismissed = getDismissed();
      if (dismissed.has(full.order_id)) return;
      const ext = full as OrdersFoodRow & { core_status?: string; current_status?: string | null };
      const fst = resolvePartnerPipeline(
        full.order_status,
        ext.core_status ?? 'assigned',
        ext.current_status ?? null
      );
      if (fst !== 'CREATED') return;
      const dedupeKey = `o:${full.order_id}`;
      if (shownInsertIds.current.has(dedupeKey)) return;
      shownInsertIds.current.add(dedupeKey);

      const acceptWindowMs = Math.max(
        60_000,
        Math.max(1, Math.min(180, Number(settings.acceptance_window_minutes || 5))) * 60_000
      );
      const orderAgeMs = Date.now() - new Date(full.created_at).getTime();
      if (orderAgeMs >= acceptWindowMs) {
        addDismissed(full.order_id);
        return;
      }

      setModalOrder(full);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(PARTNER_INCOMING_MODAL_OPEN));
      }
      if (shouldPlayIncomingSound(storeId) && settings.alert_sound_enabled) {
        const device = readPartnerDeviceOrderAlerts(storeId);
        const slots =
          settings.alert_sound_urls_by_slot ??
          ([settings.alert_sound_url, null, null] as [
            string | null,
            string | null,
            string | null,
          ]);
        const chimeUrl =
          resolveAlertUrlFromSlots(slots, device.alertSoundSlot) ??
          settings.alert_sound_url ??
          DEFAULT_ALERT_SOUND;
        chimeRunIdRef.current += 1;
        const myRun = chimeRunIdRef.current;
        void playChimeSequential(chimeUrl, settings.alert_sound_repeat_count, {
          volume01: volumeStepTo01(device.volumeStep),
          ringInSilent: device.ringInSilent,
          runId: myRun,
          getRunId: () => chimeRunIdRef.current,
          setAudioRef: (a) => {
            chimeAudioRef.current = a;
          },
        });
      }
    },
    [
      storeId,
      settings.acceptance_window_minutes,
      settings.alert_sound_enabled,
      settings.alert_sound_repeat_count,
      settings.alert_sound_url,
      settings.alert_sound_urls_by_slot,
    ]
  );

  const scanForNewOrders = useCallback(async () => {
    if (!storeId || !storeReady) return;
    // If user already has a modal open, don't steal focus; next scan will run again.
    if (modalOrder) return;
    try {
      const res = await fetch(
        `/api/food-orders?store_id=${encodeURIComponent(storeId)}&limit=${FALLBACK_SCAN_LIMIT}`
      );
      const data = (await res.json().catch(() => ({}))) as { orders?: OrdersFoodRow[] };
      if (!res.ok || !Array.isArray(data.orders)) return;
      const firstCreated = data.orders.find((o) => {
        const ext = o as OrdersFoodRow & { core_status?: string; current_status?: string | null };
        const st = resolvePartnerPipeline(o.order_status, ext.core_status ?? 'assigned', ext.current_status ?? null);
        return st === 'CREATED';
      });
      await openIfNew(firstCreated ?? null);
    } catch {
      /* ignore */
    }
  }, [storeId, storeReady, modalOrder, openIfNew]);

  const scanForNewOrdersRef = useRef(scanForNewOrders);
  scanForNewOrdersRef.current = scanForNewOrders;

  useEffect(() => {
    if (!storeInternalId || !storeId || !storeReady) return () => {};
    const supabase = createClient();
    const ch = supabase
      .channel(`partner_incoming:${storeInternalId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders_core',
          filter: `merchant_store_id=eq.${storeInternalId}`,
        },
        (payload) => {
          const row = payload.new as { id?: number; status?: string; merchant_store_id?: number };
          const prev = payload.old as { status?: string } | null;
          const nextStatus = String(row.status || '').toLowerCase();
          const prevStatus = String(prev?.status || '').toLowerCase();
          // Some flows create the row first, then UPDATE to assigned — handle both.
          if (nextStatus !== 'assigned') return;
          if (prevStatus === 'assigned') return;
          const cid = Number(row.id);
          if (!Number.isFinite(cid)) return;
          void (async () => {
            const full = await fetchByCoreId(cid);
            await openIfNew(full);
          })();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders_food',
          filter: `merchant_store_id=eq.${storeInternalId}`,
        },
        (payload) => {
          const row = payload.new as { id?: number; order_status?: string };
          const prev = payload.old as { order_status?: string } | null;
          const prevSt = resolvePartnerPipeline(prev?.order_status ?? null, 'assigned', null);
          const st = resolvePartnerPipeline(row.order_status, 'assigned', null);
          if (st !== 'CREATED') return;
          if (prevSt === 'CREATED') return;
          const fid = Number(row.id);
          if (!Number.isFinite(fid)) return;
          void (async () => {
            const full = await fetchByFoodRow(fid);
            await openIfNew(full);
          })();
        }
      )
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [storeId, storeInternalId, storeReady, fetchByCoreId, fetchByFoodRow, openIfNew]);

  useEffect(() => {
    if (!storeReady || !storeId) return;
    // Fallback: if realtime misses events (or order becomes "assigned" via UPDATE),
    // still pop a modal when there is any CREATED pipeline order.
    void scanForNewOrders();
    const t = window.setInterval(() => void scanForNewOrders(), FALLBACK_POLL_MS);
    const onRescan = () => void scanForNewOrders();
    window.addEventListener('partner-incoming-order-rescan', onRescan);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('partner-incoming-order-rescan', onRescan);
    };
  }, [scanForNewOrders, storeReady, storeId]);

  useEffect(() => {
    if (!modalOrder) return;
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [modalOrder]);

  const acceptWindowMs = useMemo(() => {
    // This modal is currently used for partner food orders.
    const mins = Number(settings.acceptance_window_minutes || 5);
    const safeMins = Math.max(1, Math.min(180, mins));
    return safeMins * 60 * 1000;
  }, [settings.acceptance_window_minutes]);

  const deadlineMs = useMemo(() => {
    if (!modalOrder) return 0;
    return new Date(modalOrder.created_at).getTime() + acceptWindowMs;
  }, [modalOrder, acceptWindowMs]);

  const secondsLeft = useMemo(() => {
    if (!modalOrder) return 0;
    return Math.max(0, Math.ceil((deadlineMs - nowTick) / 1000));
  }, [modalOrder, deadlineMs, nowTick]);

  const mmss = useMemo(() => {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, [secondsLeft]);

  const isBig = isBulkOrderFlag(modalOrder);

  const stepPrep = useCallback(
    (delta: number) => {
      setPrepMinutes((prev) => {
        const next = clampPrepMinutes(prev + delta, storeDefaultPrepRef.current);
        return Math.max(PREP_TIME_MIN, Math.min(maxPrepMinutes, next));
      });
    },
    [maxPrepMinutes]
  );

  const orderItems = modalOrder ? (Array.isArray(modalOrder.items) ? modalOrder.items : []) : [];
  const itemCount = orderItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0);

  const incomingOrderLineSum = useMemo(() => {
    if (!orderItems.length) return 0;
    return orderItems.reduce(
      (acc, it) => acc + Number(it.total || (it.price || 0) * (it.quantity || 1)),
      0
    );
  }, [orderItems]);

  const incomingOrderPricing = useMemo((): OrderPricingBreakdown => {
    if (!modalOrder) {
      return { subtotal: 0, packaging: 0, taxes: 0, discount: 0, total: 0 };
    }
    const p = modalOrder.pricing;
    if (p) return p;
    const total = Number(modalOrder.food_items_total_value ?? incomingOrderLineSum);
    return {
      subtotal: incomingOrderLineSum,
      packaging: 0,
      taxes: 0,
      discount: 0,
      total: Number.isFinite(total) ? total : incomingOrderLineSum,
    };
  }, [modalOrder, incomingOrderLineSum]);
  const moreItemsCount = Math.max(0, orderItems.length - MAX_PREVIEW_ITEMS);

  useEffect(() => {
    setItemsSheetOpen(false);
  }, [modalOrder?.order_id]);

  useEffect(() => {
    if (!modalOrder) {
      autoCancelFiredForOrderIdRef.current = null;
      return;
    }
    if (actionLoading) return;
    if (secondsLeft > 0) return;
    if (autoCancelFiredForOrderIdRef.current === modalOrder.order_id) return;
    autoCancelFiredForOrderIdRef.current = modalOrder.order_id;
    // Safety: auto-cancel when acceptance window finishes (once per order).
    void patchStatus('CANCELLED', { rejected_reason: 'Auto Cancelled' }, 'auto');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, modalOrder, actionLoading]);

  const persistMute = (v: boolean) => {
    setMuted(v);
    try {
      localStorage.setItem(MUTE_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const close = () => {
    if (autoAcceptTimerRef.current != null) {
      window.clearTimeout(autoAcceptTimerRef.current);
      autoAcceptTimerRef.current = null;
    }
    // Stop any playing chime immediately and prevent further repeats.
    chimeRunIdRef.current += 1;
    try {
      if (chimeAudioRef.current) {
        chimeAudioRef.current.pause();
        chimeAudioRef.current.currentTime = 0;
      }
    } catch {
      /* ignore */
    }
    chimeAudioRef.current = null;
    if (modalOrder) addDismissed(modalOrder.order_id);
    setModalOrder(null);
    setRejectOpen(false);
    setItemsSheetOpen(false);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(PARTNER_INCOMING_MODAL_CLOSED));
      window.dispatchEvent(new CustomEvent(PARTNER_PENDING_ORDERS_REFRESH));
    }
    queueMicrotask(() => void scanForNewOrdersRef.current());
  };

  const showOrderActionToast = (kind: PartnerOrderActionToastKind, orderId: number) => {
    if (hasShownPartnerOrderActionToast(orderId, kind)) return;
    markPartnerOrderActionToastShown(orderId, kind);
    if (kind === 'accepted') {
      toast.success('Order accepted', {
        id: `partner-order-${kind}-${orderId}`,
        classNames: { toast: 'mx-toast mx-toast--success' },
      });
    } else {
      toast.error('Order cancelled', {
        id: `partner-order-${kind}-${orderId}`,
        classNames: { toast: 'mx-toast mx-toast--error' },
      });
    }
  };

  const patchStatus = async (
    status: 'ACCEPTED' | 'CANCELLED',
    extra?: { rejected_reason?: string; preparation_time_minutes?: number },
    mode: 'auto' | 'manual' = 'manual'
  ) => {
    if (!storeId || !modalOrder) return;
    const orderIdForToast = modalOrder.order_id;
    setActionLoading(true);
    try {
      const url = modalOrder.core_only
        ? `/api/merchant/orders-core/${modalOrder.order_id}`
        : `/api/food-orders/${modalOrder.id}`;
      const payload = {
        store_id: storeId,
        status,
        action_source: status === 'CANCELLED' && mode === 'auto' ? ('system' as const) : ('website' as const),
        ...(status === 'ACCEPTED' ? { accept_mode: mode } : {}),
        ...(status === 'CANCELLED' ? { cancel_mode: mode } : {}),
        ...extra,
      };
      console.debug('[partner-incoming-modal] PATCH start', {
        url,
        payload,
        order_id: modalOrder.order_id,
        orders_food_id: modalOrder.id,
        core_only: modalOrder.core_only,
      });
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        console.debug('[partner-incoming-modal] PATCH failed', {
          url,
          httpStatus: res.status,
          err,
          payload,
        });
        throw new Error(err.error || 'Update failed');
      }
      console.debug('[partner-incoming-modal] PATCH ok', { url, httpStatus: res.status });
      showOrderActionToast(status === 'ACCEPTED' ? 'accepted' : 'rejected', orderIdForToast);
      window.dispatchEvent(new CustomEvent(PARTNER_PENDING_ORDERS_REFRESH));
      close();
    } catch (e) {
      console.debug('[partner-incoming-modal] PATCH exception', {
        message: e instanceof Error ? e.message : String(e),
        status,
      });
      toast.error(e instanceof Error ? e.message : 'Could not update order');
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    if (autoAcceptTimerRef.current != null) {
      window.clearTimeout(autoAcceptTimerRef.current);
      autoAcceptTimerRef.current = null;
    }
    if (!modalOrder || !storeOpsSettings?.auto_accept_orders) return;
    if (storeOpsSettings.show_floating_orders === false) return;
    const secs = Math.max(0, Math.min(600, Math.floor(storeOpsSettings.auto_accept_time_seconds || 0)));
    if (secs <= 0) return;
    const st = String(modalOrder.order_status || 'CREATED').toUpperCase();
    if (st !== 'CREATED' && st !== 'NEW') return;
    autoAcceptTimerRef.current = window.setTimeout(() => {
      autoAcceptTimerRef.current = null;
      // Only auto-accept if still the same order and still unaccepted.
      if (!modalOrder) return;
      const cur = String(modalOrder.order_status || 'CREATED').toUpperCase();
      if (cur !== 'CREATED' && cur !== 'NEW') return;
      if (actionLoading) return;
      void patchStatus('ACCEPTED', { preparation_time_minutes: prepMinutes }, 'auto');
    }, secs * 1000);
    return () => {
      if (autoAcceptTimerRef.current != null) {
        window.clearTimeout(autoAcceptTimerRef.current);
        autoAcceptTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOrder?.order_id, storeOpsSettings?.auto_accept_orders, storeOpsSettings?.auto_accept_time_seconds, storeOpsSettings?.show_floating_orders]);

  if (typeof document === 'undefined') return null;

  const portal = (node: React.ReactNode) => createPortal(node, document.body);

  return (
    <>
      {modalOrder &&
        !rejectOpen &&
        portal(
          <div
            className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-2 backdrop-blur-[2px] sm:items-start sm:justify-center sm:px-4 sm:pb-4 sm:pt-[4.75rem]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="partner-incoming-title"
          >
            <div className="flex max-h-[min(88dvh,calc(100dvh-5.5rem))] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[min(82dvh,calc(100dvh-6.5rem))] sm:rounded-2xl">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-4 py-2">
                <h2 id="partner-incoming-title" className="text-base font-bold text-gray-900">
                  1 new order
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                    onClick={() => persistMute(!muted)}
                    aria-label={muted ? 'Unmute' : 'Mute'}
                  >
                    {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    {muted ? 'Unmute' : 'Mute'}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                    aria-label="Close"
                    onClick={close}
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="shrink-0 bg-violet-100 px-4 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.1em] text-violet-900">
                GatiMitra delivery
                {modalOrder.order_type ? (
                  <span className="ml-1.5 font-semibold normal-case tracking-normal text-violet-800/90">
                    · {String(modalOrder.order_type).replace(/_/g, ' ')}
                  </span>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2.5 sm:px-5">
                <div className="flex items-start justify-between gap-2">
                  <MiniOrderId
                    formattedOrderId={modalOrder.formatted_order_id}
                    fallbackOrderId={modalOrder.order_id}
                  />
                  <span className="text-xs font-medium text-gray-600">
                    {new Date(modalOrder.created_at).toLocaleTimeString('en-IN', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <p className="mt-1.5 text-sm text-gray-800">
                  {modalOrder.customer_name ? (
                    <span className="font-semibold text-gray-900">
                      {(() => {
                        const n = Number((modalOrder as any).customer_order_count ?? 0);
                        if (Number.isFinite(n) && n > 0) {
                          return `${n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`} order by ${modalOrder.customer_name}`;
                        }
                        return `Order by ${modalOrder.customer_name}`;
                      })()}
                    </span>
                  ) : (
                    <span className="font-semibold text-gray-900">New customer order</span>
                  )}
                </p>

                {(() => {
                  const utensilsLabel = getUtensilsCustomerLabel(modalOrder);
                  const sendCutlery =
                    modalOrder.requires_utensils === true ||
                    (utensilsLabel != null && !/don'?t send/i.test(utensilsLabel));
                  return (
                    <div className="mt-3 flex gap-2">
                      <div
                        className={`flex w-1/2 min-w-0 items-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] font-semibold leading-tight ${
                          sendCutlery
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                            : 'border-gray-200 bg-gray-50 text-gray-600'
                        }`}
                      >
                        <UtensilsCrossed
                          size={14}
                          className={`shrink-0 ${sendCutlery ? 'text-emerald-600' : 'text-gray-500'}`}
                          aria-hidden
                        />
                        <span className="min-w-0 truncate">
                          {utensilsLabel ?? (sendCutlery ? 'Send cutlery & utensils' : "Don't send cutlery")}
                        </span>
                      </div>
                      <div className="flex w-1/2 min-w-0 items-center justify-end gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-[11px] text-gray-800">
                        <span className="font-semibold tabular-nums">
                          Total items – {itemCount}
                        </span>
                        {orderItems.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setItemsSheetOpen(true)}
                            className="shrink-0 font-bold text-blue-600 hover:underline"
                          >
                            View all
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })()}

                {isBig ? (
                  <div className="mt-3 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                    <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
                    <div>
                      <p className="text-sm font-bold text-amber-900">Big order</p>
                      <p className="mt-0.5 text-xs leading-snug text-amber-900/90">
                        Allow extra prep time before you accept.
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 border-t border-gray-100 pt-2.5">
                  <MerchantOrderItemsList
                    items={orderItems as NormalizedOrderLineItem[]}
                    totalItemCount={itemCount}
                    totalLineCount={orderItems.length}
                    requiresUtensils={false}
                    maxItems={MAX_PREVIEW_ITEMS}
                    compact
                    hideMoreHint
                    showUtensilsBanner={false}
                  />
                  {moreItemsCount > 0 ? (
                    <button
                      type="button"
                      className="mt-2 w-full text-center text-xs font-bold text-blue-600 hover:underline"
                      onClick={() => setItemsSheetOpen(true)}
                    >
                      +{moreItemsCount} more in list — View all
                    </button>
                  ) : null}
                  <MerchantOrderBillSummary
                    className="mt-2"
                    compact
                    items={orderItems as NormalizedOrderLineItem[]}
                    pricing={
                      modalOrder.pricing ?? {
                        subtotal: 0,
                        packaging: 0,
                        taxes: 0,
                        discount: 0,
                        total: orderTotalRs(modalOrder),
                      }
                    }
                  />
                </div>

                <div className="mt-3 border-t border-gray-100 pt-3">
                  <p className="text-xs font-semibold text-gray-900">Preparation time</p>
                  <p className="text-[10px] text-gray-500">
                    {PREP_TIME_MIN}–{maxPrepMinutes} min · shown to customer
                  </p>
                  <div className="mt-2 flex overflow-hidden rounded-lg border border-gray-300">
                    <button
                      type="button"
                      className="flex w-12 items-center justify-center border-r border-gray-300 bg-white py-2.5 text-gray-800 hover:bg-gray-50 disabled:opacity-40"
                      disabled={prepMinutes <= PREP_TIME_MIN || actionLoading}
                      onClick={() => stepPrep(-PREP_STEP_MINUTES)}
                      aria-label="Decrease preparation time"
                    >
                      <Minus size={18} />
                    </button>
                    <div className="flex flex-1 items-center justify-center bg-white py-2.5 text-center text-sm font-bold text-gray-900">
                      {prepMinutes} mins
                    </div>
                    <button
                      type="button"
                      className="flex w-12 items-center justify-center border-l border-gray-300 bg-white py-2.5 text-gray-800 hover:bg-gray-50 disabled:opacity-40"
                      disabled={prepMinutes >= maxPrepMinutes || actionLoading}
                      onClick={() => stepPrep(PREP_STEP_MINUTES)}
                      aria-label="Increase preparation time"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 gap-2 border-t border-gray-100 bg-white px-4 py-2.5">
                <button
                  type="button"
                  disabled={actionLoading}
                  className="flex-1 rounded-xl border-2 border-red-500 py-3 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  onClick={() => setRejectOpen(true)}
                >
                  Reject
                </button>
                <button
                  type="button"
                  disabled={actionLoading || secondsLeft <= 0}
                  className="relative flex-[1.35] overflow-hidden rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                  onClick={() =>
                    void patchStatus(
                      'ACCEPTED',
                      { preparation_time_minutes: prepMinutes },
                      'manual'
                    )
                  }
                >
                  <span
                    className="absolute inset-y-0 left-0 bg-orange-500/35 transition-[width] duration-1000 ease-linear"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          Math.round(
                            (1 -
                              secondsLeft /
                                Math.max(1, Math.round(acceptWindowMs / 1000))) *
                              100
                          )
                        )
                      )}%`,
                    }}
                    aria-hidden
                  />
                  <span className="relative">Accept order ({mmss})</span>
                </button>
              </div>
            </div>
          </div>
        )}

      <OrderBillSidesheet
        open={!!modalOrder && itemsSheetOpen && !rejectOpen}
        onClose={() => setItemsSheetOpen(false)}
        order={modalOrder}
        pricing={incomingOrderPricing}
        lineSum={incomingOrderLineSum}
        allItemsOnly
      />

      <RejectOrderSidesheet
        open={!!modalOrder && rejectOpen}
        order={modalOrder}
        loading={actionLoading}
        onClose={() => setRejectOpen(false)}
        onConfirm={async (reason) => {
          await patchStatus('CANCELLED', { rejected_reason: reason }, 'manual');
          setRejectOpen(false);
        }}
      />
    </>
  );
}

