'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronUp, Bell } from 'lucide-react';
import { fetchStoreById } from '@/lib/database';
import { DEMO_RESTAURANT_ID } from '@/lib/constants';
import { createClient } from '@/lib/supabase/client';

const POLL_MS = 15_000;

const INVALID_STORE_PLACEHOLDERS = new Set([
  '',
  'no id',
  'loading...',
  'unknown store',
  '—',
  '-',
]);

function resolveStoreIdFromEnv(restaurantIdProp?: string): string {
  const raw = (restaurantIdProp || '').trim();
  const lower = raw.toLowerCase();
  if (raw && !INVALID_STORE_PLACEHOLDERS.has(lower)) {
    return raw;
  }
  if (typeof window !== 'undefined') {
    const ls = (localStorage.getItem('selectedStoreId') || '').trim();
    if (ls) return ls;
  }
  return DEMO_RESTAURANT_ID;
}

/**
 * Zomato-style bottom bar when there are unaccepted orders (New orders pipeline).
 * Hidden only while user is already on Food orders with filter NEW_ORDERS.
 */
function PartnerPendingNewOrdersBarInner({ restaurantId }: { restaurantId?: string }) {
  const pathname = usePathname() || '';
  const searchParams = useSearchParams();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [internalId, setInternalId] = useState<number | null>(null);
  const [pending, setPending] = useState<number>(0);
  const [showFloatingOrders, setShowFloatingOrders] = useState<boolean>(true);

  useEffect(() => {
    setStoreId(resolveStoreIdFromEnv(restaurantId));
  }, [restaurantId]);

  useEffect(() => {
    if (!storeId) return;
    void (async () => {
      const s = await fetchStoreById(storeId);
      setInternalId(s?.id ?? null);
    })();
  }, [storeId]);

  useEffect(() => {
    const sid = resolveStoreIdFromEnv(restaurantId);
    if (!sid) return;
    void (async () => {
      try {
        const res = await fetch(`/api/merchant/store-settings?storeId=${encodeURIComponent(sid)}`, { credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (res.ok) setShowFloatingOrders(data.show_floating_orders !== false);
      } catch {
        /* ignore */
      }
    })();
  }, [restaurantId]);

  const load = useCallback(async () => {
    const sid = resolveStoreIdFromEnv(restaurantId);
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

  useEffect(() => {
    load();
    const t = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'selectedStoreId') void load();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [load]);

  useEffect(() => {
    if (!internalId) return;
    const sid = resolveStoreIdFromEnv(restaurantId);
    if (!sid) return;
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
          void load();
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
          void load();
        }
      )
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [internalId, restaurantId, load]);

  const isFoodOrders = pathname.includes('/mx/food-orders');
  const filter = (searchParams?.get('filter') || '').toUpperCase();
  /** Already viewing the New orders list — hide floating strip to avoid duplicate UI */
  const onNewOrdersList = isFoodOrders && filter === 'NEW_ORDERS';

  if (!showFloatingOrders) return null;
  if (onNewOrdersList || pending <= 0) return null;

  const sid = storeId || resolveStoreIdFromEnv(restaurantId);
  if (!sid) return null;

  const label = pending === 1 ? 'You have 1 new order' : `You have ${pending} new orders`;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[160] flex justify-center px-3">
      <Link
        href={`/mx/food-orders?filter=NEW_ORDERS&store_id=${encodeURIComponent(sid)}`}
        className="pointer-events-auto flex max-w-lg items-center gap-3 rounded-lg bg-emerald-600 px-4 py-3 text-white shadow-lg shadow-emerald-900/25 transition hover:bg-emerald-700"
      >
        <ChevronUp className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
        <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold">
          <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-white/20 px-2 text-xs font-bold tabular-nums">
            {pending}
          </span>
          <span className="truncate">{label}</span>
        </span>
        <Bell className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
      </Link>
    </div>
  );
}

/** Use in layout with Suspense (useSearchParams). */
export function PartnerPendingNewOrdersBar(props: { restaurantId?: string }) {
  return (
    <Suspense fallback={null}>
      <PartnerPendingNewOrdersBarInner {...props} />
    </Suspense>
  );
}
