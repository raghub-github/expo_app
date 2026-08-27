'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { Lora, Poppins } from 'next/font/google';
import { X, Volume2, VolumeX, Clock, Minus, Plus, ChevronLeft, ChevronRight, MapPin, StickyNote } from 'lucide-react';
import { Dialog } from '@headlessui/react';
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
import { dispatchPartnerNotificationsChanged } from '@/lib/clear-store-order-notifications';
import {
  readPartnerDeviceOrderAlerts,
  resolveAlertUrlFromSlots,
  volumeStepTo01,
} from '@/lib/partner-device-order-alerts';
import { resolvePartnerPipeline } from '@/lib/partner-orders-unify';
import { fetchPartnerPendingNewOrdersCount, invalidatePartnerPendingCountCache } from '@/lib/partner-pending-count-fetch';
import { requestPartnerAcceptanceTimeoutSync } from '@/lib/partner-acceptance-timeout-sync-client';
import { isPartnerSelfPickupOrder } from '@/lib/partner-delivery-type';
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
import { parseMerchantInstructionsList } from '@/lib/merchant-order-instructions';
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
import {
  clearBlockedChime,
  installAlertAudioUnlock,
  isAlertAudioBlocked,
  playFallbackBeep,
  queueBlockedChime,
  resolveAlertSoundSrc,
  subscribeAlertAudioBlocked,
  unlockAlertAudioNow,
} from '@/lib/partner-alert-audio';

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

/**
 * "37th" for the customer's Nth order at this store. Prefers the per-order
 * ordinal and falls back to their lifetime store count (identical for a fresh
 * order, and the only value the board list carries).
 */
