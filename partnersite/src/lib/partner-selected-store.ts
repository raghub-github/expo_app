'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchStoreById } from '@/lib/database';
import { DEMO_RESTAURANT_ID } from '@/lib/constants';

export const PARTNER_SELECTED_STORE_CHANGED = 'partner-selected-store-changed';
export const PARTNER_INCOMING_MODAL_OPEN = 'partner-incoming-order-modal-open';
export const PARTNER_INCOMING_MODAL_CLOSED = 'partner-incoming-order-modal-closed';
export const PARTNER_PENDING_ORDERS_REFRESH = 'partner-pending-orders-refresh';

import { isValidPartnerStoreId } from '@/lib/partner-store-id-shared';

export { isValidPartnerStoreId };

const INVALID = new Set(['', 'no id', 'loading...', 'unknown store', '—', '-']);

export function readPartnerSelectedStoreId(prop?: string): string {
  const raw = (prop || '').trim();
  const lower = raw.toLowerCase();
  if (raw && !INVALID.has(lower)) return raw;
  if (typeof window !== 'undefined') {
    const ls = (localStorage.getItem('selectedStoreId') || '').trim();
    if (ls) return ls;
    const url = new URLSearchParams(window.location.search).get('storeId')?.trim();
    if (url) return url;
  }
  return DEMO_RESTAURANT_ID;
}

/** Call after writing `selectedStoreId` to localStorage (same-tab listeners). */
export function notifyPartnerSelectedStoreChanged(storeId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(PARTNER_SELECTED_STORE_CHANGED, { detail: { storeId } })
  );
}

export function persistPartnerSelectedStoreId(storeId: string): void {
  if (typeof window === 'undefined' || !storeId.trim()) return;
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
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeInternalId, setStoreInternalId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  const resolve = useCallback(async (raw: string) => {
    if (!raw) {
      setStoreId(null);
      setStoreInternalId(null);
      setReady(true);
      return;
    }
    const s = await fetchStoreById(raw);
    if (s) {
      setStoreInternalId(Number(s.id));
      setStoreId(String(s.store_id ?? raw));
    } else {
      setStoreId(raw);
      setStoreInternalId(/^\d+$/.test(raw) ? parseInt(raw, 10) : null);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    const sync = () => {
      const id = readPartnerSelectedStoreId(restaurantIdProp);
      setReady(false);
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
