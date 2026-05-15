'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Volume2, VolumeX, Clock } from 'lucide-react';
import { toast } from 'sonner';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
import { fetchStoreById } from '@/lib/database';
import { createClient } from '@/lib/supabase/client';
import { DEMO_RESTAURANT_ID } from '@/lib/constants';
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

const MUTE_KEY = 'partner_incoming_order_mute_sound';
const FALLBACK_POLL_MS = 15_000;
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
  const src = (url || '').trim();
  // No hardcoded default sound: only play when admin configured a URL.
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
      <span className="font-mono text-xl font-extrabold tracking-wide text-gray-900">
        <span className="text-gray-900">{prefix}</span>
        <span className="px-0.5" aria-hidden />
        <span className="text-orange-600">{last4}</span>
      </span>
    );
  }
  return <span className="font-mono text-xl font-extrabold tracking-wide text-gray-900">#{fallbackOrderId}</span>;
}

/**
 * Global overlay: new store orders (orders_core assigned, or orders_food CREATED). Partnersite only.
 */
export function PartnerIncomingOrderModal({ restaurantId }: { restaurantId?: string }) {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeInternalId, setStoreInternalId] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [modalOrder, setModalOrder] = useState<OrdersFoodRow | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
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

  useEffect(() => {
    const fromProp = (restaurantId || '').trim();
    const fromLs = typeof window !== 'undefined' ? (localStorage.getItem('selectedStoreId') || '').trim() : '';
    setStoreId(fromProp || fromLs || DEMO_RESTAURANT_ID);
  }, [restaurantId]);

  useEffect(() => {
    if (!storeId) return;
    void (async () => {
      const s = await fetchStoreById(storeId);
      setStoreInternalId(s?.id ?? null);
    })();
  }, [storeId]);

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
          show_floating_orders: data.show_floating_orders === true,
        });
      } catch {
        setStoreOpsSettings(null);
      }
    })();
  }, [storeId]);

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
    const needsHydrate =
      !modalOrder.customer_name ||
      !Array.isArray(modalOrder.items) ||
      modalOrder.items.length === 0 ||
      (modalOrder as unknown as Record<string, unknown>).is_bulk_order === undefined;
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
  }, [storeId, modalOrder, fetchByCoreId]);

  const openIfNew = useCallback(
    async (full: OrdersFoodRow | null) => {
      if (!full) return;
      // If floating UI is disabled, do not open modal or play sound.
      if (storeOpsSettings?.show_floating_orders === false) return;
      if (!readPartnerDeviceOrderAlerts(storeId).orderAlertsEnabled) return;
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
          resolveAlertUrlFromSlots(slots, device.alertSoundSlot) ?? settings.alert_sound_url;
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
      storeOpsSettings?.show_floating_orders,
    ]
  );

  const scanForNewOrders = useCallback(async () => {
    if (!storeId) return;
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
  }, [storeId, modalOrder, openIfNew]);

  useEffect(() => {
    if (!storeInternalId || !storeId) return () => {};
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
  }, [storeId, storeInternalId, fetchByCoreId, fetchByFoodRow, openIfNew]);

  useEffect(() => {
    // Fallback: if realtime misses events (or order becomes "assigned" via UPDATE),
    // still pop a modal when there is any CREATED pipeline order.
    void scanForNewOrders();
    const t = window.setInterval(() => void scanForNewOrders(), FALLBACK_POLL_MS);
    return () => window.clearInterval(t);
  }, [scanForNewOrders]);

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
    void patchStatus('CANCELLED', { rejected_reason: 'Auto Cancelled: acceptance timeout' });
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
    setRejectReason('');
  };

  const showOrderActionToast = (kind: PartnerOrderActionToastKind, orderId: number) => {
    if (hasShownPartnerOrderActionToast(orderId, kind)) return;
    markPartnerOrderActionToastShown(orderId, kind);
    const message = kind === 'accepted' ? 'Order accepted' : 'Order rejected';
    toast.success(message, { id: `partner-order-${kind}-${orderId}` });
  };

  const patchStatus = async (status: 'ACCEPTED' | 'CANCELLED', extra?: { rejected_reason?: string }) => {
    if (!storeId || !modalOrder) return;
    const orderIdForToast = modalOrder.order_id;
    setActionLoading(true);
    try {
      const url = modalOrder.core_only
        ? `/api/merchant/orders-core/${modalOrder.order_id}`
        : `/api/food-orders/${modalOrder.id}`;
      const payload = { store_id: storeId, status, action_source: 'website' as const, ...extra };
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
      void patchStatus('ACCEPTED');
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
  if (storeOpsSettings?.show_floating_orders === false) return null;

  const portal = (node: React.ReactNode) => createPortal(node, document.body);

  return (
    <>
      {modalOrder &&
        !rejectOpen &&
        portal(
          <div
            className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-3 backdrop-blur-[2px] sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="partner-incoming-title"
          >
            <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
              <div className="flex items-start justify-between gap-2 border-b border-gray-100 px-4 py-3">
                <h2 id="partner-incoming-title" className="text-base font-semibold text-gray-900">
                  1 new order
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
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

              <div className="bg-violet-100 px-4 py-2 text-center text-xs font-bold uppercase tracking-wide text-violet-900">
                GatiMitra · order at your store
                {modalOrder.order_type ? (
                  <span className="mt-1 block text-[10px] font-semibold normal-case tracking-normal text-violet-800/95">
                    {String(modalOrder.order_type).replace(/_/g, ' ')}
                  </span>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">ID </span>
                    <MiniOrderId
                      formattedOrderId={modalOrder.formatted_order_id}
                      fallbackOrderId={modalOrder.order_id}
                    />
                  </div>
                  <div className="text-gray-600">
                    {new Date(modalOrder.created_at).toLocaleTimeString('en-IN', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <div className="mt-2 text-sm text-gray-700">
                  {modalOrder.customer_name ? (
                    <>
                      <span className="font-semibold text-gray-900">
                        {(() => {
                          const n = Number((modalOrder as any).customer_order_count ?? 0);
                          if (Number.isFinite(n) && n > 0) {
                            return `${n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`} order by ${modalOrder.customer_name}`;
                          }
                          return `Order by ${modalOrder.customer_name}`;
                        })()}
                      </span>
                    </>
                  ) : (
                    <span className="font-semibold text-gray-900">New order</span>
                  )}
                </div>

                {isBig ? (
                  <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                    <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
                    <div>
                      <p className="text-sm font-bold text-amber-900">BIG ORDER!</p>
                      <p className="mt-0.5 text-xs leading-snug text-amber-900/90">
                        This order is marked as a bulk order. Set prep time and dispatch details in the next step
                        for a smoother handoff.
                      </p>
                    </div>
                  </div>
                ) : null}

                {modalOrder.requires_utensils ? (
                  <p className="mt-3 text-xs font-medium text-emerald-700">Include cutlery / utensils</p>
                ) : null}

                <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
                  {(Array.isArray(modalOrder.items) ? modalOrder.items : []).map((it, idx) => (
                    <li key={idx} className="flex gap-2 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-gray-900">
                          {it.quantity} × {it.name}
                        </span>
                        {it.customizations?.length ? (
                          <p className="text-xs text-gray-500">{it.customizations.join(' · ')}</p>
                        ) : null}
                      </div>
                      <div className="shrink-0 font-medium text-gray-800">
                        ₹{Number(it.total ?? 0).toLocaleString('en-IN')}
                      </div>
                    </li>
                  ))}
                </ul>

                <p className="mt-2 text-right text-sm font-semibold text-gray-900">
                  Total ₹{orderTotalRs(modalOrder).toLocaleString('en-IN')}
                </p>
              </div>

              <div className="flex gap-2 border-t border-gray-100 bg-gray-50 px-4 py-3">
                <button
                  type="button"
                  disabled={actionLoading}
                  className="flex-1 rounded-xl border-2 border-red-500 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  onClick={() => setRejectOpen(true)}
                >
                  Reject
                </button>
                <button
                  type="button"
                  disabled={actionLoading || secondsLeft <= 0}
                  className="relative flex-[1.35] overflow-hidden rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                  onClick={() => void patchStatus('ACCEPTED')}
                >
                  <span
                    className="absolute inset-y-0 left-0 bg-orange-500/35"
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

      {modalOrder &&
        rejectOpen &&
        portal(
          <div className="fixed inset-0 z-[115] flex items-end justify-center bg-black/50 p-3 backdrop-blur-sm sm:items-center sm:p-4">
            <div className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
              <h3 className="font-semibold text-gray-900">Reject order</h3>
              <p className="mt-1 text-sm text-gray-600">Optional reason for the customer:</p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-200 p-2 text-sm min-h-[88px]"
                placeholder="e.g. Item unavailable"
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium hover:bg-gray-50"
                  onClick={() => {
                    setRejectOpen(false);
                    setRejectReason('');
                  }}
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  onClick={() =>
                    void patchStatus('CANCELLED', {
                      rejected_reason: rejectReason.trim() || 'Rejected from incoming order',
                    })
                  }
                >
                  Confirm reject
                </button>
              </div>
            </div>
          </div>
        )}
    </>
  );
}
