'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  clearPartnerStoreSelection,
  readPartnerLastParentId,
  readPartnerSelectedStoreId,
} from '@/lib/partner-selected-store';
import { allStoresPickerHref } from '@/lib/partner-all-stores-href';
import { PartnerContentSkeleton } from '@/components/PageSkeleton';
import { usePartnerResolveSession } from '@/hooks/usePartnerResolveSession';

type ResolvePayload = {
  success?: boolean;
  code?: string;
  parentId?: number;
  stores?: Array<{ store_id: string }>;
  onboardingProgress?: { parent_id?: number } | null;
};

const FATAL_AUTH_CODES = new Set([
  'SESSION_INVALID',
  'DEVICE_SESSION_INVALID',
]);

/**
 * Blocks /partners/* (except all-stores) until the parent owns ≥1 child store.
 * Also clears stale selectedStoreId that belongs to another merchant.
 *
 * Hydration-safe: initial `allowed` never reads `window` / localStorage (that caused
 * server PartnerContentSkeleton vs client Dashboard Suspense mismatch).
 * After mount, allow immediately when an outlet is already selected, then verify.
 */
export function PartnerStoreAccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();

  const isAllStores = pathname === '/partners/all-stores' || pathname.startsWith('/partners/all-stores/');

  // Deterministic SSR + first client paint — never branch on window here.
  const [allowed, setAllowed] = useState<boolean>(() => isAllStores);
  const [pendingGate, setPendingGate] = useState<boolean>(() => !isAllStores);

  const { data: cachedSession } = usePartnerResolveSession({ enabled: !isAllStores });

  // After hydration: paint immediately if outlet is selected or RQ already has session.
  useEffect(() => {
    if (isAllStores) {
      setAllowed(true);
      setPendingGate(false);
      return;
    }
    if (cachedSession?.success && (cachedSession.stores?.length ?? 0) > 0) {
      setAllowed(true);
      setPendingGate(false);
      return;
    }
    if (readPartnerSelectedStoreId()) {
      setAllowed(true);
      setPendingGate(false);
    }
  }, [isAllStores, cachedSession]);

  useEffect(() => {
    let cancelled = false;

    async function gate() {
      if (isAllStores) {
        if (!cancelled) {
          setAllowed(true);
          setPendingGate(false);
        }
        return;
      }

      // Reuse shared React Query session when warm — avoid duplicate resolve-session.
      if (cachedSession?.success && Array.isArray(cachedSession.stores)) {
        const stores = cachedSession.stores;
        if (stores.length === 0) {
          clearPartnerStoreSelection();
          if (!cancelled) window.location.href = allStoresPickerHref(readPartnerLastParentId() || undefined);
          return;
        }
        const owned = new Set(stores.map((s) => String(s.store_id || '').trim()).filter(Boolean));
        const selected = readPartnerSelectedStoreId();
        if (selected && !owned.has(selected)) {
          clearPartnerStoreSelection();
          if (!cancelled) {
            router.replace(allStoresPickerHref(readPartnerLastParentId() || undefined));
            setAllowed(true);
            setPendingGate(false);
          }
          return;
        }
        if (!cancelled) {
          setAllowed(true);
          setPendingGate(false);
        }
        return;
      }

      try {
        const lastParent = readPartnerLastParentId();
        const q = lastParent ? `?parent_id=${encodeURIComponent(lastParent)}` : '';
        const res = await fetch(`/api/merchant-auth/resolve-session${q}`, { credentials: 'include' });
        const data = (await res.json().catch(() => ({}))) as ResolvePayload;

        if (res.status === 503 || data.code === 'SERVICE_UNAVAILABLE') {
          if (!cancelled) {
            setAllowed(true);
            setPendingGate(false);
          }
          return;
        }

        const fatal = FATAL_AUTH_CODES.has(String(data.code || ''));

        if (fatal) {
          if (!cancelled) {
            clearPartnerStoreSelection();
            window.location.href = '/auth';
          }
          return;
        }

        if (!res.ok || !data?.success) {
          if (!cancelled) {
            setAllowed(true);
            setPendingGate(false);
          }
          return;
        }

        const stores = data.stores ?? [];

        if (stores.length === 0) {
          clearPartnerStoreSelection();
          if (!cancelled) window.location.href = allStoresPickerHref(readPartnerLastParentId() || undefined);
          return;
        }

        const owned = new Set(stores.map((s) => String(s.store_id || '').trim()).filter(Boolean));
        const selected = readPartnerSelectedStoreId();
        if (selected && !owned.has(selected)) {
          clearPartnerStoreSelection();
          if (!cancelled) {
            router.replace(allStoresPickerHref(readPartnerLastParentId() || undefined));
            setAllowed(true);
            setPendingGate(false);
          }
          return;
        }

        if (!cancelled) {
          setAllowed(true);
          setPendingGate(false);
        }
      } catch {
        if (!cancelled) {
          setAllowed(true);
          setPendingGate(false);
        }
      }
    }

    void gate();
    return () => {
      cancelled = true;
    };
  }, [isAllStores, pathname, router, cachedSession]);

  // First paint on /partners/* (no selected-store known yet): content skeleton only.
  // Once allowed (selected store / cache / resolve), never blank the shell again.
  if (!allowed && pendingGate) {
    return <PartnerContentSkeleton />;
  }

  return <>{children}</>;
}
