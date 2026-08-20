'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '@/context/ToastContext';
import { MerchantIncomingAcceptPanel } from '@/components/merchant/MerchantIncomingAcceptPanel';
import { OrderBillSidesheet } from '@/components/orders/OrderBillSidesheet';
import { RejectOrderSidesheet } from '@/components/orders/RejectOrderSidesheet';
import type { OrderPricingBreakdown, NormalizedOrderLineItem } from '@/lib/orderLineItems';
import {
  resolveInitialPrepMinutesForOrder,
  resolveStoreDefaultPrepMinutes,
} from '@/lib/order-prep-time';
import type { OrdersFoodRow } from '@/lib/types/food-orders';
import { supabase } from '@/lib/supabase/client';
import {
  readPartnerDeviceOrderAlerts,
  resolveAlertUrlFromSlots,
  volumeStepTo01,
} from '@/lib/partner-device-order-alerts';
import { resolvePartnerPipeline } from '@/lib/partner-orders-unify';
import { merchantFoodRowId, merchantOrderApiId } from '@/lib/merchantOrderApiId';
import { useStoreContext } from '@/app/dashboard/merchants/stores/[id]/StoreContext';
import { subscribeMenuItemFormModalOpen } from '@/lib/merchant-menu-form-modal-bus';
import {
  dispatchMerchantStoreOrderUpdated,
  setIncomingOrderModalOpen,
} from '@/lib/merchant-incoming-order-modal-bus';
import { merchantBillPartsFromItems } from '@/lib/merchant-order-item-display';

const MUTE_KEY = 'merchant_incoming_order_mute_sound';
const FALLBACK_POLL_MS = 20_000;
const OPEN_ORDER_SYNC_MS = 2_500;
const FALLBACK_SCAN_LIMIT = 12;
const DISMISS_KEY = 'merchant_incoming_order_dismissed_v1';
const DEFAULT_ALERT_SOUND = '/notification.wav';

type AcceptanceSettings = {
  acceptance_window_minutes: number;
  alert_sound_enabled: boolean;
  alert_sound_url: string | null;
  alert_sound_repeat_count: number;
  alert_sound_urls_by_slot?: [string | null, string | null, string | null];
  alert_sound_slot_choice?: number;
};

const DEFAULT_SETTINGS: AcceptanceSettings = {
  acceptance_window_minutes: 5,
  alert_sound_enabled: true,
  alert_sound_url: null,
  alert_sound_repeat_count: 1,
  alert_sound_urls_by_slot: [null, null, null],
  alert_sound_slot_choice: 0,
};

async function playChimeSequential(
  url: string | null | undefined,
  repeatCount: number,
  opts: {
    volume01: number;
    ringInSilent: boolean;
    getRunId: () => number;
    runId: number;
    setAudioRef: (a: HTMLAudioElement | null) => void;
  }
) {
  if (typeof window === 'undefined') return;
  const src = (url || '').trim();
  if (!src) return;

  const safeRepeats = Math.max(1, Math.min(25, Math.floor(repeatCount || 1)));
  try {
    for (let i = 0; i < safeRepeats; i += 1) {
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

      const done = new Promise<void>((resolve) => {
        const finish = () => resolve();
        audio.addEventListener('ended', finish, { once: true });
        audio.addEventListener('error', finish, { once: true });
      });

      try {
        if (opts.getRunId() !== opts.runId) break;
        await audio.play();
      } catch {
        break;
      }
      await done;
    }
  } catch {
    /* ignore */
  } finally {
    if (opts.getRunId() === opts.runId) opts.setAudioRef(null);
  }
}

function shouldPlayIncomingSound(alertStoreKey: string | null | undefined) {
  if (typeof window === 'undefined' || !alertStoreKey) return false;
  const d = readPartnerDeviceOrderAlerts(alertStoreKey);
  if (!d.orderAlertsEnabled || !d.soundAlertsEnabled) return false;
  try {
    if (localStorage.getItem(MUTE_KEY) === '1') return false;
  } catch {
    /* ignore */
  }
  return true;
}

