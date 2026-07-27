'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchStoreById } from '@/lib/database';
import { merchantKeys } from '@/lib/query-keys';
import { isValidPartnerStoreId } from '@/lib/partner-store-id-shared';

export { isValidPartnerStoreId };
export const PARTNER_SELECTED_STORE_CHANGED = 'partner-selected-store-changed';
export const PARTNER_MANAGED_STORES_CHANGED = 'partner-managed-stores-changed';
export const PARTNER_INCOMING_MODAL_OPEN = 'partner-incoming-order-modal-open';
export const PARTNER_INCOMING_MODAL_CLOSED = 'partner-incoming-order-modal-closed';
export const PARTNER_INCOMING_MODAL_SUPPRESS_CLEARED = 'partner-incoming-modal-suppress-cleared';
export const PARTNER_PENDING_ORDERS_REFRESH = 'partner-pending-orders-refresh';

const INCOMING_MODAL_SUPPRESS_KEY = 'partner_incoming_modal_auto_suppressed_v1';
const MANAGED_STORES_KEY = 'partnerManagedStoreIds';

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

export function clearPartnerSelectedStoreId(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('selectedStoreId');
  } catch {
    /* ignore */
  }
  notifyPartnerSelectedStoreChanged('');
}

/** Clear selected + managed store IDs (login / register / logout). */
export function clearPartnerStoreSelection(): void {
  clearPartnerSelectedStoreId();
  clearPartnerManagedStoreIds();
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('restaurantId');
    localStorage.removeItem('restaurantName');
    localStorage.removeItem('storeList');
  } catch {
    /* ignore */
  }
}

export function notifyPartnerManagedStoresChanged(storeIds: string[]): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(PARTNER_MANAGED_STORES_CHANGED, { detail: { storeIds } })
  );
}

/** Public store_ids whose orders share one board / incoming modal. */
export function readPartnerManagedStoreIds(fallbackPrimary?: string | null): string[] {
  if (typeof window === 'undefined') {
    const fb = (fallbackPrimary || '').trim();
    return isValidPartnerStoreId(fb) ? [fb] : [];
  }
  try {
    const raw = localStorage.getItem(MANAGED_STORES_KEY);
    if (raw?.trim()) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const ids = parsed
          .map((x) => String(x || '').trim())
          .filter((id) => isValidPartnerStoreId(id));
        if (ids.length > 0) return [...new Set(ids)];
      }
    }
  } catch {
    /* fall through */
  }
  const fb = (fallbackPrimary || readPartnerSelectedStoreId()).trim();
  return isValidPartnerStoreId(fb) ? [fb] : [];
}

export function persistPartnerManagedStoreIds(storeIds: string[]): void {
  if (typeof window === 'undefined') return;
  const ids = [...new Set(storeIds.map((s) => s.trim()).filter((id) => isValidPartnerStoreId(id)))];
  if (ids.length === 0) {
    try {
      localStorage.removeItem(MANAGED_STORES_KEY);
    } catch {
      /* ignore */
    }
    notifyPartnerManagedStoresChanged([]);
    return;
  }
  localStorage.setItem(MANAGED_STORES_KEY, JSON.stringify(ids));
  notifyPartnerManagedStoresChanged(ids);
}

export function clearPartnerManagedStoreIds(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(MANAGED_STORES_KEY);
  } catch {
    /* ignore */
  }
  notifyPartnerManagedStoresChanged([]);
}

/** Short locality for incoming-order headers (town/area). */
export function shortLocalityFromAddress(fullAddress: string | null | undefined): string {
  if (!fullAddress?.trim()) return '';
  const parts = fullAddress.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const candidate = parts[parts.length - 2] ?? parts[0]!;
    return candidate.replace(/^\d{5,6}\s+/, '').trim() || candidate;
  }
  return parts[0] ?? '';
}

export type PartnerStoreMeta = {
  storeId: string;
  internalId: number;
  name: string;
  locality: string;
};

export type PartnerSelectedStore = {
  storeId: string | null;
  storeInternalId: number | null;
  ready: boolean;
  /** Public store_ids included in multi-outlet order management. */
  managedStoreIds: string[];
  /** Internal merchant_stores.id for each managed outlet. */
  managedInternalIds: number[];
  /** Lookup by internal merchant_store_id. */
  metaByInternalId: Map<number, PartnerStoreMeta>;
};

