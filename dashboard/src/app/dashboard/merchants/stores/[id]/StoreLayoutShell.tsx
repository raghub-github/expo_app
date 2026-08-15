"use client";

import { useState, useEffect } from "react";
import { useAppPathname, useAppSearchParams } from "@/hooks/useAppSearchParams";
import { useRouter } from "next/navigation";
import { StoreQueryHydrator } from "./StoreQueryHydrator";
import { StoreProvider, type StoreContextStore } from "./StoreContext";
import { MerchantIncomingOrderModal } from "@/components/merchant/MerchantIncomingOrderModal";
import { MerchantPendingNewOrdersBar } from "@/components/merchant/MerchantPendingNewOrdersBar";
import { MerchantAcceptanceTimeoutSync } from "@/components/merchant/MerchantAcceptanceTimeoutSync";
import { useStore } from "@/hooks/useStore";
import type { StoreProfile } from "@/hooks/useStore";
import { loadMerchantAppAssets, MX_ASSET, getMerchantAppAssetUrl } from "@/lib/merchantAppAssets";
import { MerchantOrderEmptyAssetsWarmup } from "@/components/MerchantAppAssetImage";

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

/** When layout has no store (e.g. slow server or client nav), use React Query cache or fetch once; show skeleton or not found. */
function StoreLayoutFallback({
  storeId,
  children,
}: {
  storeId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = useAppPathname();
  const { store, isLoading } = useStore(storeId);
  const isOrdersPage = pathname.includes("/orders");
  const isFullHeightScrollPage = isOrdersPage || pathname.includes("/menu");

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
  const fromAdmin = searchParams.get("fromAdmin") === "1";
  const [showAdminPopup, setShowAdminPopup] = useState(false);

  useEffect(() => {
    if (fromAdmin) setShowAdminPopup(true);
  }, [fromAdmin]);

  useEffect(() => {
    void loadMerchantAppAssets()
      .then(() => prefetchEmptyOrderImages())
      .catch(() => undefined);
  }, []);

  const closeAdminPopup = () => {
    setShowAdminPopup(false);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("fromAdmin");
    next.set("portal", "merchant");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const isOrdersPage = pathname.includes("/orders");
  const isFullHeightScrollPage = isOrdersPage || pathname.includes("/menu");

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
        {/* Popup when entering store from Admin dashboard */}
        {showAdminPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" aria-modal="true" role="dialog">
          <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <p className="text-center text-sm font-medium text-gray-900">
              You are shifting from Admin to Merchant portal.
            </p>
            <button
              type="button"
              onClick={closeAdminPopup}
              className="mt-4 w-full cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              OK
            </button>
          </div>
        </div>
      )}

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
