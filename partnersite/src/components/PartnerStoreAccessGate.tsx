'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  clearPartnerStoreSelection,
  readPartnerSelectedStoreId,
} from '@/lib/partner-selected-store';

type ResolvePayload = {
  success?: boolean;
  parentId?: number;
  stores?: Array<{ store_id: string }>;
  onboardingProgress?: { parent_id?: number } | null;
};

/**
 * Blocks /partners/* (except all-stores) until the parent owns ≥1 child store.
 * Also clears stale selectedStoreId that belongs to another merchant.
 */
export function PartnerStoreAccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  const isAllStores = pathname === '/partners/all-stores' || pathname.startsWith('/partners/all-stores/');

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
        if (!res.ok) {
          if (!cancelled) {
            clearPartnerStoreSelection();
            window.location.href = '/auth/login';
          }
          return;
        }
        const data = (await res.json()) as ResolvePayload;
        if (!data?.success) {
          if (!cancelled) {
            clearPartnerStoreSelection();
            window.location.href = '/auth/login';
          }
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

  if (!allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        Checking store access…
      </div>
    );
  }

  return <>{children}</>;
}