function isIncomingPending(row: OrdersFoodRow | null): boolean {
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
 * Global overlay for new store orders (CREATED pipeline). Merchant portal — parity with partnersite.
 */
export function MerchantIncomingOrderModal() {
  const { storeId, store } = useStoreContext();
  const { toast } = useToast();
  const storeInternalId = parseInt(storeId, 10);
  const merchantPublicStoreId = (store?.store_id as string | undefined)?.trim() || null;
  const alertStoreKey = merchantPublicStoreId || storeId;

  const [modalOrder, setModalOrder] = useState<OrdersFoodRow | null>(null);
  const [itemsSheetOpen, setItemsSheetOpen] = useState(false);
  const [billSheetOpen, setBillSheetOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [settings, setSettings] = useState<AcceptanceSettings>(DEFAULT_SETTINGS);
  const shownInsertIds = useRef<Set<string>>(new Set());
  const hydrateBusyRef = useRef(false);
  const chimeRunIdRef = useRef(0);
  const chimeAudioRef = useRef<HTMLAudioElement | null>(null);
  const autoCancelFiredForOrderIdRef = useRef<number | null>(null);
  const modalOrderRef = useRef<OrdersFoodRow | null>(null);
  const closeRef = useRef<(opts?: { markDismissed?: boolean }) => void>(() => {});
  const [prepMinutes, setPrepMinutes] = useState(30);
  const [menuItemFormOpen, setMenuItemFormOpen] = useState(false);
  const [soundMuted, setSoundMuted] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  });

  modalOrderRef.current = modalOrder;

  const storeDefaultPrepMinutes = useMemo(
    () =>
      resolveStoreDefaultPrepMinutes(
        (store as { avg_preparation_time_minutes?: number | null } | null)?.avg_preparation_time_minutes
      ),
    [store]
  );

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

  const reloadAcceptanceSettings = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/order-acceptance-settings`, {
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as { settings?: Partial<AcceptanceSettings> };
      if (res.ok && data.settings) setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      else setSettings(DEFAULT_SETTINGS);
    } catch {
      setSettings(DEFAULT_SETTINGS);
    }
  }, [storeId]);

  useEffect(() => subscribeMenuItemFormModalOpen(setMenuItemFormOpen), []);

  useEffect(() => {
    void reloadAcceptanceSettings();
  }, [reloadAcceptanceSettings]);

  useEffect(() => {
    const onRefresh = () => void reloadAcceptanceSettings();
    window.addEventListener('partner-order-acceptance-settings-changed', onRefresh);
    return () => window.removeEventListener('partner-order-acceptance-settings-changed', onRefresh);
  }, [reloadAcceptanceSettings]);

  const fetchByFoodRow = useCallback(
    async (foodRowId: number) => {
      if (!storeId) return null;
      const res = await fetch(
        `/api/merchant/stores/${storeId}/orders?orders_food_id=${foodRowId}`,
        { credentials: 'include' }
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
        `/api/merchant/stores/${storeId}/orders?orders_core_id=${coreId}`,
        { credentials: 'include' }
      );
      const data = (await res.json().catch(() => ({}))) as { orders?: OrdersFoodRow[] };
      if (!res.ok || !Array.isArray(data.orders) || data.orders.length === 0) return null;
      return data.orders[0] ?? null;
    },
    [storeId]
  );

  useEffect(() => {
    if (!storeId || !modalOrder) return;
    const needsHydrate =
      !modalOrder.customer_name ||
      !Array.isArray(modalOrder.items) ||
      modalOrder.items.length === 0 ||
      (modalOrder as unknown as Record<string, unknown>).is_bulk_order === undefined ||
      !(modalOrder.items as NormalizedOrderLineItem[]).some(
        (it) => it.ctmFromSnapshot === true || (it.netLineTotal != null && it.netLineTotal > 0)
      );
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
    async (full: OrdersFoodRow | null): Promise<boolean> => {
      if (!full || !storeId) return false;
      if (!readPartnerDeviceOrderAlerts(alertStoreKey).orderAlertsEnabled) return false;
      const dismissed = getDismissed();
      if (dismissed.has(full.order_id)) return false;
      const ext = full as OrdersFoodRow & { core_status?: string; current_status?: string | null };
      const fst = resolvePartnerPipeline(
        full.order_status,
        ext.core_status ?? 'assigned',
        ext.current_status ?? null
      );
      if (fst !== 'CREATED') return false;
      const dedupeKey = `o:${full.order_id}`;
      if (shownInsertIds.current.has(dedupeKey)) return false;

      const acceptWindowMs = Math.max(
        60_000,
        Math.max(1, Math.min(180, Number(settings.acceptance_window_minutes || 5))) * 60_000
      );
      const snapDeadline = (full as OrdersFoodRow & { merchant_response_deadline_at?: string | null })
        .merchant_response_deadline_at
        ? new Date(
            String(
              (full as OrdersFoodRow & { merchant_response_deadline_at?: string | null })
                .merchant_response_deadline_at
            )
          ).getTime()
        : NaN;
      const deadlineMs = Number.isFinite(snapDeadline)
        ? snapDeadline
        : new Date(full.created_at).getTime() + acceptWindowMs;
      // Past snapshotted deadline: do not open. Backend cron cancels — never dismiss permanently here.
      if (Number.isFinite(deadlineMs) && Date.now() >= deadlineMs) {
        return false;
      }

      shownInsertIds.current.add(dedupeKey);
      setIncomingOrderModalOpen(true);
      setModalOrder(full);
      if (shouldPlayIncomingSound(alertStoreKey) && settings.alert_sound_enabled) {
        const device = readPartnerDeviceOrderAlerts(alertStoreKey);
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
      }
      return true;
    },
    [
      alertStoreKey,
      storeId,
      settings.acceptance_window_minutes,
      settings.alert_sound_enabled,
      settings.alert_sound_repeat_count,
      settings.alert_sound_url,
      settings.alert_sound_urls_by_slot,
    ]
  );

  const scanForNewOrders = useCallback(async () => {
    if (!storeId) return;
    if (modalOrder) return;
    try {
      const res = await fetch(
        `/api/merchant/stores/${storeId}/orders?limit=${FALLBACK_SCAN_LIMIT}&lightweight=1`,
        { credentials: 'include' }
      );
      const data = (await res.json().catch(() => ({}))) as { orders?: OrdersFoodRow[] };
      if (!res.ok || !Array.isArray(data.orders)) return;
      const dismissed = getDismissed();
      for (const o of data.orders) {
        const ext = o as OrdersFoodRow & { core_status?: string; current_status?: string | null };
        const st = resolvePartnerPipeline(
          o.order_status,
          ext.core_status ?? 'assigned',
          ext.current_status ?? null
        );
        if (st !== 'CREATED') continue;
        if (dismissed.has(o.order_id)) continue;
        const full = (await fetchByCoreId(o.order_id)) ?? o;
        const opened = await openIfNew(full);
        if (opened) break;
      }
    } catch {
      /* ignore */
    }
  }, [storeId, modalOrder, openIfNew, fetchByCoreId]);

  useEffect(() => {
    if (!Number.isFinite(storeInternalId) || !storeId) return () => {};
    const ch = supabase
      .channel(`merchant_incoming:${storeInternalId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders_core',
          filter: `merchant_store_id=eq.${storeInternalId}`,
        },
        (payload) => {
          const row = payload.new as { id?: number; status?: string };
          const prev = payload.old as { status?: string } | null;
          const nextStatus = String(row.status || '').toLowerCase();
          const prevStatus = String(prev?.status || '').toLowerCase();
          const cid = Number(row.id);
          if (
            Number.isFinite(cid) &&
            nextStatus !== 'assigned' &&
            Number(modalOrderRef.current?.order_id) === cid
          ) {
            closeRef.current({ markDismissed: true });
            return;
          }
          if (nextStatus !== 'assigned') return;
          if (prevStatus === 'assigned') return;
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
          const row = payload.new as { id?: number; order_id?: number; order_status?: string };
          const prev = payload.old as { order_status?: string } | null;
          const prevSt = resolvePartnerPipeline(prev?.order_status ?? null, 'assigned', null);
          const st = resolvePartnerPipeline(row.order_status, 'assigned', null);
          if (st !== 'CREATED') {
            const rowFoodId = Number(row.id);
            const rowCoreId = Number(row.order_id);
            const open = modalOrderRef.current;
            if (
              open &&
              ((Number.isFinite(rowFoodId) && rowFoodId === Number(open.id)) ||
                (Number.isFinite(rowCoreId) && rowCoreId === Number(open.order_id)))
            ) {
              closeRef.current({ markDismissed: true });
            }
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
  }, [storeId, storeInternalId, fetchByCoreId, fetchByFoodRow, openIfNew]);

  useEffect(() => {
    if (menuItemFormOpen) return;
    void scanForNewOrders();
    const t = window.setInterval(() => {
      if (document.body?.dataset?.menuItemFormOpen === '1') return;
      void scanForNewOrders();
    }, FALLBACK_POLL_MS);
    return () => window.clearInterval(t);
  }, [scanForNewOrders, menuItemFormOpen]);

  useEffect(() => {
    const onScan = () => {
      if (menuItemFormOpen || document.body?.dataset?.menuItemFormOpen === '1') return;
      void scanForNewOrders();
    };
    window.addEventListener('merchant-incoming-order-scan', onScan);
    window.addEventListener('merchant-pending-orders-refresh', onScan);
    return () => {
      window.removeEventListener('merchant-incoming-order-scan', onScan);
      window.removeEventListener('merchant-pending-orders-refresh', onScan);
    };
  }, [scanForNewOrders, menuItemFormOpen]);

  useEffect(() => {
    if (!modalOrder) return;
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [modalOrder]);

  useEffect(() => {
    if (!modalOrder) return;
    setPrepMinutes(resolveInitialPrepMinutesForOrder(modalOrder, storeDefaultPrepMinutes));
  }, [modalOrder, storeDefaultPrepMinutes]);

  useEffect(() => {
    const onReopen = (ev: Event) => {
      const detail = (ev as CustomEvent<{ foodRowId?: number }>).detail;
      const foodRowId = detail?.foodRowId;
      if (!foodRowId) return;
      void (async () => {
        const full = await fetchByFoodRow(foodRowId);
        if (!full) return;
        const dismissed = getDismissed();
        dismissed.delete(full.order_id);
        try {
          const arr = Array.from(dismissed).map((oid) => ({ order_id: oid, t: Date.now() }));
          localStorage.setItem(DISMISS_KEY, JSON.stringify(arr.slice(-200)));
        } catch {
          /* ignore */
        }
        shownInsertIds.current.delete(`o:${full.order_id}`);
        setIncomingOrderModalOpen(true);
        setModalOrder(full);
      })();
    };
    window.addEventListener('merchant-incoming-order-show', onReopen);
    return () => window.removeEventListener('merchant-incoming-order-show', onReopen);
  }, [fetchByFoodRow]);

  const acceptWindowMs = useMemo(() => {
    const mins = Number(settings.acceptance_window_minutes || 5);
    const safeMins = Math.max(1, Math.min(180, mins));
    return safeMins * 60 * 1000;
  }, [settings.acceptance_window_minutes]);

  const deadlineMs = useMemo(() => {
    if (!modalOrder) return 0;
    const snap = (modalOrder as OrdersFoodRow & { merchant_response_deadline_at?: string | null })
      .merchant_response_deadline_at;
    const snapMs = snap ? new Date(String(snap)).getTime() : NaN;
    if (Number.isFinite(snapMs)) return snapMs;
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

  const orderItems = modalOrder ? (Array.isArray(modalOrder.items) ? modalOrder.items : []) : [];

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
    const precision = Math.max(0, Number(modalOrder.merchant_precision_discount) || 0);
    const packaging = Number(modalOrder.pricing?.packaging) || 0;
    const bill = merchantBillPartsFromItems(
      (Array.isArray(modalOrder.items) ? modalOrder.items : []) as NormalizedOrderLineItem[],
      { subtotal: incomingOrderLineSum, packaging, discount: precision, total: 0 }
    );
    if (bill.total > 0.005) {
      return {
        subtotal: bill.itemsSubtotal,
        packaging: bill.packaging,
        taxes: 0,
        discount: bill.discount,
        total: bill.total,
      };
    }
    const p = modalOrder.pricing;
    if (p && Number(p.total) > 0.005) return p;
    const total = Number(modalOrder.total_ctm ?? modalOrder.food_items_total_value ?? incomingOrderLineSum);
    return {
      subtotal: incomingOrderLineSum,
      packaging: 0,
      taxes: 0,
      discount: 0,
      total: Number.isFinite(total) ? total : incomingOrderLineSum,
    };
  }, [modalOrder, incomingOrderLineSum]);

  useEffect(() => {
    setItemsSheetOpen(false);
    setBillSheetOpen(false);
  }, [modalOrder?.order_id]);

  const close = useCallback((opts?: { markDismissed?: boolean }) => {
    const current = modalOrderRef.current;
    const markDismissed = opts?.markDismissed !== false;
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
    if (current && markDismissed) addDismissed(current.order_id);
    else if (current) shownInsertIds.current.delete(`o:${current.order_id}`);
    setIncomingOrderModalOpen(false);
    setModalOrder(null);
    setRejectOpen(false);
    setItemsSheetOpen(false);
    setBillSheetOpen(false);
    try {
      window.dispatchEvent(new CustomEvent('merchant-pending-orders-refresh'));
    } catch {
      /* ignore */
    }
  }, []);
  closeRef.current = close;

  const toggleMute = () => {
    setSoundMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MUTE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const patchStatus = async (
    status: 'ACCEPTED' | 'CANCELLED',
    extra?: { rejected_reason?: string },
    mode: 'auto' | 'manual' = 'manual'
  ) => {
    if (!storeId || !modalOrder) return;
    const foodRowId = merchantFoodRowId(modalOrder) ?? modalOrder.id;
    const coreId = merchantOrderApiId(modalOrder);
    const pathIds =
      modalOrder.core_only === true
        ? [coreId]
        : foodRowId === coreId
          ? [foodRowId]
          : [foodRowId, coreId];
    const payload = {
      status,
      action_source: status === 'CANCELLED' && mode === 'auto' ? ('system' as const) : ('website' as const),
      ...(status === 'ACCEPTED' ? { accept_mode: mode, preparation_time_minutes: prepMinutes } : {}),
      ...(status === 'CANCELLED' ? { cancel_mode: mode } : {}),
      ...extra,
    };
    setActionLoading(true);
    try {
      const tryUpdate = async (pathId: number) => {
        const res = await fetch(`/api/merchant/stores/${storeId}/orders/${pathId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, data };
      };

      let result: { ok: boolean; data: unknown } = { ok: false, data: {} };
      for (const pathId of pathIds) {
        result = await tryUpdate(pathId);
        if (result.ok) break;
      }
      if (!result.ok) {
        await new Promise((r) => setTimeout(r, 1200));
        for (const pathId of pathIds) {
          result = await tryUpdate(pathId);
          if (result.ok) break;
        }
      }
      if (!result.ok) {
        const err = (result.data as { error?: string } | null)?.error;
        throw new Error(err || 'Update failed');
      }
      const updated = (result.data as { order?: OrdersFoodRow } | null)?.order;
      if (updated) dispatchMerchantStoreOrderUpdated(updated);
      toast(status === 'ACCEPTED' ? 'Order accepted' : 'Order rejected', 'success');
      close({ markDismissed: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not update order';
      if (isInvalidOrderTransitionError(msg)) {
        close({ markDismissed: true });
        return;
      }
      toast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    if (!modalOrder) {
      autoCancelFiredForOrderIdRef.current = null;
      return;
    }
    if (actionLoading) return;
    if (secondsLeft > 0) return;
    if (autoCancelFiredForOrderIdRef.current === modalOrder.order_id) return;
    autoCancelFiredForOrderIdRef.current = modalOrder.order_id;
    // Nudge backend cancel authority; close only after status leaves CREATED (realtime/poll).
    void (async () => {
      try {
        await fetch(`/api/merchant/stores/${storeId}/sync-acceptance-timeout`, {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
        });
      } catch {
        /* cron owns cancel */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, modalOrder, actionLoading, storeId]);

  useEffect(() => {
    if (!modalOrder || !storeId) return;
    const sync = async () => {
      const open = modalOrderRef.current;
      if (!open) return;
      const syncCoreId = Number(open.order_id);
      if (!Number.isFinite(syncCoreId)) return;
      try {
        const full = await fetchByCoreId(syncCoreId);
        if (Number(modalOrderRef.current?.order_id) !== syncCoreId) return;
        if (full && !isIncomingPending(full)) {
          close({ markDismissed: true });
        }
      } catch {
        /* ignore */
      }
    };
    void sync();
    const t = window.setInterval(() => void sync(), OPEN_ORDER_SYNC_MS);
    return () => window.clearInterval(t);
  }, [modalOrder?.order_id, storeId, fetchByCoreId, close]);

  if (typeof document === 'undefined') return null;
  if (!storeId || !Number.isFinite(storeInternalId)) return null;

  const portal = (node: React.ReactNode) => createPortal(node, document.body);

  return (
    <>
      {modalOrder &&
        !rejectOpen &&
        portal(
          <div
            className="pointer-events-none fixed inset-0 z-[110]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="merchant-incoming-title"
          >
            <div
              className="pointer-events-auto absolute inset-y-0 right-0 bg-stone-950/55 backdrop-blur-[3px] left-0 lg:left-[var(--dashboard-incoming-overlay-left,0px)]"
              aria-hidden
            />
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-end justify-center p-2 left-0 sm:items-start sm:justify-center sm:px-4 sm:pb-4 sm:pt-[4.75rem] lg:left-[var(--dashboard-incoming-overlay-left,0px)]">
              <div className="pointer-events-auto relative w-full max-w-2xl">
                <MerchantIncomingAcceptPanel
                  order={modalOrder}
                  prepMinutes={prepMinutes}
                  onPrepMinutesChange={setPrepMinutes}
                  storeDefaultPrepMinutes={storeDefaultPrepMinutes}
                  soundMuted={soundMuted}
                  onMuteToggle={toggleMute}
                  onClose={() => close({ markDismissed: false })}
                  onAccept={() => void patchStatus('ACCEPTED', undefined, 'manual')}
                  onReject={() => setRejectOpen(true)}
                  onViewAllItems={() => {
                    setBillSheetOpen(false);
                    setItemsSheetOpen(true);
                  }}
                  onViewBill={() => {
                    setItemsSheetOpen(false);
                    setBillSheetOpen(true);
                  }}
                  actionLoading={actionLoading}
                  acceptLabel={`Accept order (${mmss})`}
                  acceptDisabled={secondsLeft <= 0}
                  acceptProgressPct={
                    Math.min(
                      100,
                      Math.max(
                        0,
                        Math.round(
                          (1 - secondsLeft / Math.max(1, Math.round(acceptWindowMs / 1000))) * 100
                        )
                      )
                    )
                  }
                />
              </div>
            </div>
          </div>
        )}

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

      <RejectOrderSidesheet
        open={!!modalOrder && rejectOpen}
        order={modalOrder}
        loading={actionLoading}
        onClose={() => {
          setRejectOpen(false);
        }}
        onConfirm={(reason) =>
          void patchStatus('CANCELLED', { rejected_reason: reason }, 'manual')
        }
      />
    </>
  );
}


