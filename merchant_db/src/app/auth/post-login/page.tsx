"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Store, Loader2, User, Building2, ChevronRight, LogOut } from "lucide-react";
import Link from "next/link";

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

type ResolveData = {
  success: boolean;
  parentId?: number;
  parentMerchantId?: string;
  parentName?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  stores?: StoreItem[];
  onboardingProgress?: { parent_id: number; store_id: number | null; current_step?: number } | null;
  hasVerifiedStore?: boolean;
  verifiedStores?: StoreItem[];
};

export default function PostLoginPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "home" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [data, setData] = useState<ResolveData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch("/api/auth/resolve-session");
        const result: ResolveData = await res.json();

        if (cancelled) return;
        if (!res.ok || !result.success) {
          setStatus("error");
          setErrorMessage(result.success === false ? (result as any).error ?? "Session invalid. Please login again." : "Could not load your account.");
          return;
        }

        setData(result);
        setStatus("home");
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("Something went wrong. Please try again.");
        }
      }
    }

    run();
    return () => { cancelled = true; };
  }, [router]);

  const goToDashboard = (storeId: string) => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("selectedStoreId", storeId);
    }
    window.location.href = "/mx/dashboard";
  };

  const goToOnboarding = (storeId?: string) => {
    const parentId = data?.parentId ?? data?.onboardingProgress?.parent_id ?? 0;
    const query = storeId
      ? `?parent_id=${parentId}&store_id=${encodeURIComponent(storeId)}`
      : `?parent_id=${parentId}`;
    router.push(`/auth/register-store${query}`);
  };

  const addNewChildStore = () => {
    const parentId = data?.parentId ?? data?.onboardingProgress?.parent_id ?? 0;
    router.push(`/auth/register-store?parent_id=${parentId}&new=1`);
  };

  const getStatusBadge = (approval_status: string | null) => {
    const s = (approval_status || "").toUpperCase();
    if (s === "APPROVED") return { label: "Verified", className: "bg-emerald-100 text-emerald-800" };
    if (s === "REJECTED") return { label: "Rejected", className: "bg-red-100 text-red-800" };
    if (s === "UNDER_VERIFICATION") return { label: "Under review", className: "bg-amber-100 text-amber-800" };
    return { label: approval_status || "Pending", className: "bg-slate-100 text-slate-700" };
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 px-4">
        <div className="text-center space-y-6">
          <div className="inline-flex p-4 rounded-full bg-blue-100">
            <Store className="w-10 h-10 text-blue-600" />
          </div>
          <div className="flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
          <p className="text-sm font-medium text-slate-700">Loading your account...</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 px-4">
        <div className="w-full max-w-md bg-white/95 backdrop-blur rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-8 text-center space-y-4">
          <p className="text-red-600 text-sm">{errorMessage}</p>
          <Link href="/auth/login" className="inline-block py-3 px-6 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  if (status !== "home" || !data) return null;

  const { parentName, ownerName, ownerEmail, parentMerchantId, stores = [], onboardingProgress } = data;

  const handleSignOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/auth/login";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/50 flex flex-col">
      {/* Header - minimal content for this page */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-3 sm:px-6 pr-32 sm:pr-36 py-2.5 sm:py-3 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <img src="/logo.png" alt="GatiMitra" className="h-8 w-auto sm:h-9 object-contain shrink-0" />
          <span className="text-base sm:text-lg font-semibold text-slate-800 truncate">GatiMitra</span>
          <span className="hidden sm:inline text-xs font-medium uppercase tracking-wider text-slate-500 ml-1">Partner</span>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 shrink-0"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </header>

      <main className="flex-1 px-3 sm:px-4 md:px-6 py-4 sm:py-6 overflow-auto">
        <div className="mx-auto max-w-5xl space-y-4 sm:space-y-5">
          {/* Compact parent details */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <User className="h-4 w-4" />
                </div>
                <div>
                  <span className="font-semibold text-slate-900">Partner account</span>
                  <span className="ml-2 text-slate-500 font-mono text-xs">{parentMerchantId ?? "—"}</span>
                </div>
              </div>
              {parentName && (
                <span className="text-slate-600">
                  <span className="text-slate-500">Business:</span> <span className="font-medium text-slate-800">{parentName}</span>
                </span>
              )}
              {ownerName && (
                <span className="text-slate-600">
                  <span className="text-slate-500">Owner:</span> <span className="text-slate-800">{ownerName}</span>
                </span>
              )}
              {ownerEmail && (
                <span className="text-slate-600 truncate max-w-[200px] sm:max-w-none">
                  <span className="text-slate-500">Email:</span> <span className="text-slate-800">{ownerEmail}</span>
                </span>
              )}
            </div>
          </div>

          {/* Child stores section */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-slate-600 shrink-0" />
                <h2 className="text-base sm:text-lg font-bold text-slate-900">Your child stores</h2>
              </div>
              <button
                type="button"
                onClick={addNewChildStore}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-indigo-700 w-full sm:w-auto"
              >
                + Add new child store
              </button>
            </div>

            {onboardingProgress && !onboardingProgress.store_id && (
              <div className="mx-3 sm:mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span className="flex-1">Incomplete onboarding draft found. Resume and complete remaining steps.</span>
                <button
                  type="button"
                  onClick={() => goToOnboarding()}
                  className="rounded-md border border-amber-300 bg-white px-2.5 py-1.5 font-semibold hover:bg-amber-100 shrink-0"
                >
                  Resume draft
                </button>
              </div>
            )}

            {stores.length === 0 ? (
              <div className="p-6 sm:p-8 text-center">
                <p className="text-sm text-slate-500 mb-4">No store registered yet. Add your first store to get started.</p>
                <button
                  type="button"
                  onClick={addNewChildStore}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 py-3 px-4 text-sm font-semibold text-slate-700 hover:border-indigo-400 hover:bg-indigo-50/50"
                >
                  <Store className="h-5 w-5" />
                  Start child store onboarding
                </button>
              </div>
            ) : (
              <>
                {/* Desktop: table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full min-w-[600px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80">
                        <th className="text-left py-3 px-3 sm:px-4 font-semibold text-slate-700">Store</th>
                        <th className="text-left py-3 px-3 sm:px-4 font-semibold text-slate-700">Address</th>
                        <th className="text-left py-3 px-3 sm:px-4 font-semibold text-slate-700">Status</th>
                        <th className="text-left py-3 px-3 sm:px-4 font-semibold text-slate-700">Step</th>
                        <th className="text-right py-3 px-3 sm:px-4 font-semibold text-slate-700">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stores.map((store) => {
                        const badge = getStatusBadge(store.approval_status);
                        const isApproved = store.approval_status === "APPROVED";
                        const canContinueOnboarding =
                          !isApproved &&
                          (((store.approval_status || "").toUpperCase() === "DRAFT") ||
                            ((store.approval_status || "").toUpperCase() === "REJECTED") ||
                            (typeof store.current_onboarding_step === "number" && store.current_onboarding_step < 9));
                        const step = typeof store.current_onboarding_step === "number"
                          ? Math.min(Math.max(store.current_onboarding_step, 1), 9)
                          : null;
                        return (
                          <tr key={store.store_id} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="py-3 px-3 sm:px-4">
                              <p className="font-medium text-slate-900">{store.store_name || "Unnamed store"}</p>
                              <p className="text-xs text-slate-500 font-mono">{store.store_id}</p>
                            </td>
                            <td className="py-3 px-3 sm:px-4 text-slate-600 max-w-[180px] truncate" title={store.full_address ?? undefined}>
                              {store.full_address || "—"}
                            </td>
                            <td className="py-3 px-3 sm:px-4">
                              <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}>
                                {badge.label}
                              </span>
                            </td>
                            <td className="py-3 px-3 sm:px-4 text-slate-600">
                              {step != null ? `${step} / 9` : "—"}
                            </td>
                            <td className="py-3 px-3 sm:px-4 text-right">
                              {isApproved ? (
                                <button
                                  type="button"
                                  onClick={() => goToDashboard(store.store_id)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                                >
                                  Dashboard
                                  <ChevronRight className="h-4 w-4" />
                                </button>
                              ) : canContinueOnboarding ? (
                                <button
                                  type="button"
                                  onClick={() => goToOnboarding(store.store_id)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                                >
                                  Continue
                                  <ChevronRight className="h-4 w-4" />
                                </button>
                              ) : (
                                <span className="text-xs text-slate-500">Awaiting verification</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile: card list */}
                <div className="sm:hidden divide-y divide-slate-100">
                  {stores.map((store) => {
                    const badge = getStatusBadge(store.approval_status);
                    const isApproved = store.approval_status === "APPROVED";
                    const canContinueOnboarding =
                      !isApproved &&
                      (((store.approval_status || "").toUpperCase() === "DRAFT") ||
                        ((store.approval_status || "").toUpperCase() === "REJECTED") ||
                        (typeof store.current_onboarding_step === "number" && store.current_onboarding_step < 9));
                    const step = typeof store.current_onboarding_step === "number"
                      ? Math.min(Math.max(store.current_onboarding_step, 1), 9)
                      : null;
                    return (
                      <div key={store.store_id} className="p-3 flex flex-col gap-2">
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">{store.store_name || "Unnamed store"}</p>
                            <p className="text-xs text-slate-500 font-mono">{store.store_id}</p>
                            {store.full_address && (
                              <p className="text-xs text-slate-600 truncate mt-0.5">{store.full_address}</p>
                            )}
                          </div>
                          <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          {step != null && (
                            <span className="text-xs text-slate-500">Step {step} / 9</span>
                          )}
                          <div className="ml-auto">
                            {isApproved ? (
                              <button
                                type="button"
                                onClick={() => goToDashboard(store.store_id)}
                                className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                              >
                                Dashboard
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            ) : canContinueOnboarding ? (
                              <button
                                type="button"
                                onClick={() => goToOnboarding(store.store_id)}
                                className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                              >
                                Continue
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            ) : (
                              <span className="text-xs text-slate-500">Awaiting verification</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
