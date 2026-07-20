'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { Lora, Poppins } from 'next/font/google';
import { X, Volume2, VolumeX, Clock, Minus, Plus, UtensilsCrossed, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
import { fetchStoreById } from '@/lib/database';
import { createClient } from '@/lib/supabase/client';
import {
  PARTNER_INCOMING_MODAL_CLOSED,
  PARTNER_INCOMING_MODAL_OPEN,
  PARTNER_INCOMING_MODAL_SUPPRESS_CLEARED,
  PARTNER_PENDING_ORDERS_REFRESH,
  clearPartnerIncomingModalSuppressed,
  isPartnerIncomingModalSuppressed,
  setPartnerIncomingModalSuppressed,
  usePartnerSelectedStore,
} from '@/lib/partner-selected-store';
import {
  readPartnerDeviceOrderAlerts,
  resolveAlertUrlFromSlots,
  volumeStepTo01,
} from '@/lib/partner-device-order-alerts';
import { resolvePartnerPipeline } from '@/lib/partner-orders-unify';
import { fetchPartnerPendingNewOrdersCount, invalidatePartnerPendingCountCache } from '@/lib/partner-pending-count-fetch';
import {
  hasShownPartnerOrderActionToast,
  markPartnerOrderActionToastShown,
  type PartnerOrderActionToastKind,
} from '@/lib/partner-order-action-toast';
import { RejectOrderSidesheet } from '@/components/orders/RejectOrderSidesheet';
import { RejectFollowUpHost, useRejectFollowUp } from '@/components/orders/RejectFollowUpHost';
import { OrderBillSidesheet } from '@/components/orders/OrderBillSidesheet';
import { MerchantOrderItemsList } from '@/components/orders/MerchantOrderItemsList';
import { MerchantOrderBillSummary } from '@/components/orders/MerchantOrderBillSummary';
import { merchantBillPartsFromItems } from '@/lib/merchant-order-item-display';
import { getUtensilsCustomerLabel } from '@/lib/orderUtensilsLabel';
import type { NormalizedOrderLineItem, OrderPricingBreakdown } from '@/lib/orderLineItems';
import { rejectReasonNeedsFollowUp } from '@/lib/merchantCancellationReasons';
import type { MerchantCancellationReason } from '@/lib/merchantCancellationReasons';
import {
  PREP_TIME_MIN,
  PREP_TIME_MAX,
  PLATFORM_DEFAULT_PREP_MINUTES,
  clampPrepMinutes,
  resolveStoreDefaultPrepMinutes,
} from '@/lib/order-prep-time';
import {
  broadcastIncomingOrderAlert,
  subscribeIncomingOrderAlert,
} from '@/lib/partner-incoming-order-broadcast';
import { partnerPreparingOrdersHref } from '@/lib/partner-orders-routes';

const incomingLora = Lora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-incoming-lora',
  display: 'swap',
});
const incomingPoppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-incoming-poppins',
  display: 'swap',
});

const PREP_STEP_MINUTES = 5;
/** Max line items in accept popup; rest via +N more → sidesheet. */
const MAX_PREVIEW_ITEMS = 3;

const MUTE_KEY = 'partner_incoming_order_mute_sound';
const DEFAULT_ALERT_SOUND = '/notification.wav';

function isIncomingSoundMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}
const FALLBACK_POLL_MS = 15_000;
const OPEN_ORDER_SYNC_MS = 2_500;
const FALLBACK_SCAN_LIMIT = 12;
const DISMISS_KEY = 'partner_incoming_order_dismissed_v1';

function isPartnerIncomingPending(row: OrdersFoodRow | null): boolean {
  if (!row) return false;
  const ext = row as OrdersFoodRow & { core_status?: string; current_status?: string | null };
  const st = resolvePartnerPipeline(
    row.order_status,
    ext.core_status ?? 'assigned',
    ext.current_status ?? null
  );
  return st === 'CREATED';
}

function isInvalidOrderTransitionError(message: string): boolean {
  return /invalid transition/i.test(message);
}

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


function isBulkOrderFlag(order: OrdersFoodRow | null): boolean {
  if (!order) return false;
  const anyOrder = order as unknown as Record<string, unknown>;
  return anyOrder.is_bulk_order === true || anyOrder.isBulkOrder === true;
}

function sortOrdersFifo(orders: OrdersFoodRow[]): OrdersFoodRow[] {
  return [...orders].sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    if (ta !== tb) return ta - tb;
    return Number(a.order_id) - Number(b.order_id);
  });
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
      if (isIncomingSoundMuted()) break;
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
  if (isIncomingSoundMuted()) return false;
  const d = readPartnerDeviceOrderAlerts(storeId);
  if (!d.orderAlertsEnabled || !d.soundAlertsEnabled) return false;
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
      <span className="incoming-num text-[1.15rem] font-extrabold tracking-wide text-stone-900">
        <span>{prefix}</span>
        <span className="px-0.5" aria-hidden />
        <span className="text-orange-600">{last4}</span>
      </span>
    );
  }
  return (
    <span className="incoming-num text-[1.15rem] font-extrabold tracking-wide text-stone-900">
      #{fallbackOrderId}
    </span>
  );
}

