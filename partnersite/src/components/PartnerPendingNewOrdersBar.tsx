'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronUp, Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  PARTNER_INCOMING_MODAL_CLOSED,
  PARTNER_INCOMING_MODAL_OPEN,
  PARTNER_PENDING_ORDERS_REFRESH,
  PARTNER_SELECTED_STORE_CHANGED,
  readPartnerSelectedStoreId,
  usePartnerSelectedStore,
} from '@/lib/partner-selected-store';

const POLL_MS = 12_000;

function ordersHref(pathname: string, storeId: string): string {
  const q = `filter=NEW_ORDERS&store_id=${encodeURIComponent(storeId)}`;
  if (pathname.startsWith('/mx')) return `/mx/food-orders?${q}`;
  return `/partners/orders?${q}`;
}

function isOnNewOrdersSection(pathname: string, filterParam: string | null): boolean {
  const onOrdersPage =
    pathname.startsWith('/mx/food-orders') || pathname.startsWith('/partners/orders');
  if (!onOrdersPage) return false;
  const f = (filterParam || '').toUpperCase();
  return f === 'NEW_ORDERS' || f === 'CREATED' || f === 'NEW';
}

/**
 * Global floating badge when pending orders exist, unless user is on New orders list
 * or has disabled "Show floating orders" in settings.
 */
function PartnerPendingNewOrdersBarInner({ restaurantId }: { restaurantId?: string }) {
  const pathname = usePathname() || '';
  const searchParams = useSearchParams();
  const filterParam = searchParams?.get('filter') ?? null;
  const onNewOrdersList = isOnNewOrdersSection(pathname, filterParam);

  const { storeId, storeInternalId: internalId, ready: storeReady } =
    usePartnerSelectedStore(restaurantId);
  const [pending, setPending] = useState<number>(0);
  const [showFloatingOrders, setShowFloatingOrders] = useState(true);
  const [incomingModalOpen, setIncomingModalOpen] = useState(false);

  const loadPending = useCallback(async () => {
    const sid = readPartnerSelectedStoreId(restaurantId);
    if (!sid) return;
    try {
      const res = await fetch(
        `/api/merchant/pending-new-orders-count?store_id=${encodeURIComponent(sid)}`
      );
      const data = (await res.json().catch(() => ({}))) as { count?: number };
      if (res.ok && typeof data.count === 'number') setPending(data.count);
    } catch {
      /* ignore */
    }
  }, [restaurantId]);

  const loadFloatingSetting = useCallback(async () => {
    const sid = readPartnerSelectedStoreId(restaurantId);
    if (!sid) return;
    try {
      const res = await fetch(`/api/merchant/store-settings?storeId=${encodeURIComponent(sid)}`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setShowFloatingOrders(data.show_floating_orders !== false);
      } else {
        setShowFloatingOrders(true);
      }
    } catch {
      setShowFloatingOrders(true);
    }
  }, [restaurantId]);

  useEffect(() => {
    void loadPending();
    const t = window.setInterval(() => void loadPending(), POLL_MS);
    return () => window.clearInterval(t);
  }, [loadPending]);

  useEffect(() => {
    void loadFloatingSetting();
  }, [loadFloatingSetting]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'selectedStoreId') void loadPending();
    };
    const onStore = () => void loadPending();
    window.addEventListener('storage', onStorage);
    window.addEventListener(PARTNER_SELECTED_STORE_CHANGED, onStore);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(PARTNER_SELECTED_STORE_CHANGED, onStore);
    };
  }, [loadPending]);

  useEffect(() => {
    const onRefresh = () => void loadPending();
    window.addEventListener(PARTNER_PENDING_ORDERS_REFRESH, onRefresh);
    return () => window.removeEventListener(PARTNER_PENDING_ORDERS_REFRESH, onRefresh);
  }, [loadPending]);

  useEffect(() => {
    const onOpen = () => setIncomingModalOpen(true);
    const onClose = () => setIncomingModalOpen(false);
    window.addEventListener(PARTNER_INCOMING_MODAL_OPEN, onOpen);
    window.addEventListener(PARTNER_INCOMING_MODAL_CLOSED, onClose);
    return () => {
      window.removeEventListener(PARTNER_INCOMING_MODAL_OPEN, onOpen);
      window.removeEventListener(PARTNER_INCOMING_MODAL_CLOSED, onClose);
    };
  }, []);

  useEffect(() => {
    const onSettings = () => void loadFloatingSetting();
    window.addEventListener('partner-store-settings-changed', onSettings);
    return () => window.removeEventListener('partner-store-settings-changed', onSettings);
  }, [loadFloatingSetting]);

  useEffect(() => {
    if (!storeReady) return;
    void loadPending();
  }, [storeReady, loadPending]);

  useEffect(() => {
    if (!internalId) return;
    const supabase = createClient();
    const ch = supabase
      .channel(`pending_new_badge:${internalId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders_core',
          filter: `merchant_store_id=eq.${internalId}`,
        },
        () => {
          void loadPending();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders_food',
          filter: `merchant_store_id=eq.${internalId}`,
        },
        () => {
          void loadPending();
        }
      )
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [internalId, loadPending]);

  if (!showFloatingOrders || onNewOrdersList || pending <= 0 || incomingModalOpen) return null;

  const sid = storeId || readPartnerSelectedStoreId(restaurantId);
  if (!sid) return null;

  const label =
    pending === 1 ? '1 new order — tap to accept' : `${pending} new orders — tap to accept`;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[200] flex justify-center px-3 sm:bottom-5">
      <Link
        href={ordersHref(pathname, sid)}
        onClick={() => {
          window.dispatchEvent(new CustomEvent('partner-incoming-order-rescan'));
        }}
        className="pointer-events-auto flex max-w-lg items-center gap-3 rounded-full bg-emerald-600 px-5 py-3.5 text-white shadow-xl shadow-emerald-900/30 ring-2 ring-white/20 transition hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98]"
        aria-label={label}
      >
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-emerald-700">
          <Bell className="h-5 w-5" aria-hidden />
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white tabular-nums">
            {pending > 99 ? '99+' : pending}
          </span>
        </span>
        <span className="min-w-0 flex-1 text-sm font-bold leading-tight sm:text-base">{label}</span>
        <ChevronUp className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
      </Link>
    </div>
  );
}

/** Use in layout with Suspense (needs useSearchParams). */
export function PartnerPendingNewOrdersBar(props: { restaurantId?: string }) {
  return (
    <Suspense fallback={null}>
      <PartnerPendingNewOrdersBarInner {...props} />
    </Suspense>
  );
}
