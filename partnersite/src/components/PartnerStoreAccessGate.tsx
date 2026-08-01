'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  clearPartnerStoreSelection,
  readPartnerSelectedStoreId,
} from '@/lib/partner-selected-store';
import { PartnerContentSkeleton } from '@/components/PageSkeleton';

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
  'SESSION_REQUIRED',
  'MERCHANT_NOT_FOUND',
]);

/**
 * Blocks /partners/* (except all-stores) until the parent owns ≥1 child store.
 * Also clears stale selectedStoreId that belongs to another merchant.
 */
export function PartnerStoreAccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();

  const isAllStores = pathname === '/partners/all-stores' || pathname.startsWith('/partners/all-stores/');

  // The hub needs no check, so it renders on the very first pass instead of flashing a skeleton.
  const [allowed, setAllowed] = useState<boolean | null>(() => (isAllStores ? true : null));

  useEffect(() => {
    let cancelled = false;

    async function gate() {
      // Hub is always allowed — it will send empty parents to register-store
      if (isAllStores) {
        if (!cancelled) setAllowed(true);
        return;
      }

      try {
        const res = await fetch('/api/merchant-auth/resolve-session', { credentials: 'include' });
        const data = (await res.json().catch(() => ({}))) as ResolvePayload;

        // Transient / unavailable — do not bounce to login (middleware already authenticated the page).
        if (res.status === 503 || data.code === 'SERVICE_UNAVAILABLE') {
          if (!cancelled) setAllowed(true);
          return;
        }

        const fatal =
          res.status === 401 ||
          (res.ok === false && FATAL_AUTH_CODES.has(String(data.code || ''))) ||
          (!data?.success && FATAL_AUTH_CODES.has(String(data.code || '')));

        if (fatal || (!res.ok && res.status !== 503)) {
          // Only hard-redirect on authentic auth failures — never on ambiguous 5xx.
          if (res.status === 401 || FATAL_AUTH_CODES.has(String(data.code || ''))) {
            if (!cancelled) {
              clearPartnerStoreSelection();
              window.location.href = '/auth/login';
            }
            return;
          }
          if (!cancelled) setAllowed(true);
          return;
        }

        if (!data?.success) {
          // Ambiguous failure with 200 — fail open so refresh does not force re-login.
          if (!cancelled) setAllowed(true);
          return;
        }

        const stores = data.stores ?? [];
        const parentId = data.parentId ?? data.onboardingProgress?.parent_id;

        if (stores.length === 0) {
          clearPartnerStoreSelection();
          const q =
            parentId != null
              ? `?parent_id=${encodeURIComponent(String(parentId))}&new=1`
              : '?new=1';
          if (!cancelled) window.location.href = `/auth/register-store${q}`;
          return;
        }

        const owned = new Set(stores.map((s) => String(s.store_id || '').trim()).filter(Boolean));
        const selected = readPartnerSelectedStoreId();
        if (selected && !owned.has(selected)) {
          clearPartnerStoreSelection();
          if (!cancelled) {
            router.replace('/partners/all-stores?picker=1');
            setAllowed(true);
          }
          return;
        }

        if (!cancelled) setAllowed(true);
      } catch {
        if (!cancelled) setAllowed(true);
      }
    }

    void gate();
    return () => {
      cancelled = true;
    };
  }, [isAllStores, pathname, router]);

  // null = check pending; false = redirect in progress. The surrounding shell stays mounted,
  // so this skeleton only ever fills the main content area.
  if (allowed !== true) {
    return <PartnerContentSkeleton />;
  }

  return <>{children}</>;
}