function formatCustomerOrderOrdinal(
  ordinal: number | null | undefined,
  storeOrdersTotal: number | null | undefined
): string | null {
  const raw = [ordinal, storeOrdersTotal]
    .map((v) => Math.floor(Number(v)))
    .find((v) => Number.isFinite(v) && v > 0);
  if (raw == null) return null;
  const mod100 = raw % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${raw}th`;
  switch (raw % 10) {
    case 1:
      return `${raw}st`;
    case 2:
      return `${raw}nd`;
    case 3:
      return `${raw}rd`;
    default:
      return `${raw}th`;
  }
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

type ChimeOpts = {
  volume01: number;
  /** Best-effort hint for mobile browsers (cannot override hardware silent switch). */
  ringInSilent: boolean;
  /** Unique token for this run; if it changes, playback stops. */
  getRunId: () => number;
  runId: number;
  /** For stopping current audio when cancelled/closed. */
  setAudioRef: (a: HTMLAudioElement | null) => void;
  /** Called when the browser's autoplay gate refused playback. */
  onBlocked?: () => void;
};

type ChimeOutcome = 'played' | 'error' | 'blocked' | 'cancelled';

async function playChimeOnce(src: string, opts: ChimeOpts): Promise<ChimeOutcome> {
  if (opts.getRunId() !== opts.runId) return 'cancelled';
  const resolvedSrc = await resolveAlertSoundSrc(src);
  const audio = new Audio(resolvedSrc);
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
  const done = new Promise<boolean>((resolve) => {
    audio.addEventListener('ended', () => resolve(true), { once: true });
    audio.addEventListener('error', () => resolve(false), { once: true });
  });

  try {
    if (opts.getRunId() !== opts.runId) return 'cancelled';
    await audio.play();
  } catch (err) {
    const name = (err as DOMException | undefined)?.name;
    return name === 'NotAllowedError' ? 'blocked' : 'error';
  }

  return (await done) ? 'played' : 'error';
}

async function playChimeSequential(
  url: string | null | undefined,
  repeatCount: number,
  opts: ChimeOpts
) {
  if (typeof window === 'undefined') return;
  const configured = (url || '').trim();
  // Bundled tone, then an oscillator chirp, back the configured sound up: a
  // broken custom URL must never leave a new order silent.
  const sources = configured && configured !== DEFAULT_ALERT_SOUND
    ? [configured, DEFAULT_ALERT_SOUND]
    : [DEFAULT_ALERT_SOUND];

  const safeRepeats = Math.max(1, Math.min(25, Math.floor(repeatCount || 1)));
  let sourceIndex = 0;
  try {
    for (let i = 0; i < safeRepeats; i += 1) {
      if (isIncomingSoundMuted()) break;
      if (opts.getRunId() !== opts.runId) break;

      const outcome = await playChimeOnce(sources[sourceIndex]!, opts);
      if (outcome === 'played') continue;
      if (outcome === 'cancelled') break;
      if (outcome === 'blocked') {
        opts.onBlocked?.();
        break;
      }
      if (sourceIndex < sources.length - 1) {
        sourceIndex += 1;
        i -= 1;
        continue;
      }
      if (!(await playFallbackBeep(opts.volume01))) break;
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
  const {
    storeId,
    ready: storeReady,
    managedStoreIds,
    managedInternalIds,
    metaByInternalId,
  } = usePartnerSelectedStore(restaurantId);
  const [muted, setMuted] = useState(false);
  /** True when the browser refused the chime until the merchant interacts. */
  const [soundBlocked, setSoundBlocked] = useState(false);
  /** FIFO queue: oldest pending order is index 0. The merchant can page through with the pager. */
  const [queue, setQueue] = useState<OrdersFoodRow[]>([]);
  /** Which queued order the merchant is currently viewing / acting on. */
  const [viewIndex, setViewIndex] = useState(0);
  const viewIndexRef = useRef(0);
  /** Body slide direction: 1 = next (from right), -1 = prev (from left). Pager stays fixed. */
  const [slideDir, setSlideDir] = useState<1 | -1>(1);
  const [slideNonce, setSlideNonce] = useState(0);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [itemsSheetOpen, setItemsSheetOpen] = useState(false);
  const [billSheetOpen, setBillSheetOpen] = useState(false);
  const [kitchenNoteOpen, setKitchenNoteOpen] = useState(false);
  /** Headless UI Dialog focus sentinels differ SSR vs client — mount only after hydration. */
  const [dialogsReady, setDialogsReady] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [nowTick, setNowTick] = useState(0);
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
  /** Stable late-bound hooks so early queue helpers can call them safely. */
  const scanForNewOrdersRef = useRef<() => void>(() => {});
  const stopChimeRef = useRef<() => void>(() => {});
  const removeOrderFromQueueByIdRef = useRef<(orderId: number) => void>(() => {});
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
    const removedWasViewed = Number(viewedId) === Number(orderId);
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
    if (removedWasViewed) {
      setRejectOpen(false);
      setItemsSheetOpen(false);
      setBillSheetOpen(false);
      setKitchenNoteOpen(false);
    }
    if (typeof window !== 'undefined') {
      invalidatePartnerPendingCountCache();
      window.dispatchEvent(new CustomEvent(PARTNER_PENDING_ORDERS_REFRESH));
      dispatchPartnerNotificationsChanged();
    }
    // Modal stays open while other pending cards remain.
    if (next.length === 0) {
      stopChimeRef.current();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(PARTNER_INCOMING_MODAL_CLOSED));
      }
      queueMicrotask(() => void scanForNewOrdersRef.current());
    }
  }, []);
  removeOrderFromQueueByIdRef.current = removeOrderFromQueueById;

  const goToOrder = useCallback((delta: number) => {
    const len = queueRef.current.length;
    if (len <= 1 || delta === 0) return;
    setSlideDir(delta > 0 ? 1 : -1);
    setSlideNonce((n) => n + 1);
    setViewIndex((i) => clampIndex(len, i + delta));
  }, []);

  const goToOrderAt = useCallback((index: number) => {
    const len = queueRef.current.length;
    if (len <= 1) return;
    const cur = clampIndex(len, viewIndexRef.current);
    const next = clampIndex(len, index);
    if (next === cur) return;
    setSlideDir(next > cur ? 1 : -1);
    setSlideNonce((n) => n + 1);
    setViewIndex(next);
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

  useEffect(() => {
    installAlertAudioUnlock();
    setSoundBlocked(isAlertAudioBlocked());
    return subscribeAlertAudioBlocked(setSoundBlocked);
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
    setDialogsReady(true);
    setNowTick(Date.now());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onRefresh = () => {
      void reloadAcceptanceSettings();
    };
    window.addEventListener('partner-order-acceptance-settings-changed', onRefresh);
    return () => window.removeEventListener('partner-order-acceptance-settings-changed', onRefresh);
  }, [reloadAcceptanceSettings]);

  useEffect(() => {
    setMaxPrepMinutes(PREP_TIME_MAX);
  }, []);

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
    async (foodRowId: number, preferredStoreId?: string | null) => {
      const tryIds = [
        ...(preferredStoreId ? [preferredStoreId] : []),
        ...managedStoreIds,
        ...(storeId ? [storeId] : []),
      ].filter((id, i, arr) => id && arr.indexOf(id) === i);
      for (const sid of tryIds) {
        const res = await fetch(
          `/api/food-orders?store_id=${encodeURIComponent(sid)}&orders_food_id=${foodRowId}`
        );
        const data = (await res.json().catch(() => ({}))) as { orders?: OrdersFoodRow[] };
        if (res.ok && Array.isArray(data.orders) && data.orders.length > 0) {
          return data.orders[0] ?? null;
        }
      }
      return null;
    },
    [managedStoreIds, storeId]
  );

  const fetchByCoreId = useCallback(
    async (coreId: number, preferredStoreId?: string | null) => {
      const tryIds = [
        ...(preferredStoreId ? [preferredStoreId] : []),
        ...managedStoreIds,
        ...(storeId ? [storeId] : []),
      ].filter((id, i, arr) => id && arr.indexOf(id) === i);
      for (const sid of tryIds) {
        const res = await fetch(
          `/api/food-orders?store_id=${encodeURIComponent(sid)}&orders_core_id=${coreId}`
        );
        const data = (await res.json().catch(() => ({}))) as { orders?: OrdersFoodRow[] };
        if (res.ok && Array.isArray(data.orders) && data.orders.length > 0) {
          return data.orders[0] ?? null;
        }
      }
      return null;
    },
    [managedStoreIds, storeId]
  );

  const resolvePublicStoreIdForOrder = useCallback(
    (order: OrdersFoodRow | null | undefined): string | null => {
      if (!order) return storeId;
      const internal = Number(order.merchant_store_id);
      if (Number.isFinite(internal) && metaByInternalId.has(internal)) {
        return metaByInternalId.get(internal)!.storeId;
      }
      return storeId;
    },
    [metaByInternalId, storeId]
  );

  const orderStoreAddress = useMemo(() => {
    if (!modalOrder) return '';
    const internal = Number(modalOrder.merchant_store_id);
    if (!Number.isFinite(internal) || !metaByInternalId.has(internal)) return '';
    const meta = metaByInternalId.get(internal)!;
    // Same logged-in / active outlet — no need to show address in header.
    if (storeId && meta.storeId === storeId) return '';
    return String(meta.fullAddress ?? '').trim();
  }, [modalOrder, metaByInternalId, storeId]);

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
      const ring = () => {
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
          // Autoplay-blocked tab: ring as soon as the merchant touches the page.
          onBlocked: () => queueBlockedChime(ring),
        });
      };
      ring();
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
    const scanIds = managedStoreIds.length > 0 ? managedStoreIds : storeId ? [storeId] : [];
    if (scanIds.length === 0 || !storeReady) return;
    try {
      for (const sid of scanIds) {
        const pending = await fetchPartnerPendingNewOrdersCount(sid);
        if (pending == null || pending <= 0) continue;

        const res = await fetch(
          `/api/food-orders?store_id=${encodeURIComponent(sid)}&limit=${FALLBACK_SCAN_LIMIT}&skip_compensation=1`
        );
        const text = await res.text();
        let data: { orders?: OrdersFoodRow[] } = {};
        if (text.trim()) {
          try {
            data = JSON.parse(text) as { orders?: OrdersFoodRow[] };
          } catch {
            continue;
          }
        }
        if (!res.ok || !Array.isArray(data.orders)) continue;
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
      }
    } catch {
      /* ignore */
    }
  }, [managedStoreIds, storeId, storeReady, openIfNew, isOrderDismissed]);

  scanForNewOrdersRef.current = scanForNewOrders;
  const openIfNewRef = useRef(openIfNew);
  openIfNewRef.current = openIfNew;

  const managedStoreIdsKey = managedStoreIds.join(',');
  const managedInternalIdsKey = managedInternalIds.join(',');

  useEffect(() => {
    if (!storeReady || managedStoreIds.length === 0) return;
    const allowed = new Set(managedStoreIds);
    return subscribeIncomingOrderAlert((payload) => {
      if (!allowed.has(payload.storeId)) return;
      void (async () => {
        const full = await fetchByCoreId(payload.orderId, payload.storeId);
        await openIfNewRef.current(full, { skipBroadcast: true });
      })();
    });
  }, [storeReady, managedStoreIdsKey, fetchByCoreId]);

  useEffect(() => {
    if (!storeReady || managedStoreIds.length === 0) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void scanForNewOrdersRef.current();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [storeReady, managedStoreIdsKey]);

  useEffect(() => {
    if (!storeReady || managedInternalIds.length === 0) return () => {};
    const supabase = createClient();
    const filter =
      managedInternalIds.length === 1
        ? `merchant_store_id=eq.${managedInternalIds[0]}`
        : `merchant_store_id=in.(${managedInternalIds.join(',')})`;
    const ch = supabase
      .channel(`partner_incoming:${managedInternalIds.join('_')}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders_core',
          filter,
        },
        (payload) => {
          const row = payload.new as { id?: number; status?: string; merchant_store_id?: number };
          const prev = payload.old as { status?: string } | null;
          const nextStatus = String(row.status || '').toLowerCase();
          const prevStatus = String(prev?.status || '').toLowerCase();
          const coreId = Number(row.id);
          if (
            Number.isFinite(coreId) &&
            nextStatus !== 'assigned' &&
            queueRef.current.some((o) => Number(o.order_id) === coreId)
          ) {
            removeOrderFromQueueById(coreId);
            return;
          }
          if (nextStatus !== 'assigned') return;
          if (prevStatus === 'assigned') return;
          if (!Number.isFinite(coreId)) return;
          const preferred =
            row.merchant_store_id != null
              ? metaByInternalId.get(Number(row.merchant_store_id))?.storeId
              : null;
          void (async () => {
            const full = await fetchByCoreId(coreId, preferred);
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
          filter,
        },
        (payload) => {
          const row = payload.new as {
            id?: number;
            order_id?: number;
            order_status?: string;
            merchant_store_id?: number;
          };
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
          const preferred =
            row.merchant_store_id != null
              ? metaByInternalId.get(Number(row.merchant_store_id))?.storeId
              : null;
          void (async () => {
            const full = await fetchByFoodRow(fid, preferred);
            await openIfNew(full);
          })();
        }
      )
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [
    storeReady,
    managedInternalIdsKey,
    fetchByCoreId,
    fetchByFoodRow,
    openIfNew,
    removeOrderFromQueueById,
    metaByInternalId,
  ]);

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
  const isSelfPickupOrder = isPartnerSelfPickupOrder(modalOrder);
  const incomingFulfillmentLabel = isSelfPickupOrder
    ? 'Self-Pick-Up'
    : 'GatiMitra delivery';
  const incomingFulfillmentSuffix = modalOrder?.order_type
    ? ` · ${String(modalOrder.order_type).replace(/_/g, ' ')}`
    : '';

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
  /** Free-text checkout note for the kitchen — cutlery already has its own pill. */
  const kitchenNotes = useMemo(
    () =>
      parseMerchantInstructionsList(modalOrder?.merchant_instructions_list).filter(
        (line) => !/cutlery|utensil/i.test(line)
      ),
    [modalOrder?.merchant_instructions_list]
  );

  useEffect(() => {
    setItemsSheetOpen(false);
    setBillSheetOpen(false);
    setKitchenNoteOpen(false);
  }, [modalOrder?.order_id]);

  const orderPlacedLabel = useMemo(() => {
    if (!modalOrder?.created_at) return '';
    try {
      return new Date(modalOrder.created_at).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
      });
    } catch {
      return '';
    }
  }, [modalOrder?.created_at]);

  const persistMute = (v: boolean) => {
    setMuted(v);
    try {
      localStorage.setItem(MUTE_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (v) {
      clearBlockedChime();
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
  stopChimeRef.current = stopChime;

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
    setBillSheetOpen(false);
    if (typeof window !== 'undefined') {
      invalidatePartnerPendingCountCache();
      window.dispatchEvent(new CustomEvent(PARTNER_INCOMING_MODAL_CLOSED));
      window.dispatchEvent(new CustomEvent(PARTNER_PENDING_ORDERS_REFRESH));
    }
    if (!opts?.userDismissed) {
      queueMicrotask(() => void scanForNewOrdersRef.current());
    }
  };

  /** After accept/reject (or dismiss): drop ONLY the viewed card; keep the rest open. */
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
    // Stay on the same slot index (next order slides into place); clamp if at end.
    const newIdx = clampIndex(next.length, idx);
    queueRef.current = next;
    viewIndexRef.current = newIdx;
    modalOrderRef.current = next[newIdx] ?? null;
    setQueue(next);
    setViewIndex(newIdx);
    setRejectOpen(false);
    setItemsSheetOpen(false);
    setBillSheetOpen(false);
    setKitchenNoteOpen(false);
    if (typeof window !== 'undefined') {
      invalidatePartnerPendingCountCache();
      window.dispatchEvent(new CustomEvent(PARTNER_PENDING_ORDERS_REFRESH));
      dispatchPartnerNotificationsChanged();
    }
    // Only tear down the modal when no other pending cards remain.
    if (next.length === 0) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(PARTNER_INCOMING_MODAL_CLOSED));
      }
      queueMicrotask(() => void scanForNewOrdersRef.current());
      return;
    }
    // Keep modal open — merchant pages remaining orders with Prev/Next.
  };

  /**
   * X: close only the front card. Remaining queued orders stay open.
   * Park/suppress the whole modal only when this was the last card.
   */
  const dismissByUser = () => {
    if (queueRef.current.length > 1) {
      advanceOrClose({ markDismissed: false });
      return;
    }
    finishModal({ userDismissed: true });
  };

  /**
   * Drop ONE specific order by core id — never the "currently viewed" card by accident.
   * Used by async sync / auto-cancel so accepting A cannot wipe B after the pager advances.
   */
  const dropOrderFromQueue = useCallback(
    (orderId: number, opts?: { markDismissed?: boolean }) => {
      const id = Number(orderId);
      if (!Number.isFinite(id) || id <= 0) return;
      if (opts?.markDismissed !== false) addDismissed(id);
      else shownInsertIds.current.delete(`o:${id}`);
      removeOrderFromQueueByIdRef.current(id);
    },
    []
  );

  const syncOpenModalOrder = useCallback(async () => {
    const open = modalOrderRef.current;
    if (!storeId || !open) return;
    const syncCoreId = Number(open.order_id);
    if (!Number.isFinite(syncCoreId)) return;

    if (isOrderDismissed(syncCoreId)) {
      dropOrderFromQueue(syncCoreId, { markDismissed: false });
      return;
    }
    try {
      const snapDeadline = open.merchant_response_deadline_at
        ? new Date(open.merchant_response_deadline_at).getTime()
        : NaN;
      const fallbackDeadline = new Date(open.created_at).getTime() + acceptWindowMs;
      const deadline = Number.isFinite(snapDeadline) ? snapDeadline : fallbackDeadline;
      if (Number.isFinite(deadline) && Date.now() >= deadline) {
        void requestPartnerAcceptanceTimeoutSync(storeId);
      }

      const full = await fetchByCoreId(syncCoreId);
      // Still only act on THIS order id — if the merchant already advanced to another
      // card, do not call close() (that would drop the newly viewed order).
      if (full && !isPartnerIncomingPending(full)) {
        dropOrderFromQueue(syncCoreId, { markDismissed: true });
        return;
      }
      if (!full) return;
      if (isOrderDismissed(syncCoreId)) {
        dropOrderFromQueue(syncCoreId, { markDismissed: false });
        return;
      }
      // Only upsert if this order is still in the queue (or was the sync target).
      if (
        queueRef.current.some((o) => Number(o.order_id) === syncCoreId) ||
        Number(modalOrderRef.current?.order_id) === syncCoreId
      ) {
        upsertOrderInQueue(full);
      }
    } catch {
      /* ignore */
    }
  }, [storeId, fetchByCoreId, isOrderDismissed, upsertOrderInQueue, acceptWindowMs, dropOrderFromQueue]);

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
    const actedOrder = modalOrder;
    const orderIdForToast = actedOrder.order_id;
    const actedCoreId = Number(actedOrder.order_id);
    const closeAfter = opts?.closeAfter !== false;
    const patchStoreId = resolvePublicStoreIdForOrder(actedOrder) || storeId;
    setActionLoading(true);
    try {
      const url = actedOrder.core_only
        ? `/api/merchant/orders-core/${actedOrder.order_id}`
        : `/api/food-orders/${actedOrder.id}`;
      const payload = {
        store_id: patchStoreId,
        status,
        action_source: status === 'CANCELLED' && mode === 'auto' ? ('system' as const) : ('website' as const),
        ...(status === 'ACCEPTED' ? { accept_mode: mode } : {}),
        ...(status === 'CANCELLED' ? { cancel_mode: mode } : {}),
        ...extra,
      };
      console.debug('[partner-incoming-modal] PATCH start', {
        url,
        payload,
        order_id: actedOrder.order_id,
        orders_food_id: actedOrder.id,
        core_only: actedOrder.core_only,
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
          // Already accepted/cancelled elsewhere — drop THIS order only.
          dropOrderFromQueue(actedCoreId, { markDismissed: true });
          return;
        }
        throw new Error(errMsg);
      }
      console.debug('[partner-incoming-modal] PATCH ok', { url, httpStatus: res.status });
      showOrderActionToast(status === 'ACCEPTED' ? 'accepted' : 'rejected', orderIdForToast);
      window.dispatchEvent(new CustomEvent(PARTNER_PENDING_ORDERS_REFRESH));
      dispatchPartnerNotificationsChanged();
      if (closeAfter) {
        const moreWaiting = queueRef.current.some(
          (o) => Number(o.order_id) !== actedCoreId
        );
        // Always remove by acted id so an async sync cannot race and wipe the next card.
        dropOrderFromQueue(actedCoreId, { markDismissed: true });
        if (status === 'ACCEPTED' && !moreWaiting) {
          router.push(partnerPreparingOrdersHref(pathname, patchStoreId));
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.debug('[partner-incoming-modal] PATCH exception', {
        message: msg,
        status,
        order_id: actedOrder.order_id,
      });
      if (closeAfter && isInvalidOrderTransitionError(msg)) {
        dropOrderFromQueue(actedCoreId, { markDismissed: true });
        return;
      }
      toast.error(msg || 'Update failed');
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
              className={`${incomingLora.variable} ${incomingPoppins.variable} partner-incoming-modal pointer-events-none fixed inset-0 z-[1050]`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="partner-incoming-title"
            >
              <div
                className="pointer-events-auto absolute inset-0 bg-stone-950/55 backdrop-blur-[3px]"
                style={{ left: 'var(--mx-partner-sidebar-w, 0px)' }}
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-0 flex items-end justify-center p-2 sm:items-start sm:justify-center sm:px-4 sm:pb-4 sm:pt-[4.75rem]"
                style={{ left: 'var(--mx-partner-sidebar-w, 0px)' }}
              >
              <div className="pointer-events-auto relative w-full max-w-2xl">
                <div className="relative flex max-h-[min(88dvh,calc(100dvh-5rem))] w-full min-h-0 flex-col overflow-hidden rounded-t-[1.25rem] bg-[#fafaf9] shadow-[0_24px_64px_rgba(28,25,23,0.28)] ring-1 ring-stone-900/10 sm:max-h-[min(85dvh,calc(100dvh-6rem))] sm:rounded-[1.25rem]">
                  {/* Header */}
                  <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-200/80 bg-white px-4 py-2.5 sm:px-5">
                    <div className="min-w-0">
                      <div className="mb-1">
                        <MiniOrderId
                          formattedOrderId={modalOrder.formatted_order_id}
                          fallbackOrderId={modalOrder.order_id}
                        />
                      </div>
                      <h2
                        id="partner-incoming-title"
                        className="text-[15px] font-semibold tracking-tight text-stone-900"
                      >
                        {pendingCount === 1 ? '1 new order' : `${pendingCount} new orders`}
                      </h2>
                      <p
                        className={`incoming-num mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                          isSelfPickupOrder ? 'text-amber-800' : 'text-emerald-700'
                        }`}
                      >
                        {incomingFulfillmentLabel}
                        {incomingFulfillmentSuffix}
                      </p>
                      {orderStoreAddress ? (
                        <p className="mt-1 flex items-start gap-1 text-[11px] font-semibold leading-snug text-sky-800">
                          <MapPin size={12} className="mt-0.5 shrink-0" aria-hidden />
                          <span className="min-w-0 break-words">{orderStoreAddress}</span>
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="flex items-center gap-0.5">
                        {soundBlocked && !muted ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
                            onClick={() => unlockAlertAudioNow()}
                          >
                            <Volume2 size={15} />
                            Enable sound
                          </button>
                        ) : null}
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
                      {orderPlacedLabel ? (
                        <p className="incoming-num max-w-[11rem] text-right text-[10px] font-semibold leading-snug text-stone-500">
                          {orderPlacedLabel}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {/* Pager: move between multiple pending orders and act on the one shown. */}
                  {pendingCount > 1 ? (
                    <div className="mx-2.5 mt-1.5 mb-0.5 flex shrink-0 items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 px-1.5 py-1 sm:mx-4">
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
                              onClick={() => goToOrderAt(i)}
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

                  {/* Body slides on Prev/Next; pager + footer stay fixed */}
                  <div className="min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pt-2.5 sm:px-5">
                    <div
                      key={`incoming-slide-${slideNonce}-${modalOrder.order_id}`}
                      className={
                        slideNonce > 0
                          ? slideDir > 0
                            ? 'incoming-order-slide-next'
                            : 'incoming-order-slide-prev'
                          : undefined
                      }
                    >
                      {kitchenNotes.length > 0 ? (
                        <div className="mb-1.5 flex justify-end">
                          <button
                            type="button"
                            onClick={() => setKitchenNoteOpen(true)}
                            className="incoming-note-blink inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-800 ring-1 ring-violet-300 hover:bg-violet-100"
                          >
                            <StickyNote size={12} aria-hidden />
                            <span className="incoming-num">{kitchenNotes.length}</span>
                            <span>Customer note added</span>
                          </button>
                        </div>
                      ) : null}

                      <p className="mt-0.5 text-[13px] leading-snug text-stone-700">
                        {modalOrder.customer_name ? (
                          <span className="font-medium text-stone-900">
                            {(() => {
                              const ordinal = formatCustomerOrderOrdinal(
                                modalOrder.customer_store_order_ordinal,
                                (modalOrder as { customer_order_count?: number | null }).customer_order_count
                              );
                              return ordinal
                                ? `${ordinal} order by ${modalOrder.customer_name}`
                                : `Order by ${modalOrder.customer_name}`;
                            })()}
                          </span>
                        ) : (
                          <span className="font-medium text-stone-900">New customer order</span>
                        )}
                      </p>

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

                      <div className="mt-2 mb-2 pb-1">
                        <MerchantOrderItemsList
                          items={orderItems as NormalizedOrderLineItem[]}
                          totalItemCount={itemCount}
                          totalLineCount={orderItems.length}
                          requiresUtensils={false}
                          maxItems={MAX_PREVIEW_ITEMS}
                          compact
                          hideMoreHint
                          showUtensilsBanner={false}
                          showQuantityColumn
                          showOrderItemsHeader
                          onViewMore={
                            moreItemsCount > 0
                              ? () => {
                                  setBillSheetOpen(false);
                                  setItemsSheetOpen(true);
                                }
                              : undefined
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {/* Fixed footer: bill → view all + prep → actions */}
                  <div className="shrink-0 border-t border-stone-200/80 bg-white">
                    <div className="space-y-2 px-4 pt-2.5 sm:px-5">
                      <MerchantOrderBillSummary
                        compact
                        items={orderItems as NormalizedOrderLineItem[]}
                        pricing={incomingOrderPricing}
                        discountLabel="Merchant Precision Discount"
                        onTotalClick={() => {
                          setItemsSheetOpen(false);
                          setBillSheetOpen(true);
                        }}
                      />

                      <div className="flex items-stretch gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setBillSheetOpen(false);
                            setItemsSheetOpen(true);
                          }}
                          disabled={orderItems.length === 0}
                          className="flex w-1/2 items-center justify-center rounded-xl bg-blue-50 px-2 py-2 text-center text-[12px] font-bold leading-tight text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100 disabled:opacity-40"
                        >
                          View all items
                          {itemCount > 0 ? (
                            <span className="incoming-num ml-1 font-extrabold">({itemCount})</span>
                          ) : null}
                        </button>

                        <div className="flex w-1/2 items-center gap-2 rounded-xl bg-stone-50 px-2.5 py-2 ring-1 ring-stone-200/80">
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold leading-tight text-stone-900">
                              Preparation time
                            </p>
                            <p className="incoming-num mt-0.5 text-[9px] font-medium leading-tight text-stone-500">
                              {PREP_TIME_MIN}–{maxPrepMinutes} min
                            </p>
                          </div>
                          <div className="flex shrink-0 items-stretch overflow-hidden rounded-lg bg-white ring-1 ring-stone-200">
                            <button
                              type="button"
                              className="flex h-8 w-7 items-center justify-center border-r border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                              disabled={prepMinutes <= PREP_TIME_MIN || actionLoading}
                              onClick={() => stepPrep(-PREP_STEP_MINUTES)}
                              aria-label="Decrease preparation time"
                            >
                              <Minus size={14} />
                            </button>
                            <div className="incoming-num flex h-8 min-w-[2.75rem] items-center justify-center px-1.5 text-center text-[12px] font-bold tabular-nums text-stone-900">
                              {prepMinutes}m
                            </div>
                            <button
                              type="button"
                              className="flex h-8 w-7 items-center justify-center border-l border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                              disabled={prepMinutes >= maxPrepMinutes || actionLoading}
                              onClick={() => stepPrep(PREP_STEP_MINUTES)}
                              aria-label="Increase preparation time"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
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
            </div>
          )
        : null}

      <OrderBillSidesheet
        open={!!modalOrder && itemsSheetOpen && !rejectOpen && !billSheetOpen}
        onClose={() => setItemsSheetOpen(false)}
        order={modalOrder}
        pricing={incomingOrderPricing}
        lineSum={incomingOrderLineSum}
        allItemsOnly
      />

      <OrderBillSidesheet
        open={!!modalOrder && billSheetOpen && !rejectOpen && !itemsSheetOpen}
        onClose={() => setBillSheetOpen(false)}
        order={modalOrder}
        pricing={incomingOrderPricing}
        lineSum={incomingOrderLineSum}
        allItemsOnly={false}
      />

      {dialogsReady && kitchenNoteOpen && kitchenNotes.length > 0 ? (
        <Dialog open onClose={() => setKitchenNoteOpen(false)} className="relative z-[1100]">
          <div className="fixed inset-0 bg-stone-950/45 backdrop-blur-[1px]" aria-hidden />
          <div className="fixed inset-0 flex items-center justify-center p-3">
            <Dialog.Panel
              className={`${incomingLora.variable} ${incomingPoppins.variable} partner-incoming-modal w-full max-w-[22rem] overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-violet-200/80`}
            >
              <div className="flex items-center justify-between gap-2 border-b border-violet-100 bg-violet-50/80 px-3 py-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <StickyNote size={14} className="shrink-0 text-violet-700" aria-hidden />
                  <Dialog.Title className="truncate text-[12px] font-bold text-violet-900">
                    Kitchen note
                    {kitchenNotes.length > 1 ? (
                      <span className="incoming-num ml-1 text-violet-700">({kitchenNotes.length})</span>
                    ) : null}
                  </Dialog.Title>
                </div>
                <button
                  type="button"
                  className="rounded-md p-1 text-stone-500 hover:bg-violet-100 hover:text-stone-800"
                  aria-label="Close note"
                  onClick={() => setKitchenNoteOpen(false)}
                >
                  <X size={15} />
                </button>
              </div>
              <div className="space-y-1.5 px-3 py-2.5">
                {kitchenNotes.map((line) => (
                  <p
                    key={line}
                    className="rounded-lg bg-violet-50/70 px-2.5 py-2 text-[13px] font-medium leading-snug text-stone-800 ring-1 ring-violet-100"
                  >
                    {line}
                  </p>
                ))}
              </div>
              <div className="border-t border-stone-100 px-3 py-2">
                <button
                  type="button"
                  className="w-full rounded-lg bg-violet-700 py-2 text-[12px] font-semibold text-white hover:bg-violet-800"
                  onClick={() => setKitchenNoteOpen(false)}
                >
                  Got it
                </button>
              </div>
            </Dialog.Panel>
          </div>
        </Dialog>
      ) : null}

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