/**
 * Resolves public store_id + merchant_stores.id for realtime filters and APIs.
 * Also restores multi-outlet "manage orders from" selection.
 */
export function usePartnerSelectedStore(restaurantIdProp?: string): PartnerSelectedStore {
  const queryClient = useQueryClient();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeInternalId, setStoreInternalId] = useState<number | null>(null);
  const [managedStoreIds, setManagedStoreIds] = useState<string[]>([]);
  const [metaByInternalId, setMetaByInternalId] = useState<Map<number, PartnerStoreMeta>>(
    () => new Map()
  );
  const [ready, setReady] = useState(false);

  const resolveOne = useCallback(
    async (raw: string): Promise<PartnerStoreMeta | null> => {
      if (!raw || !isValidPartnerStoreId(raw)) return null;
      const cached = queryClient.getQueryData<{
        id?: number;
        store_id?: string;
        store_name?: string | null;
        full_address?: string | null;
      }>(merchantKeys.storeRecord(raw));
      if (cached?.id != null) {
        return {
          storeId: String(cached.store_id ?? raw),
          internalId: Number(cached.id),
          name: String(cached.store_name ?? raw),
          locality: shortLocalityFromAddress(cached.full_address),
        };
      }
      const s = await fetchStoreById(raw);
      if (!s) return null;
      queryClient.setQueryData(merchantKeys.storeRecord(String(s.store_id ?? raw)), s);
      return {
        storeId: String(s.store_id ?? raw),
        internalId: Number(s.id),
        name: String(s.store_name ?? raw),
        locality: shortLocalityFromAddress(
          typeof (s as { full_address?: string }).full_address === 'string'
            ? (s as { full_address?: string }).full_address
            : ''
        ),
      };
    },
    [queryClient]
  );

  const resolve = useCallback(async () => {
    const primary = readPartnerSelectedStoreId(restaurantIdProp);
    const managed = readPartnerManagedStoreIds(primary);
    const ids = managed.length > 0 ? managed : primary ? [primary] : [];

    if (ids.length === 0) {
      setStoreId(null);
      setStoreInternalId(null);
      setManagedStoreIds([]);
      setMetaByInternalId(new Map());
      setReady(true);
      return;
    }

    const metas = (await Promise.all(ids.map((id) => resolveOne(id)))).filter(
      (m): m is PartnerStoreMeta => m != null
    );
    const map = new Map<number, PartnerStoreMeta>();
    for (const m of metas) map.set(m.internalId, m);

    const primaryMeta =
      metas.find((m) => m.storeId === primary) ??
      (primary ? await resolveOne(primary) : null) ??
      metas[0] ??
      null;

    setManagedStoreIds(metas.map((m) => m.storeId));
    setMetaByInternalId(map);
    if (primaryMeta) {
      setStoreId(primaryMeta.storeId);
      setStoreInternalId(primaryMeta.internalId);
    } else {
      setStoreId(primary || ids[0] || null);
      setStoreInternalId(null);
    }
    setReady(true);
  }, [restaurantIdProp, resolveOne]);

  useEffect(() => {
    void resolve();

    const onStore = () => void resolve();
    const onManaged = () => void resolve();
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'selectedStoreId' || e.key === MANAGED_STORES_KEY) void resolve();
    };
    window.addEventListener(PARTNER_SELECTED_STORE_CHANGED, onStore);
    window.addEventListener(PARTNER_MANAGED_STORES_CHANGED, onManaged);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PARTNER_SELECTED_STORE_CHANGED, onStore);
      window.removeEventListener(PARTNER_MANAGED_STORES_CHANGED, onManaged);
      window.removeEventListener('storage', onStorage);
    };
  }, [resolve]);

  const managedInternalIds = useMemo(
    () =>
      [...metaByInternalId.keys()].filter((id) => Number.isFinite(id) && id > 0).sort((a, b) => a - b),
    [metaByInternalId]
  );

  return {
    storeId,
    storeInternalId,
    ready,
    managedStoreIds,
    managedInternalIds,
    metaByInternalId,
  };
}