/**
 * Global overlay: new store orders (orders_core assigned, or orders_food CREATED). Partnersite only.
 */
export function PartnerIncomingOrderModal({ restaurantId }: { restaurantId?: string }) {
  const router = useRouter();
  const pathname = usePathname() || '';
  const { storeId, storeInternalId, ready: storeReady } = usePartnerSelectedStore(restaurantId);
  const [muted, setMuted] = useState(false);
  /** FIFO queue: oldest pending order is index 0. The merchant can page through with the pager. */
  const [queue, setQueue] = useState<OrdersFoodRow[]>([]);
  /** Which queued order the merchant is currently viewing / acting on. */
  const [viewIndex, setViewIndex] = useState(0);
  const viewIndexRef = useRef(0);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [itemsSheetOpen, setItemsSheetOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [settings, setSettings] = useState<AcceptanceSettings>(DEFAULT_SETTINGS);
  /** Dedupe by orders_core.id */
  const shownInsertIds = useRef<Set<string>>(new Set());
  /** In-memory dismiss set — avoids race when X is clicked before React state/ref sync. */
  const dismissedOrderIdsRef = useRef<Set<number>>(new Set());
  const hydrateBusyRef = useRef(false);
  const menuIdHydrateAttemptedRef = useRef<Set<number>>(new Set());
  const chimeRunIdRef = useRef(0);
  const chimeAudioRef = useRef<HTMLAudioElement | null>(null);
  const soundPlayedForOrderRef = useRef<Set<number>>(new Set());
  const [prepMinutes, setPrepMinutes] = useState(PLATFORM_DEFAULT_PREP_MINUTES);
  const [maxPrepMinutes, setMaxPrepMinutes] = useState(PREP_TIME_MAX);
  const [storeDisplayName, setStoreDisplayName] = useState('');
  const storeDefaultPrepRef = useRef(PLATFORM_DEFAULT_PREP_MINUTES);
  const queueRef = useRef<OrdersFoodRow[]>([]);
  const modalOrderRef = useRef<OrdersFoodRow | null>(null);
  const closeModalRef = useRef<() => void>(() => {});
  const { followUp, beginFollowUp, dismissFollowUp, setFollowUp } = useRejectFollowUp();

  const pendingCount = queue.length;
  /** Clamp the view index into the queue so it never points past the end. */
  const activeIndex = pendingCount ? Math.min(Math.max(0, viewIndex), pendingCount - 1) : 0;
  const modalOrder = queue[activeIndex] ?? null;

  /** Viewed order for a given queue + index (used to keep the sync/realtime ref in step). */
  const clampIndex = (len: number, idx: number) => (len ? Math.min(Math.max(0, idx), len - 1) : 0);

  useEffect(() => {
    queueRef.current = queue;
    const i = clampIndex(queue.length, viewIndex);
    viewIndexRef.current = i;
    modalOrderRef.current = queue[i] ?? null;
    if (i !== viewIndex) setViewIndex(i);
  }, [queue, viewIndex]);

  const upsertOrderInQueue = useCallback((full: OrdersFoodRow) => {
    const prev = queueRef.current;
    const viewedId = prev[clampIndex(prev.length, viewIndexRef.current)]?.order_id;
    const idx = prev.findIndex((o) => Number(o.order_id) === Number(full.order_id));
    const next =
      idx < 0
        ? sortOrdersFifo([...prev, full])
        : sortOrdersFifo(prev.map((o, i) => (i === idx ? full : o)));
    // Keep viewing the same order even if the FIFO re-sort shifted its index.
    let i = next.findIndex((o) => Number(o.order_id) === Number(viewedId));
    if (i < 0) i = clampIndex(next.length, viewIndexRef.current);
    queueRef.current = next;
    viewIndexRef.current = i;
    modalOrderRef.current = next[i] ?? null;
    setQueue(next);
    setViewIndex(i);
  }, []);

  /** Remove one order from the queue by id (accept/reject/remote status change), keeping the pager sane. */
  const removeOrderFromQueueById = useCallback((orderId: number) => {
    const prev = queueRef.current;
    const viewedId = prev[clampIndex(prev.length, viewIndexRef.current)]?.order_id;
    const next = prev.filter((o) => Number(o.order_id) !== Number(orderId));
    if (next.length === prev.length) return;
    // Preserve the viewed order when it wasn't the one removed.
    let i = next.findIndex((o) => Number(o.order_id) === Number(viewedId));
    if (i < 0) i = clampIndex(next.length, viewIndexRef.current);
    queueRef.current = next;
    viewIndexRef.current = i;
    modalOrderRef.current = next[i] ?? null;
    setQueue(next);
    setViewIndex(i);
    if (next.length === 0 && typeof window !== 'undefined') {
      invalidatePartnerPendingCountCache();
      window.dispatchEvent(new CustomEvent(PARTNER_INCOMING_MODAL_CLOSED));
      window.dispatchEvent(new CustomEvent(PARTNER_PENDING_ORDERS_REFRESH));
    }
  }, []);

  const goToOrder = useCallback((delta: number) => {
    setViewIndex((i) => clampIndex(queueRef.current.length, i + delta));
  }, []);

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
    const id = Number(orderId);
    if (!Number.isFinite(id)) return;
    dismissedOrderIdsRef.current.add(id);
    if (typeof window === 'undefined') return;
    try {
      const prev = getDismissed();
      prev.add(id);
      const arr = Array.from(prev).map((oid) => ({ order_id: oid, t: Date.now() }));
      localStorage.setItem(DISMISS_KEY, JSON.stringify(arr.slice(-200)));
    } catch {
      /* ignore */
    }
  };

  const isOrderDismissed = useCallback((orderId: number) => {
    const id = Number(orderId);
    if (!Number.isFinite(id)) return false;
    if (dismissedOrderIdsRef.current.has(id)) return true;
    return getDismissed().has(id);
  }, []);

  useEffect(() => {
    for (const id of getDismissed()) {
      dismissedOrderIdsRef.current.add(id);
    }
  }, []);

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
        if (!res.ok) return;
        const maxPrep =
          typeof data.max_preparation_time_minutes === 'number' && data.max_preparation_time_minutes >= PREP_TIME_MIN
            ? Math.min(PREP_TIME_MAX, Math.floor(data.max_preparation_time_minutes))
            : PREP_TIME_MAX;
        setMaxPrepMinutes(maxPrep);
      } catch {
        /* non-fatal */
      }
    })();
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    void (async () => {
      const s = await fetchStoreById(storeId);
      setStoreDisplayName(String(s?.store_name ?? storeId));
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
    const missingMenuIds =
      itemsArr.length > 0 &&
      itemsArr.every((it) => {
        const id = (it as NormalizedOrderLineItem).menuItemId;
        return id == null || !Number.isFinite(Number(id));
      });
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
      }) ||
      (missingMenuIds && !menuIdHydrateAttemptedRef.current.has(modalOrder.order_id));
    if (!needsHydrate) return;
    if (hydrateBusyRef.current) return;
    if (missingMenuIds) menuIdHydrateAttemptedRef.current.add(modalOrder.order_id);
    hydrateBusyRef.current = true;
    void (async () => {
      try {
        const full = await fetchByCoreId(modalOrder.order_id);
        if (full) upsertOrderInQueue(full);
      } finally {
        hydrateBusyRef.current = false;
      }
    })();
  }, [storeId, modalOrder?.order_id, fetchByCoreId, upsertOrderInQueue]);

  const playIncomingAlert = useCallback(
    (orderId: number) => {
      if (soundPlayedForOrderRef.current.has(orderId)) return;
      soundPlayedForOrderRef.current.add(orderId);
      if (!shouldPlayIncomingSound(storeId) || !settings.alert_sound_enabled) return;
      const device = readPartnerDeviceOrderAlerts(storeId);
      const slots =
        settings.alert_sound_urls_by_slot ??
        ([settings.alert_sound_url, null, null] as [string | null, string | null, string | null]);
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
    },
    [
      storeId,
      settings.alert_sound_enabled,
      settings.alert_sound_repeat_count,
      settings.alert_sound_url,
      settings.alert_sound_urls_by_slot,
    ]
  );

  const openIfNew = useCallback(
    async (full: OrdersFoodRow | null, opts?: { skipBroadcast?: boolean }) => {
      if (!full) return;
      const coreOrderId = Number(full.order_id);
      if (!Number.isFinite(coreOrderId)) return;
      if (isOrderDismissed(coreOrderId)) return;
      const ext = full as OrdersFoodRow & { core_status?: string; current_status?: string | null };
      const fst = resolvePartnerPipeline(
        full.order_status,
        ext.core_status ?? 'assigned',
        ext.current_status ?? null
      );
      if (fst !== 'CREATED') return;

      const dedupeKey = `o:${full.order_id}`;

      // X parks auto-popup until floating bar; still allow reopen after suppress clear.
      if (storeId && isPartnerIncomingModalSuppressed(storeId)) {
        return;
      }

      // Already in queue — refresh row data; keep FIFO position (re-sort by created_at).
      if (queueRef.current.some((o) => Number(o.order_id) === coreOrderId)) {
        upsertOrderInQueue(full);
        return;
      }

      const acceptWindowMs = Math.max(
        60_000,
        Math.max(1, Math.min(180, Number(settings.acceptance_window_minutes || 5))) * 60_000
      );
      const snapDeadline = full.merchant_response_deadline_at
        ? new Date(full.merchant_response_deadline_at).getTime()
        : NaN;
      const deadlineMs = Number.isFinite(snapDeadline)
        ? snapDeadline
        : new Date(full.created_at).getTime() + acceptWindowMs;
      // Past snapshotted deadline: do not open UI and do not client-cancel.
      // Backend cron (or sync-acceptance-timeout) is the sole auto-cancel authority.
      if (Number.isFinite(deadlineMs) && Date.now() >= deadlineMs) {
        return;
      }

      if (shownInsertIds.current.has(dedupeKey)) return;
      shownInsertIds.current.add(dedupeKey);

      const wasEmpty = queueRef.current.length === 0;
      upsertOrderInQueue(full);
      if (typeof window !== 'undefined' && wasEmpty) {
        window.dispatchEvent(new CustomEvent(PARTNER_INCOMING_MODAL_OPEN));
      }
      playIncomingAlert(full.order_id);
      if (!opts?.skipBroadcast && storeId) {
        broadcastIncomingOrderAlert({
          storeId,
          orderId: full.order_id,
          ts: Date.now(),
        });
      }
    },
    [
      storeId,
      settings.acceptance_window_minutes,
      playIncomingAlert,
      isOrderDismissed,
      upsertOrderInQueue,
    ]
  );

  const scanForNewOrders = useCallback(async () => {
    if (!storeId || !storeReady) return;
  // Don't bail on suppress here — openIfNew / suppress-clear handles reopen.
  // (Previously early-return blocked rescans after floating-bar clear races.)
  try {
      const pending = await fetchPartnerPendingNewOrdersCount(storeId);
      if (pending == null || pending <= 0) return;

      const res = await fetch(
        `/api/food-orders?store_id=${encodeURIComponent(storeId)}&limit=${FALLBACK_SCAN_LIMIT}&skip_compensation=1`
      );
      const text = await res.text();
      let data: { orders?: OrdersFoodRow[] } = {};
      if (text.trim()) {
        try {
          data = JSON.parse(text) as { orders?: OrdersFoodRow[] };
        } catch {
          return;
        }
      }
      if (!res.ok || !Array.isArray(data.orders)) return;
      const created = sortOrdersFifo(
        data.orders.filter((o) => {
          const coreOrderId = Number(o.order_id);
          if (!Number.isFinite(coreOrderId) || isOrderDismissed(coreOrderId)) return false;
          const ext = o as OrdersFoodRow & { core_status?: string; current_status?: string | null };
          const st = resolvePartnerPipeline(
            o.order_status,
            ext.core_status ?? 'assigned',
            ext.current_status ?? null
          );
          return st === 'CREATED';
        })
      );
      for (const row of created) {
        await openIfNew(row);
      }
    } catch {
      /* ignore */
    }
  }, [storeId, storeReady, openIfNew, isOrderDismissed]);

  const scanForNewOrdersRef = useRef(scanForNewOrders);
  scanForNewOrdersRef.current = scanForNewOrders;
  const openIfNewRef = useRef(openIfNew);
  openIfNewRef.current = openIfNew;

  useEffect(() => {
    if (!storeId || !storeReady) return;
    return subscribeIncomingOrderAlert((payload) => {
      if (payload.storeId !== storeId) return;
      void (async () => {
        const full = await fetchByCoreId(payload.orderId);
        await openIfNewRef.current(full, { skipBroadcast: true });
      })();
    });
  }, [storeId, storeReady, fetchByCoreId]);

  useEffect(() => {
    if (!storeReady || !storeId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void scanForNewOrdersRef.current();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [storeReady, storeId]);

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
          const coreId = Number(row.id);
          // Any queued order that leaves 'assigned' (accepted/cancelled here or elsewhere)
          // is dropped from the pager — not just the one being viewed.
          if (
            Number.isFinite(coreId) &&
            nextStatus !== 'assigned' &&
            queueRef.current.some((o) => Number(o.order_id) === coreId)
          ) {
            removeOrderFromQueueById(coreId);
            return;
          }
          // Some flows create the row first, then UPDATE to assigned — handle both.
          if (nextStatus !== 'assigned') return;
          if (prevStatus === 'assigned') return;
          if (!Number.isFinite(coreId)) return;
          void (async () => {
            const full = await fetchByCoreId(coreId);
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
          const row = payload.new as { id?: number; order_id?: number; order_status?: string };
          const prev = payload.old as { order_status?: string } | null;
          const prevSt = resolvePartnerPipeline(prev?.order_status ?? null, 'assigned', null);
          const st = resolvePartnerPipeline(row.order_status, 'assigned', null);
          if (st !== 'CREATED') {
            const rowFoodId = Number(row.id);
            const rowCoreId = Number(row.order_id);
            const match = queueRef.current.find(
              (o) =>
                (Number.isFinite(rowFoodId) && rowFoodId === Number(o.id)) ||
                (Number.isFinite(rowCoreId) && rowCoreId === Number(o.order_id))
            );
            if (match) removeOrderFromQueueById(Number(match.order_id));
            return;
          }
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
  }, [storeId, storeInternalId, storeReady, fetchByCoreId, fetchByFoodRow, openIfNew, removeOrderFromQueueById]);

  useEffect(() => {
    if (!storeReady || !storeId) return;
    let cancelled = false;
    void (async () => {
      try {
        const pending = await fetchPartnerPendingNewOrdersCount(storeId);
        if (cancelled) return;
        // After hard refresh / store switch: don't leave CREATED orders trapped behind X-suppress.
        if (pending != null && pending > 0 && isPartnerIncomingModalSuppressed(storeId)) {
          clearPartnerIncomingModalSuppressed(storeId);
          shownInsertIds.current.clear();
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) void scanForNewOrders();
    })();
    const t = window.setInterval(() => void scanForNewOrders(), FALLBACK_POLL_MS);
    const onRescan = () => void scanForNewOrders();
    const onSuppressCleared = () => {
      shownInsertIds.current.clear();
      void scanForNewOrders();
    };
    window.addEventListener('partner-incoming-order-rescan', onRescan);
    window.addEventListener(PARTNER_INCOMING_MODAL_SUPPRESS_CLEARED, onSuppressCleared);
    return () => {
      cancelled = true;
      window.clearInterval(t);
      window.removeEventListener('partner-incoming-order-rescan', onRescan);
      window.removeEventListener(PARTNER_INCOMING_MODAL_SUPPRESS_CLEARED, onSuppressCleared);
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
    const fromBackend = modalOrder.merchant_response_deadline_at;
    if (fromBackend) {
      const t = new Date(fromBackend).getTime();
      if (Number.isFinite(t)) return t;
    }
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
    // Deterministic merchant bill: item subtotal (Boost/BOGO-adjusted nets) + packaging
    // − frozen orders_core.merchant_precision_discount (SSOT), subtracted exactly once.
    // We pass total:0 so merchantBillPartsFromItems recomputes from items rather than
    // reusing any pre-existing total, guaranteeing a single subtraction.
    const precision = Math.max(0, Number(modalOrder.merchant_precision_discount) || 0);
    const packaging = Number(modalOrder.pricing?.packaging) || 0;
    const bill = merchantBillPartsFromItems(
      (Array.isArray(modalOrder.items) ? modalOrder.items : []) as NormalizedOrderLineItem[],
      { subtotal: incomingOrderLineSum, packaging, discount: precision, total: 0 }
    );
    return {
      subtotal: bill.itemsSubtotal,
      packaging: bill.packaging,
      taxes: 0,
      discount: bill.discount,
      total: bill.total,
    };
  }, [modalOrder, incomingOrderLineSum]);
  const moreItemsCount = Math.max(0, orderItems.length - MAX_PREVIEW_ITEMS);

  useEffect(() => {
    setItemsSheetOpen(false);
  }, [modalOrder?.order_id]);

  const persistMute = (v: boolean) => {
    setMuted(v);
    try {
      localStorage.setItem(MUTE_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (v) {
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
    }
  };

  const stopChime = () => {
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
  };

  /** Close the whole stack (X / suppress). */
  const finishModal = (opts?: { userDismissed?: boolean }) => {
    const closedIds = queueRef.current.map((o) => o.order_id);
    stopChime();
    if (opts?.userDismissed) {
      // X: park modal only — do NOT permanently dismiss pending CREATED orders.
      // Floating bar / suppress-clear must be able to reopen them.
      if (storeId) setPartnerIncomingModalSuppressed(storeId);
      for (const id of closedIds) {
        shownInsertIds.current.delete(`o:${id}`);
      }
    } else {
      for (const id of closedIds) addDismissed(id);
    }
    queueRef.current = [];
    modalOrderRef.current = null;
    setQueue([]);
    setRejectOpen(false);
    setItemsSheetOpen(false);
    if (typeof window !== 'undefined') {
      invalidatePartnerPendingCountCache();
      window.dispatchEvent(new CustomEvent(PARTNER_INCOMING_MODAL_CLOSED));
      window.dispatchEvent(new CustomEvent(PARTNER_PENDING_ORDERS_REFRESH));
    }
    if (!opts?.userDismissed) {
      queueMicrotask(() => void scanForNewOrdersRef.current());
    }
  };

  /** After accept/reject (or dismiss): drop the VIEWED card, show a neighbour, or close if empty. */
  const advanceOrClose = (opts?: { markDismissed?: boolean }) => {
    const markDismissed = opts?.markDismissed !== false;
    const prev = queueRef.current;
    const idx = clampIndex(prev.length, viewIndexRef.current);
    const current = prev[idx];
    if (current && markDismissed) addDismissed(current.order_id);
    if (current && !markDismissed) {
      shownInsertIds.current.delete(`o:${current.order_id}`);
    }
    stopChime();
    const next = current
      ? prev.filter((o) => Number(o.order_id) !== Number(current.order_id))
      : prev.slice(1);
    const newIdx = clampIndex(next.length, idx);
    queueRef.current = next;
    viewIndexRef.current = newIdx;
    modalOrderRef.current = next[newIdx] ?? null;
    setQueue(next);
    setViewIndex(newIdx);
    setRejectOpen(false);
    setItemsSheetOpen(false);
    if (typeof window !== 'undefined') {
      invalidatePartnerPendingCountCache();
      window.dispatchEvent(new CustomEvent(PARTNER_PENDING_ORDERS_REFRESH));
    }
    if (next.length === 0) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(PARTNER_INCOMING_MODAL_CLOSED));
      }
      queueMicrotask(() => void scanForNewOrdersRef.current());
      return;
    }
    // Keep modal open for the next oldest order.
  };

  const close = () => advanceOrClose({ markDismissed: true });
  /** X: dismiss only the front card; show next if more are queued. */
  const dismissByUser = () => {
    if (queueRef.current.length > 1) {
      advanceOrClose({ markDismissed: false });
      return;
    }
    finishModal({ userDismissed: true });
  };

  closeModalRef.current = close;

  const syncOpenModalOrder = useCallback(async () => {
    const open = modalOrderRef.current;
    if (!storeId || !open) return;
    if (isOrderDismissed(open.order_id)) {
      closeModalRef.current();
      return;
    }
    try {
      const snapDeadline = open.merchant_response_deadline_at
        ? new Date(open.merchant_response_deadline_at).getTime()
        : NaN;
      const fallbackDeadline = new Date(open.created_at).getTime() + acceptWindowMs;
      const deadline = Number.isFinite(snapDeadline) ? snapDeadline : fallbackDeadline;
      if (Number.isFinite(deadline) && Date.now() >= deadline) {
        try {
          await fetch(
            `/api/merchant/sync-acceptance-timeout?store_id=${encodeURIComponent(storeId)}`,
            { method: 'POST', credentials: 'include', cache: 'no-store' }
          );
        } catch {
          /* backend cron owns cancel */
        }
      }

      const full = await fetchByCoreId(open.order_id);
      // Close ONLY on a definitive state: the order was fetched and is no longer
      // pending (accepted / rejected / cancelled). A transient null (network blip,
      // slow API) must NOT close the modal — the next sync tick retries. This
      // mirrors the Merchant App, which also never closes on transient absence.
      if (full && !isPartnerIncomingPending(full)) {
        closeModalRef.current();
        return;
      }
      if (!full) return;
      if (isOrderDismissed(open.order_id)) {
        closeModalRef.current();
        return;
      }
      upsertOrderInQueue(full);
    } catch {
      /* ignore */
    }
  }, [storeId, fetchByCoreId, isOrderDismissed, upsertOrderInQueue, acceptWindowMs]);

  const fuseExpired = Boolean(modalOrder) && secondsLeft <= 0;

  useEffect(() => {
    if (!modalOrder || !storeId) return;
    void syncOpenModalOrder();
    const intervalMs = fuseExpired ? 1_200 : OPEN_ORDER_SYNC_MS;
    const t = window.setInterval(() => void syncOpenModalOrder(), intervalMs);
    const onRefresh = () => void syncOpenModalOrder();
    window.addEventListener(PARTNER_PENDING_ORDERS_REFRESH, onRefresh);
    window.addEventListener('partner-incoming-order-rescan', onRefresh);
    return () => {
      window.clearInterval(t);
      window.removeEventListener(PARTNER_PENDING_ORDERS_REFRESH, onRefresh);
      window.removeEventListener('partner-incoming-order-rescan', onRefresh);
    };
  }, [modalOrder?.order_id, storeId, syncOpenModalOrder, fuseExpired]);

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
    mode: 'auto' | 'manual' = 'manual',
    opts?: { closeAfter?: boolean }
  ) => {
    if (!storeId || !modalOrder) return;
    const orderIdForToast = modalOrder.order_id;
    const closeAfter = opts?.closeAfter !== false;
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
        const errMsg = err.error || 'Update failed';
        console.debug('[partner-incoming-modal] PATCH failed', {
          url,
          httpStatus: res.status,
          err,
          payload,
        });
        if (closeAfter && isInvalidOrderTransitionError(errMsg)) {
          close();
          return;
        }
        throw new Error(errMsg);
      }
      console.debug('[partner-incoming-modal] PATCH ok', { url, httpStatus: res.status });
      showOrderActionToast(status === 'ACCEPTED' ? 'accepted' : 'rejected', orderIdForToast);
      window.dispatchEvent(new CustomEvent(PARTNER_PENDING_ORDERS_REFRESH));
      if (closeAfter) {
        const moreWaiting = queueRef.current.length > 1;
        close();
        if (status === 'ACCEPTED' && !moreWaiting) {
          router.push(partnerPreparingOrdersHref(pathname, storeId));
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.debug('[partner-incoming-modal] PATCH exception', {
        message: msg,
        status,
      });
      if (closeAfter && isInvalidOrderTransitionError(msg)) {
        close();
        return;
      }
      toast.error(msg || 'Could not update order');
    } finally {
      setActionLoading(false);
    }
  };

  if (typeof document === 'undefined') return null;

  const portal = (node: React.ReactNode) => createPortal(node, document.body);

  return (
    <>
      {modalOrder && !rejectOpen
        ? portal(
            <div
              className={`${incomingLora.variable} ${incomingPoppins.variable} partner-incoming-modal fixed inset-0 z-[110] flex items-end justify-center bg-stone-950/55 p-2 backdrop-blur-[3px] sm:items-start sm:justify-center sm:px-4 sm:pb-4 sm:pt-[4.75rem]`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="partner-incoming-title"
            >
              <div
                className={`relative w-full max-w-2xl ${
                  pendingCount > 2 ? 'pb-[8%]' : pendingCount > 1 ? 'pb-[5%]' : ''
                }`}
              >
                {pendingCount > 2 ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-3 bottom-0 top-3 z-0 rounded-2xl bg-white/70 shadow-md ring-1 ring-stone-900/10"
                  />
                ) : null}
                {pendingCount > 1 ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-1.5 bottom-0 top-1.5 z-[1] rounded-2xl bg-white shadow-lg ring-1 ring-stone-900/10"
                  />
                ) : null}
                <div className="relative z-10 flex max-h-[min(88dvh,calc(100dvh-5rem))] w-full min-h-0 flex-col overflow-hidden rounded-t-[1.25rem] bg-[#fafaf9] shadow-[0_24px_64px_rgba(28,25,23,0.28)] ring-1 ring-stone-900/10 sm:max-h-[min(85dvh,calc(100dvh-6rem))] sm:rounded-[1.25rem]">
                  {/* Header */}
                  <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-200/80 bg-white px-4 py-2.5 sm:px-5">
                    <div className="min-w-0">
                      <h2
                        id="partner-incoming-title"
                        className="text-[15px] font-semibold tracking-tight text-stone-900"
                      >
                        {pendingCount === 1 ? '1 new order' : `${pendingCount} new orders`}
                      </h2>
                      <p className="incoming-num mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                        GatiMitra delivery
                        {modalOrder.order_type
                          ? ` · ${String(modalOrder.order_type).replace(/_/g, ' ')}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-stone-600 hover:bg-stone-100"
                        onClick={() => persistMute(!muted)}
                        aria-label={muted ? 'Unmute' : 'Mute'}
                      >
                        {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                        {muted ? 'Unmute' : 'Mute'}
                      </button>
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"
                        aria-label="Close"
                        onClick={dismissByUser}
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Pager: move between multiple pending orders and act on the one shown. */}
                  {pendingCount > 1 ? (
                    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-200/80 bg-stone-50/80 px-2.5 py-1.5 sm:px-4">
                      <button
                        type="button"
                        onClick={() => goToOrder(-1)}
                        disabled={activeIndex <= 0}
                        aria-label="Previous order"
                        className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] font-semibold text-stone-700 transition hover:bg-stone-200/70 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <ChevronLeft size={17} />
                        <span className="hidden sm:inline">Prev</span>
                      </button>
                      <div className="flex min-w-0 flex-col items-center">
                        <span className="incoming-num text-[11px] font-bold uppercase tracking-wide text-stone-600">
                          Order {activeIndex + 1} of {pendingCount}
                        </span>
                        <div className="mt-1 flex items-center gap-1.5">
                          {queue.map((o, i) => (
                            <button
                              key={o.order_id}
                              type="button"
                              aria-label={`Go to order ${i + 1}`}
                              aria-current={i === activeIndex}
                              onClick={() => setViewIndex(i)}
                              className={`h-1.5 rounded-full transition-all ${
                                i === activeIndex
                                  ? 'w-4 bg-emerald-600'
                                  : 'w-1.5 bg-stone-300 hover:bg-stone-400'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => goToOrder(1)}
                        disabled={activeIndex >= pendingCount - 1}
                        aria-label="Next order"
                        className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] font-semibold text-stone-700 transition hover:bg-stone-200/70 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <span className="hidden sm:inline">Next</span>
                        <ChevronRight size={17} />
                      </button>
                    </div>
                  ) : null}

                  {/* Body grows with content; scrolls only when over max-h — no empty flex gap */}
                  <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pt-2.5 sm:px-5">
                    <div className="flex items-baseline justify-between gap-2">
                      <MiniOrderId
                        formattedOrderId={modalOrder.formatted_order_id}
                        fallbackOrderId={modalOrder.order_id}
                      />
                      <span className="incoming-num shrink-0 text-[11px] font-semibold text-stone-500">
                        {new Date(modalOrder.created_at).toLocaleTimeString('en-IN', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <p className="mt-1 text-[13px] leading-snug text-stone-700">
                      {modalOrder.customer_name ? (
                        <span className="font-medium text-stone-900">
                          {(() => {
                            const n = Number((modalOrder as any).customer_order_count ?? 0);
                            if (Number.isFinite(n) && n > 0) {
                              return `${n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`} order by ${modalOrder.customer_name}`;
                            }
                            return `Order by ${modalOrder.customer_name}`;
                          })()}
                        </span>
                      ) : (
                        <span className="font-medium text-stone-900">New customer order</span>
                      )}
                    </p>

                    {(() => {
                      const utensilsLabel = getUtensilsCustomerLabel(modalOrder);
                      const sendCutlery =
                        modalOrder.requires_utensils === true ||
                        (utensilsLabel != null && !/don'?t send/i.test(utensilsLabel));
                      return (
                        <div className="mt-2 flex items-center gap-2">
                          <div
                            className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium leading-tight ${
                              sendCutlery
                                ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80'
                                : 'bg-stone-100 text-stone-600 ring-1 ring-stone-200/80'
                            }`}
                          >
                            <UtensilsCrossed
                              size={13}
                              className={`shrink-0 ${sendCutlery ? 'text-emerald-600' : 'text-stone-500'}`}
                              aria-hidden
                            />
                            <span className="min-w-0 truncate">
                              {utensilsLabel ??
                                (sendCutlery ? 'Send cutlery & utensils' : "Don't send cutlery")}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[11px] text-stone-700 ring-1 ring-stone-200/80">
                            <span className="incoming-num font-semibold">
                              {itemCount} item{itemCount === 1 ? '' : 's'}
                            </span>
                            {orderItems.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => setItemsSheetOpen(true)}
                                className="font-semibold text-emerald-700 hover:underline"
                              >
                                View all
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })()}

                    {isBig ? (
                      <div className="mt-2 flex gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 ring-1 ring-amber-200/80">
                        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
                        <div>
                          <p className="text-[12px] font-semibold text-amber-950">Big order</p>
                          <p className="text-[11px] leading-snug text-amber-900/85">
                            Allow extra prep time before you accept.
                          </p>
                        </div>
                      </div>
                    ) : null}

                    <div className="incoming-items mt-2 pb-2">
                      <MerchantOrderItemsList
                        items={orderItems as NormalizedOrderLineItem[]}
                        totalItemCount={itemCount}
                        totalLineCount={orderItems.length}
                        requiresUtensils={false}
                        maxItems={MAX_PREVIEW_ITEMS}
                        compact
                        hideMoreHint
                        showUtensilsBanner={false}
                        className="!border-0"
                      />
                    </div>
                    {moreItemsCount > 0 ? (
                      <button
                        type="button"
                        className="mb-2 w-full text-center text-[11px] font-semibold text-emerald-700 hover:underline"
                        onClick={() => setItemsSheetOpen(true)}
                      >
                        +{moreItemsCount} more — View all
                      </button>
                    ) : null}
                  </div>

                  {/* Fixed footer: bill → prep → actions */}
                  <div className="shrink-0 border-t border-stone-200/80 bg-white">
                    <div className="space-y-2 px-4 pt-2.5 sm:px-5">
                      <MerchantOrderBillSummary
                        compact
                        items={orderItems as NormalizedOrderLineItem[]}
                        pricing={incomingOrderPricing}
                        discountLabel="Merchant Precision Discount"
                      />

                      <div className="flex items-center gap-3 rounded-xl bg-stone-50 px-3 py-2 ring-1 ring-stone-200/80">
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-semibold leading-tight text-stone-900">
                            Preparation time
                          </p>
                          <p className="incoming-num mt-0.5 text-[10px] font-medium leading-tight text-stone-500">
                            {PREP_TIME_MIN}–{maxPrepMinutes} min · customer sees this
                          </p>
                        </div>
                        <div className="flex shrink-0 items-stretch overflow-hidden rounded-lg bg-white ring-1 ring-stone-200">
                          <button
                            type="button"
                            className="flex h-9 w-9 items-center justify-center border-r border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                            disabled={prepMinutes <= PREP_TIME_MIN || actionLoading}
                            onClick={() => stepPrep(-PREP_STEP_MINUTES)}
                            aria-label="Decrease preparation time"
                          >
                            <Minus size={15} />
                          </button>
                          <div className="incoming-num flex h-9 min-w-[3.5rem] items-center justify-center px-2 text-center text-[13px] font-bold tabular-nums text-stone-900">
                            {prepMinutes}m
                          </div>
                          <button
                            type="button"
                            className="flex h-9 w-9 items-center justify-center border-l border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                            disabled={prepMinutes >= maxPrepMinutes || actionLoading}
                            onClick={() => stepPrep(PREP_STEP_MINUTES)}
                            aria-label="Increase preparation time"
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 flex gap-2 px-4 pb-3 pt-1.5 sm:px-5">
                      <button
                        type="button"
                        disabled={actionLoading}
                        className="flex-1 rounded-xl border border-red-300 bg-white py-2.5 text-[13px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        onClick={() => setRejectOpen(true)}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={actionLoading || secondsLeft <= 0}
                        className="relative flex-[1.45] overflow-hidden rounded-xl bg-emerald-600 py-2.5 text-[13px] font-semibold text-white shadow-sm shadow-emerald-900/15 hover:bg-emerald-700 disabled:opacity-50"
                        onClick={() =>
                          void patchStatus(
                            'ACCEPTED',
                            { preparation_time_minutes: prepMinutes },
                            'manual'
                          )
                        }
                      >
                        <span
                          className="absolute inset-y-0 left-0 bg-orange-500/40 transition-[width] duration-1000 ease-linear"
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
                        <span className="incoming-num relative">
                          Accept order ({mmss})
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        : null}

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
        onConfirm={async (reason: MerchantCancellationReason) => {
          const snap = modalOrder;
          if (!snap || !storeId) return;
          setRejectOpen(false);
          if (rejectReasonNeedsFollowUp(reason)) {
            const items = (Array.isArray(snap.items) ? snap.items : []) as NormalizedOrderLineItem[];
            beginFollowUp(reason, {
              storeId,
              storeName: storeDisplayName || storeId,
              lineItems: items,
              finalizeReject: async () => {
                await patchStatus('CANCELLED', { rejected_reason: reason }, 'manual');
              },
            });
            return;
          }
          await patchStatus('CANCELLED', { rejected_reason: reason }, 'manual');
        }}
      />

      <RejectFollowUpHost
        followUp={followUp}
        storeId={storeId ?? ''}
        onDismiss={dismissFollowUp}
        setFollowUp={setFollowUp}
      />
    </>
  );
}

