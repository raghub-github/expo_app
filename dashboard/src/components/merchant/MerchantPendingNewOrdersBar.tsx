'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { fetchMerchantStoreApi } from '@/lib/fetch-merchant-store-api';
import Link from 'next/link';
import { Bell, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAppPathname, useAppSearchParams } from "@/hooks/useAppSearchParams";

import { useStoreContext } from '@/app/dashboard/merchants/stores/[id]/StoreContext';
import { subscribeMenuItemFormModalOpen } from '@/lib/merchant-menu-form-modal-bus';

function isOnNewOrdersSection(pathname: string, filterParam: string | null): boolean {
  const onOrdersPage = pathname.includes('/orders');
  if (!onOrdersPage) return false;
  const f = (filterParam || '').toUpperCase();
  return f === 'NEW_ORDERS' || f === 'CREATED' || f === 'NEW';
}

const POLL_MS = 12_000;

/**
 * Global floating badge: pending acceptance count on every store dashboard page.
 */
function MerchantPendingNewOrdersBarInner() {
  const { storeId } = useStoreContext();
  const pathname = useAppPathname() || '';
  const searchParams = useAppSearchParams();
  const onNewOrdersList = isOnNewOrdersSection(pathname, searchParams?.get('filter') ?? null);
  const [pending, setPending] = useState(0);
  const [menuItemFormOpen, setMenuItemFormOpen] = useState(false);
  const [showFloatingOrders, setShowFloatingOrders] = useState(true);
  const prevPendingRef = useRef(0);
  const storeInternalId = parseInt(storeId, 10);

  const load = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetchMerchantStoreApi(
        `/api/merchant/stores/${storeId}/pending-new-orders-count`
      );
      const data = (await res.json().catch(() => ({}))) as { count?: number };
      if (res.ok && typeof data.count === 'number') setPending(data.count);
    } catch {
      /* ignore */
    }
  }, [storeId]);

  useEffect(() => subscribeMenuItemFormModalOpen(setMenuItemFormOpen), []);

  useEffect(() => {
    if (menuItemFormOpen) return;
    const boot = window.setTimeout(() => void load(), 400);
    const t = window.setInterval(() => {
      if (document.body?.dataset?.menuItemFormOpen === '1') return;
      void load();
    }, POLL_MS);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(t);
    };
  }, [load, menuItemFormOpen]);

  useEffect(() => {
    if (!storeId) return;
    void (async () => {
      try {
        const res = await fetchMerchantStoreApi(
          `/api/merchant/stores/${storeId}/store-settings`
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok) setShowFloatingOrders(data.show_floating_orders !== false);
      } catch {
        setShowFloatingOrders(true);
      }
    })();
  }, [storeId]);

  useEffect(() => {
    if (!Number.isFinite(storeInternalId)) return;
    const ch = supabase
      .channel(`merchant_pending_badge:${storeInternalId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders_core', filter: `merchant_store_id=eq.${storeInternalId}` },
        () => void load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders_food', filter: `merchant_store_id=eq.${storeInternalId}` },
        () => void load()
      )
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [storeInternalId, load]);

  useEffect(() => {
    const onRefresh = () => void load();
    window.addEventListener('merchant-pending-orders-refresh', onRefresh);
    return () => window.removeEventListener('merchant-pending-orders-refresh', onRefresh);
  }, [load]);

  useEffect(() => {
    if (menuItemFormOpen) {
      prevPendingRef.current = pending;
      return;
    }
    if (pending > prevPendingRef.current) {
      try {
        window.dispatchEvent(new CustomEvent('merchant-incoming-order-scan'));
      } catch {
        /* ignore */
      }
    }
    prevPendingRef.current = pending;
  }, [pending, menuItemFormOpen]);

  if (!showFloatingOrders || onNewOrdersList || pending <= 0 || !storeId) return null;

  const href = `/dashboard/merchants/stores/${storeId}/orders?filter=NEW_ORDERS`;
  const label =
    pending === 1 ? '1 new order — tap to accept' : `${pending} new orders — tap to accept`;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[200] flex justify-center px-3 sm:bottom-5">
      <Link
        href={href}
        className="pointer-events-auto flex max-w-lg items-center gap-3 rounded-full bg-emerald-600 px-5 py-3.5 text-white shadow-xl shadow-emerald-900/30 ring-2 ring-white/20 transition hover:scale-[1.02] hover:bg-emerald-700 active:scale-[0.98]"
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

export function MerchantPendingNewOrdersBar() {
  return (
    <Suspense fallback={null}>
      <MerchantPendingNewOrdersBarInner />
    </Suspense>
  );
}
