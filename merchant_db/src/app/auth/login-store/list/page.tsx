"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type StoreItem = {
  store_id: string;
  store_name: string | null;
  full_address: string | null;
  store_phones: string[] | null;
  approval_status: string | null;
  is_active: boolean | null;
  current_onboarding_step?: number | null;
  onboarding_completed?: boolean | null;
};

type ParentPayload = {
  parentId?: number;
  parentMerchantId?: string | null;
  parentName?: string | null;
  stores?: StoreItem[];
  onboardingProgress?: {
    parent_id: number;
    store_id: number | null;
    current_step?: number;
    form_data?: {
      step_store?: { storePublicId?: string };
    };
  } | null;
};

export default function StoreListPage() {
  const router = useRouter();
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [parentInfo, setParentInfo] = useState<{
    parentId: number | null;
    parentMerchantId: string | null;
    parentName: string | null;
  }>({ parentId: null, parentMerchantId: null, parentName: null });
  const [onboardingProgress, setOnboardingProgress] = useState<ParentPayload["onboardingProgress"]>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const payloadJson = localStorage.getItem("resolveParentData");
    if (payloadJson) {
      try {
        const payload = JSON.parse(payloadJson) as ParentPayload;
        setStores(payload.stores || []);
        setParentInfo({
          parentId: payload.parentId ?? payload.onboardingProgress?.parent_id ?? null,
          parentMerchantId: payload.parentMerchantId ?? null,
          parentName: payload.parentName ?? null,
        });
        setOnboardingProgress(payload.onboardingProgress ?? null);
        return;
      } catch {}
    }

    const storesJson = localStorage.getItem("storeList");
    if (!storesJson) return;
    try {
      setStores(JSON.parse(storesJson));
    } catch {
      setStores([]);
    }
  }, []);

  const filteredStores = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter(
      (store) =>
        (store.store_name || "").toLowerCase().includes(q) ||
        store.store_id.toLowerCase().includes(q) ||
        (store.full_address || "").toLowerCase().includes(q)
    );
  }, [stores, search]);

  const goToDashboard = (storeId: string) => {
    localStorage.setItem("selectedStoreId", storeId);
    window.location.href = "/mx/dashboard";
  };

  const goToOnboarding = (storeId?: string) => {
    const parentId = parentInfo.parentId ?? onboardingProgress?.parent_id ?? 0;
    const query = storeId ? `?parent_id=${parentId}&store_id=${encodeURIComponent(storeId)}` : `?parent_id=${parentId}`;
    router.push(`/auth/register-store${query}`);
  };

  const addNewChildStore = () => {
    const parentId = parentInfo.parentId ?? onboardingProgress?.parent_id ?? 0;
    router.push(`/auth/register-store?parent_id=${parentId}&new=1`);
  };

  const getStatusText = (store: StoreItem) => {
    const status = (store.approval_status || "").toUpperCase();
    if (status === "APPROVED") return { label: "Verified", className: "bg-emerald-100 text-emerald-700" };
    if (status === "UNDER_VERIFICATION") return { label: "Under verification", className: "bg-amber-100 text-amber-700" };
    if (status === "REJECTED") return { label: "Rejected", className: "bg-rose-100 text-rose-700" };
    if (status === "DRAFT") return { label: "Partial", className: "bg-indigo-100 text-indigo-700" };
    if (status === "SUBMITTED") return { label: "Submitted", className: "bg-blue-100 text-blue-700" };
    return { label: "Pending", className: "bg-slate-100 text-slate-700" };
  };

  const getAction = (store: StoreItem) => {
    const status = (store.approval_status || "").toUpperCase();
    const isApproved = status === "APPROVED";
    if (isApproved) {
      return {
        label: "Go to dashboard",
        onClick: () => goToDashboard(store.store_id),
        disabled: false,
      };
    }
    if (status === "DRAFT" || status === "REJECTED" || (store.current_onboarding_step && store.current_onboarding_step < 9)) {
      return {
        label: "Continue onboarding",
        onClick: () => goToOnboarding(store.store_id),
        disabled: false,
      };
    }
    return {
      label: "Awaiting verification",
      onClick: () => {},
      disabled: true,
    };
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Your child stores</h1>
              <p className="text-sm text-slate-600">
                Choose a child store to continue onboarding or open dashboard.
              </p>
              {(parentInfo.parentName || parentInfo.parentMerchantId) && (
                <p className="mt-1 text-xs text-slate-500">
                  {parentInfo.parentName ? `${parentInfo.parentName}` : "Parent account"}
                  {parentInfo.parentMerchantId ? ` (${parentInfo.parentMerchantId})` : ""}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={addNewChildStore}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              + Add new child store
            </button>
          </div>
        </div>

        {onboardingProgress && !onboardingProgress.store_id && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>
                You have an incomplete child onboarding draft (step {onboardingProgress.current_step || 1}).
              </span>
              <button
                type="button"
                onClick={() => goToOnboarding()}
                className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
              >
                Resume draft
              </button>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <input
            type="text"
            placeholder="Search by store name, store id, or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {filteredStores.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">
              No child stores found.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filteredStores.map((store) => {
                const status = getStatusText(store);
                const action = getAction(store);
                return (
                  <li key={store.store_id} className="px-5 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold text-slate-900">
                            {store.store_name || "Unnamed store"}
                          </p>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>
                            {status.label}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Store ID: <span className="font-semibold">{store.store_id}</span>
                          {typeof store.current_onboarding_step === "number"
                            ? ` | Step ${Math.min(Math.max(store.current_onboarding_step, 1), 9)} of 9`
                            : ""}
                        </p>
                        {store.full_address && (
                          <p className="mt-1 truncate text-xs text-slate-500">{store.full_address}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={action.disabled}
                        onClick={action.onClick}
                        className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                          action.disabled
                            ? "cursor-not-allowed bg-slate-100 text-slate-500"
                            : "bg-indigo-600 text-white hover:bg-indigo-700"
                        }`}
                      >
                        {action.label}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
