'use client';

/**
 * Partnersite waiting-for-order inbox sync is backend-owned (store open/close).
 * This component only refreshes the list when online status changes and clears
 * the waiting row when the store goes offline.
 */

import { useEffect, useRef } from 'react';
import { isValidPartnerStoreId } from '@/lib/partner-store-id-shared';
import { WAITING_FOR_ORDER_TITLE } from '@/lib/partner-notification-constants';

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

export function notificationListHasWaiting(
  list: Array<{ title: string }> | undefined
): boolean {
  return (list ?? []).some((n) => isWaitingTitle(n.title));
}

export function PartnerWaitingOrderSync({
  storeId,
  isOnline,
  hasWaitingInList,
  onListChange,
}: Props) {
  const prevOnlineRef = useRef<boolean | null>(null);
  const onListChangeRef = useRef(onListChange);
  onListChangeRef.current = onListChange;

  useEffect(() => {
    if (!storeId || !isValidPartnerStoreId(storeId)) return;
    let cancelled = false;

    void (async () => {
      try {
        if (!isOnline) {
          await fetch('/api/merchant/store-notifications', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete_waiting', store_id: storeId }),
          }).catch(() => undefined);
          if (!cancelled) onListChangeRef.current?.();
        } else if (prevOnlineRef.current === false) {
          // Backend ensure already ran on open — refresh inbox only.
          onListChangeRef.current?.();
        }
      } finally {
        prevOnlineRef.current = isOnline;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storeId, isOnline]);

  void hasWaitingInList;
  return null;
}
