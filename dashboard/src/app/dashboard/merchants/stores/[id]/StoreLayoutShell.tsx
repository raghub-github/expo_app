"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { StoreQueryHydrator } from "./StoreQueryHydrator";
import { StoreProvider, type StoreContextStore } from "./StoreContext";
import { useStore } from "@/hooks/useStore";
import type { StoreProfile } from "@/hooks/useStore";

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
  const { store, isLoading } = useStore(storeId);

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
      <div className="w-full max-w-full overflow-x-hidden">
        <StoreQueryHydrator storeId={storeId} store={store as StoreProfile} />
        <div className="w-full">{children}</div>
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
  store: StoreInfo;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromAdmin = searchParams.get("fromAdmin") === "1";
  const [showAdminPopup, setShowAdminPopup] = useState(false);
  const [showDelistedModal, setShowDelistedModal] = useState(false);

  useEffect(() => {
    if (fromAdmin) setShowAdminPopup(true);
  }, [fromAdmin]);

  useEffect(() => {
    if (!store) return;
    const status = (store.approval_status || "").toUpperCase();
    if (status === "DELISTED") {
      setShowDelistedModal(true);
    }
  }, [store?.id, store?.approval_status]);

  const closeAdminPopup = () => {
    setShowAdminPopup(false);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("fromAdmin");
    next.set("portal", "merchant");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  if (!store) {
    return (
      <StoreLayoutFallback storeId={storeId}>
        {children}
      </StoreLayoutFallback>
    );
  }

  return (
    <StoreProvider storeId={storeId} store={store as StoreContextStore}>
      <div className="w-full max-w-full overflow-x-hidden">
        <StoreQueryHydrator storeId={storeId} store={store as StoreProfile} />
        {showDelistedModal && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" aria-modal="true" role="dialog">
            <div className="w-full max-w-md rounded-xl border border-amber-200 bg-white p-6 shadow-xl">
              <div className="mb-3 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Status</p>
                <p className="mt-1 text-lg font-bold text-red-700">Store Delisted</p>
              </div>
              <div className="space-y-1.5 text-sm text-gray-700">
                {store.delisted_by_name || store.delisted_by_email || store.delisted_by_role ? (
                  <p>
                    <span className="font-semibold">Delisted by:</span>{" "}
                    {store.delisted_by_name ||
                      store.delisted_by_email ||
                      store.delisted_by_role ||
                      "Unknown"}
                  </p>
                ) : null}
                {store.delisted_at && (
                  <p>
                    <span className="font-semibold">Delisted at:</span>{" "}
                    {new Date(store.delisted_at).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                )}
                {store.delist_reason && (
                  <p>
                    <span className="font-semibold">Reason:</span>{" "}
                    {store.delist_reason}
                  </p>
                )}
              </div>
              <p className="mt-4 text-xs text-gray-600 text-center">
                This store is currently delisted and not visible to customers. You may review the store
                or relist it if required.
              </p>
              <button
                type="button"
                onClick={() => setShowDelistedModal(false)}
                className="mt-5 w-full cursor-pointer rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                OK
              </button>
            </div>
          </div>
        )}
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

        {/* Main content — store name, address, and store ID are shown in the right sidebar Store Information Card */}
        <div className="w-full">{children}</div>
      </div>
    </StoreProvider>
  );
}
