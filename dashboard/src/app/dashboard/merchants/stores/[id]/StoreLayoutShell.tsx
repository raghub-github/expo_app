"use client";

import { useState, useEffect } from "react";
import { useAppPathname, useAppSearchParams } from "@/hooks/useAppSearchParams";
import { useRouter } from "next/navigation";
import { StoreQueryHydrator } from "./StoreQueryHydrator";
import { StoreProvider, type StoreContextStore } from "./StoreContext";
import { MerchantIncomingOrderModal } from "@/components/merchant/MerchantIncomingOrderModal";
import { MerchantPendingNewOrdersBar } from "@/components/merchant/MerchantPendingNewOrdersBar";
import { MerchantAcceptanceTimeoutSync } from "@/components/merchant/MerchantAcceptanceTimeoutSync";
import { STORE_KEY } from "@/hooks/useStore";
import type { StoreProfile } from "@/hooks/useStore";
import { getQueryClient } from "@/lib/react-query";
import { loadMerchantAppAssets, MX_ASSET, getMerchantAppAssetUrl } from "@/lib/merchantAppAssets";
import { MerchantOrderEmptyAssetsWarmup } from "@/components/MerchantAppAssetImage";
import {
  merchantStoreHref,
  parseNumericStoreId,
  storeIdFromPathname,
  storePageSuffix,
  writeLastMerchantStoreId,
} from "@/lib/merchants/effective-store-id";
import { writeStoredMerchantStoreReturnTo } from "@/lib/merchants/merchant-store-return";

const EMPTY_ORDER_KEYS = [
  MX_ASSET.ordersEmptyNew,
  MX_ASSET.ordersEmptyActive,
  MX_ASSET.ordersEmptyPreparing,
  MX_ASSET.ordersEmptyReady,
  MX_ASSET.ordersEmptyPickedUp,
  MX_ASSET.ordersEmptyCompleted,
  MX_ASSET.ordersEmptyRto,
  MX_ASSET.ordersEmptyScheduled,
] as const;

function prefetchEmptyOrderImages(): void {
  if (typeof window === "undefined") return;
  for (const key of EMPTY_ORDER_KEYS) {
    const url = getMerchantAppAssetUrl(key);
    if (!url) continue;
    const img = new window.Image();
    img.decoding = "async";
    img.fetchPriority = "high";
    img.src = url;
  }
}

export type StoreInfo = {
  id: number;
  store_id: string;
  name: string;
  city: string | null;
  full_address?: string | null;
  approval_status: string;
  current_onboarding_step?: number | null;
  onboarding_completed?: boolean | null;
  store_email?: string | null;
  created_at?: string | null;
  delisted_at?: string | null;
  delist_reason?: string | null;
  delisted_by_name?: string | null;
  delisted_by_email?: string | null;
  delisted_by_role?: string | null;
} | null;

