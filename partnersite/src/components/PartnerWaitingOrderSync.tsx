'use client';

import { useCallback, useEffect, useRef } from 'react';
import { isValidPartnerStoreId } from '@/lib/partner-store-id-shared';
import { WAITING_FOR_ORDER_TITLE } from '@/lib/partner-notification-constants';

const POLL_MS = 12_000;
const RETRIGGER_MS = 4000;

type Props = {
  storeId: string | null;
  /** Operational OPEN / online for orders */
  isOnline: boolean;
  /** Whether the current notification list already contains a waiting row */
  hasWaitingInList: boolean;
  onListChange?: () => void;
};

function isWaitingTitle(title: string): boolean {
  return title.trim() === WAITING_FOR_ORDER_TITLE;
}

export function PartnerWaitingOrderSync({
  storeId,
  isOnline,
  hasWaitingInList,
  onListChange,
}: Props) {
  const skipRetriggerRef = useRef(false);
  const prevHadWaitingRef = useRef(false);
  const retriggerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshListTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storeIdRef = useRef(storeId);
  const isOnlineRef = useRef(isOnline);
  const onListChangeRef = useRef(onListChange);

  storeIdRef.current = storeId;
  isOnlineRef.current = isOnline;
  onListChangeRef.current = onListChange;

  const refreshList = useCallback(() => {
    try {
      onListChangeRef.current?.();
    } catch {
      /* ignore */
    }
  }, []);

  const scheduleRefreshList = useCallback(() => {
    if (refreshListTimerRef.current) clearTimeout(refreshListTimerRef.current);
    refreshListTimerRef.current = setTimeout(() => {
      refreshListTimerRef.current = null;
      refreshList();
    }, 600);
  }, [refreshList]);

  /** User deleted waiting row while still idle → re-ensure after delay */
  useEffect(() => {
    const prev = prevHadWaitingRef.current;
    prevHadWaitingRef.current = hasWaitingInList;

    const sid = storeIdRef.current;
    const online = isOnlineRef.current;

    if (!sid || !isValidPartnerStoreId(sid)) {
      if (retriggerTimerRef.current) {
        clearTimeout(retriggerTimerRef.current);
        retriggerTimerRef.current = null;
      }
      return;
    }

    if (!online) {
      if (retriggerTimerRef.current) {
        clearTimeout(retriggerTimerRef.current);
        retriggerTimerRef.current = null;
      }
      return;
    }

    if (prev === true && hasWaitingInList === false && !skipRetriggerRef.current) {
      if (retriggerTimerRef.current) clearTimeout(retriggerTimerRef.current);
      retriggerTimerRef.current = setTimeout(() => {
        retriggerTimerRef.current = null;
        void (async () => {
          const id = storeIdRef.current;
          if (!id || !isOnlineRef.current) return;
          try {
            const ac = await fetch(
              `/api/merchant/active-orders-count?store_id=${encodeURIComponent(id)}`,
              { credentials: 'include' }
            );
            const acData = await ac.json().catch(() => ({}));
            const active = Number((acData as { active_orders?: number }).active_orders ?? 0);
            if (active > 0) return;
            const r = await fetch('/api/merchant/store-notifications', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ store_id: id, action: 'ensure_waiting' }),
            });
            if (r.ok) refreshList();
          } catch {
            /* ignore */
          }
        })();
      }, RETRIGGER_MS);
    }

    return () => {
      if (retriggerTimerRef.current) {
        clearTimeout(retriggerTimerRef.current);
        retriggerTimerRef.current = null;
      }
    };
  }, [hasWaitingInList, refreshList]);

  useEffect(() => {
    if (!storeId || !isValidPartnerStoreId(storeId)) return undefined;

    let cancelled = false;

    const run = async () => {
      if (cancelled || !storeIdRef.current || !isValidPartnerStoreId(storeIdRef.current)) return;
      const sid = storeIdRef.current;
      try {
        const acRes = await fetch(
          `/api/merchant/active-orders-count?store_id=${encodeURIComponent(sid)}`,
          { credentials: 'include' }
        );
        const acData = await acRes.json().catch(() => ({}));
        const active = Number((acData as { active_orders?: number }).active_orders ?? 0);

        if (active > 0) {
          skipRetriggerRef.current = true;
          try {
            await fetch(
              `/api/merchant/store-notifications?store_id=${encodeURIComponent(sid)}&kind=waiting`,
              { method: 'DELETE', credentials: 'include' }
            );
            scheduleRefreshList();
          } finally {
            window.setTimeout(() => {
              skipRetriggerRef.current = false;
            }, 800);
          }
          return;
        }

        if (!isOnlineRef.current) {
          skipRetriggerRef.current = true;
          try {
            await fetch(
              `/api/merchant/store-notifications?store_id=${encodeURIComponent(sid)}&kind=waiting`,
              { method: 'DELETE', credentials: 'include' }
            );
            scheduleRefreshList();
          } finally {
            window.setTimeout(() => {
              skipRetriggerRef.current = false;
            }, 800);
          }
          return;
        }

        const res = await fetch('/api/merchant/store-notifications', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_id: sid, action: 'ensure_waiting' }),
        });
        if (res.ok) {
          const body = (await res.json().catch(() => ({}))) as { created?: boolean };
          if (body.created) refreshList();
        }
      } catch {
        /* ignore */
      }
    };

    void run();
    const timer = window.setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [storeId, isOnline, refreshList, scheduleRefreshList]);

  return null;
}

export function notificationListHasWaiting(
  list: Array<{ title: string }> | undefined
): boolean {
  return (list ?? []).some((n) => isWaitingTitle(n.title));
}
