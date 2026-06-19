'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchStoreById } from '@/lib/database';
import { merchantKeys } from '@/lib/query-keys';
import { isValidPartnerStoreId } from '@/lib/partner-store-id-shared';

export { isValidPartnerStoreId };

export const PARTNER_SELECTED_STORE_CHANGED = 'partner-selected-store-changed';
export const PARTNER_INCOMING_MODAL_OPEN = 'partner-incoming-order-modal-open';
export const PARTNER_INCOMING_MODAL_CLOSED = 'partner-incoming-order-modal-closed';
export const PARTNER_INCOMING_MODAL_SUPPRESS_CLEARED = 'partner-incoming-modal-suppress-cleared';
export const PARTNER_PENDING_ORDERS_REFRESH = 'partner-pending-orders-refresh';

const INCOMING_MODAL_SUPPRESS_KEY = 'partner_incoming_modal_auto_suppressed_v1';

/** Merchant closed accept modal with X — block auto-popup until floating bar tap. */
export function setPartnerIncomingModalSuppressed(storeId: string): void {
  if (typeof window === 'undefined' || !isValidPartnerStoreId(storeId)) return;
  try {
    sessionStorage.setItem(INCOMING_MODAL_SUPPRESS_KEY, storeId.trim());
  } catch {
    /* ignore */
  }
}

export function isPartnerIncomingModalSuppressed(storeId: string | null | undefined): boolean {
  if (typeof window === 'undefined' || !storeId) return false;
  try {
    return sessionStorage.getItem(INCOMING_MODAL_SUPPRESS_KEY) === storeId.trim();
  } catch {
    return false;
  }
}

export function clearPartnerIncomingModalSuppressed(storeId: string): void {
  if (typeof window === 'undefined' || !isValidPartnerStoreId(storeId)) return;
  try {
    const cur = sessionStorage.getItem(INCOMING_MODAL_SUPPRESS_KEY);
    if (cur === storeId.trim()) {
      sessionStorage.removeItem(INCOMING_MODAL_SUPPRESS_KEY);
      window.dispatchEvent(new CustomEvent(PARTNER_INCOMING_MODAL_SUPPRESS_CLEARED));
    }
  } catch {
    /* ignore */
  }
}
export function readPartnerSelectedStoreId(prop?: string): string {
  const raw = (prop || '').trim();
  if (isValidPartnerStoreId(raw)) return raw;
  if (typeof window !== 'undefined') {
    const ls = (localStorage.getItem('selectedStoreId') || '').trim();
    if (isValidPartnerStoreId(ls)) return ls;
    if (ls) localStorage.removeItem('selectedStoreId');
    const url = new URLSearchParams(window.location.search).get('storeId')?.trim();
    if (isValidPartnerStoreId(url)) return url!;
  }
  return '';
}

/** Call after writing `selectedStoreId` to localStorage (same-tab listeners). */
export function notifyPartnerSelectedStoreChanged(storeId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(PARTNER_SELECTED_STORE_CHANGED, { detail: { storeId } })
  );
}

export function persistPartnerSelectedStoreId(storeId: string): void {
  if (typeof window === 'undefined' || !isValidPartnerStoreId(storeId)) return;
  localStorage.setItem('selectedStoreId', storeId.trim());
  notifyPartnerSelectedStoreChanged(storeId.trim());
}

export type PartnerSelectedStore = {
  storeId: string | null;
  storeInternalId: number | null;
  ready: boolean;
};

/**
 * Resolves public store_id + merchant_stores.id for realtime filters and APIs.
 */
export function usePartnerSelectedStore(restaurantIdProp?: string): PartnerSelectedStore {
  const queryClient = useQueryClient();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeInternalId, setStoreInternalId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  const resolve = useCallback(async (raw: string) => {
    if (!raw || !isValidPartnerStoreId(raw)) {
      setStoreId(null);
      setStoreInternalId(null);
      setReady(true);
      return;
    }

    const cached = queryClient.getQueryData<{ id?: number; store_id?: string }>(
      merchantKeys.storeRecord(raw)
    );
    if (cached?.id != null) {
      setStoreInternalId(Number(cached.id));
      setStoreId(String(cached.store_id ?? raw));
      setReady(true);
      return;
    }

    const s = await fetchStoreById(raw);
    if (s) {
      queryClient.setQueryData(merchantKeys.storeRecord(String(s.store_id ?? raw)), s);
      setStoreInternalId(Number(s.id));
      setStoreId(String(s.store_id ?? raw));
    } else {
      setStoreId(raw);
      setStoreInternalId(/^\d+$/.test(raw) ? parseInt(raw, 10) : null);
    }
    setReady(true);
  }, [queryClient]);

  useEffect(() => {
    const sync = () => {
      const id = readPartnerSelectedStoreId(restaurantIdProp);
      void resolve(id);
    };
    sync();

    const onStore = () => sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'selectedStoreId') sync();
    };
    window.addEventListener(PARTNER_SELECTED_STORE_CHANGED, onStore);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PARTNER_SELECTED_STORE_CHANGED, onStore);
      window.removeEventListener('storage', onStorage);
    };
  }, [restaurantIdProp, resolve]);

  return { storeId, storeInternalId, ready };
}