async function fetchStoreProfile(storeId: string): Promise<StoreProfile | null> {
  const res = await fetch(`/api/merchant/stores/${storeId}?verification=1`, {
    credentials: "include",
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as
    | { success?: boolean; store?: StoreProfile }
    | null;
  if (!res.ok || !data?.success) return null;
  return data.store ?? null;
}

/**
 * When the server layout has no store (timeout / 503 / client nav), load it on the
 * client. Do not call useStore/useQuery here — Fast Refresh and PersistQueryClient
 * remounts can run this tree without QueryClientProvider and throw.
 */
function StoreLayoutFallback({
  storeId,
  children,
}: {
  storeId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = useAppPathname();
  const [store, setStore] = useState<StoreProfile | null>(() => {
    try {
      return getQueryClient().getQueryData<StoreProfile>(STORE_KEY(storeId)) ?? null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(!store);
  const isOrdersPage = pathname.includes("/orders");
  const isFullHeightScrollPage =
    isOrdersPage || pathname.includes("/menu") || pathname.includes("/activity");

  useEffect(() => {
    if (store) return;
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const next = await fetchStoreProfile(storeId);
          if (cancelled) return;
          if (next) {
            try {
              getQueryClient().setQueryData(STORE_KEY(storeId), next);
            } catch {
              /* ignore */
            }
            setStore(next);
            setIsLoading(false);
            return;
          }
        } catch {
          /* retry */
        }
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, store]);

  if (isLoading && !store) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-8">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        <p className="mt-4 text-sm text-gray-500">Loading store…</p>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-8">
        <p className="text-gray-500">Store not found.</p>
        <button
          type="button"
          onClick={() => router.push("/dashboard/merchants")}
          className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          Go to Merchants
        </button>
      </div>
    );
  }

  return (
    <StoreProvider storeId={storeId} store={store as StoreContextStore}>
      <div className="flex min-h-0 flex-1 flex-col w-full max-w-full overflow-hidden">
        <StoreQueryHydrator storeId={storeId} store={store as StoreProfile} />
        <MerchantOrderEmptyAssetsWarmup />
        <MerchantIncomingOrderModal />
        <MerchantAcceptanceTimeoutSync />
        <MerchantPendingNewOrdersBar />
        <div
          className="flex min-h-0 flex-1 flex-col w-full overflow-hidden"
          style={
            isFullHeightScrollPage
              ? undefined
              : {
                  // Small safe-area only — scroll lives in the page body (StoreFullDashboard).
                  paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))",
                }
          }
        >
          {children}
        </div>
      </div>
    </StoreProvider>
  );
}

export function StoreLayoutShell({
  storeId,
  store,
  children,
}: {
  storeId: string;
  store: StoreInfo | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = useAppPathname();
  const searchParams = useAppSearchParams();
  const returnToParam = (searchParams.get("returnTo") || "").trim();

  useEffect(() => {
    if (!returnToParam) return;
    writeStoredMerchantStoreReturnTo(storeId, returnToParam);
  }, [storeId, returnToParam]);

  useEffect(() => {
    void loadMerchantAppAssets()
      .then(() => prefetchEmptyOrderImages())
      .catch(() => undefined);
  }, []);

  const isOrdersPage = pathname.includes("/orders");
  const isFullHeightScrollPage =
    isOrdersPage || pathname.includes("/menu") || pathname.includes("/activity");
  const numericStoreId = parseNumericStoreId(storeId);

  useEffect(() => {
    writeLastMerchantStoreId(numericStoreId);
  }, [numericStoreId]);

  const search = searchParams.toString();

  useEffect(() => {
    if (!numericStoreId) return;
    if (storeIdFromPathname(pathname) === numericStoreId) return;
    router.replace(merchantStoreHref(numericStoreId, storePageSuffix(pathname), search));
  }, [numericStoreId, pathname, router, search]);

  if (!store) {
    return (
      <StoreLayoutFallback storeId={storeId}>
        {children}
      </StoreLayoutFallback>
    );
  }

  return (
    <StoreProvider storeId={storeId} store={store as StoreContextStore}>
      <div className="flex min-h-0 flex-1 flex-col w-full max-w-full overflow-hidden">
        <StoreQueryHydrator storeId={storeId} store={store as StoreProfile} />
        <MerchantOrderEmptyAssetsWarmup />
        <MerchantIncomingOrderModal />
        <MerchantAcceptanceTimeoutSync />
        <MerchantPendingNewOrdersBar />
        {/* Main content — store name, address, and store ID are shown in the right sidebar Store Information Card */}
        <div
          className="flex min-h-0 flex-1 flex-col w-full overflow-hidden"
          style={
            isFullHeightScrollPage
              ? undefined
              : {
                  // Small safe-area only — scroll lives in the page body (StoreFullDashboard).
                  paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))",
                }
          }
        >
          {children}
        </div>
      </div>
    </StoreProvider>
  );
}
