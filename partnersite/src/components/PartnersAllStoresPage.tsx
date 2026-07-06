/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Store, Loader2, Plus, LogOut, Leaf } from "lucide-react";
import LogoutConfirmModal from "@/components/LogoutConfirmModal";
import NeedHelpBadge from "@/components/NeedHelpBadge";
import { StoreVerificationRejectionsBadge } from "@/components/partner/StoreVerificationRejectionsBadge";
import {
  getStoreOnboardingBadge,
  isStoreOnboardingSubmitted,
  storeHasOpenVerificationFix,
  storeNeedsOnboardingAction,
} from "@/lib/onboarding/store-onboarding-status";
import type { PartnerVerificationStepRejection } from "@/lib/onboarding/partner-verification-rejections";
import { normalizeMerchantStoreMediaUrl } from "@/lib/r2";

type StoreItem = {
  store_id: string;
  store_name: string | null;
  full_address: string | null;
  store_phones: string[] | null;
  approval_status: string | null;
  is_active: boolean | null;
  banner_url?: string | null;
  current_onboarding_step?: number | null;
  onboarding_completed?: boolean | null;
  payment_status?: "pending" | "completed";
  verification_step_rejections?: PartnerVerificationStepRejection[];
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

export function PartnersAllStoresPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "home" | "retry">("loading");
  const [data, setData] = useState<ResolveData | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [verificationSubmittedBanner, setVerificationSubmittedBanner] = useState(false);
  const [highlightStorePublicId, setHighlightStorePublicId] = useState<string | null>(null);

  const resolveSession = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/merchant-auth/resolve-session", { credentials: "include" });
      if (res.status === 404) {
        setStatus("retry");
        return;
      }
      let result: ResolveData & { code?: string; error?: string };
      try {
        result = await res.json();
      } catch {
        setStatus("retry");
        return;
      }

      if (!res.ok || !result.success) {
        if (res.status === 503 || result.code === "SERVICE_UNAVAILABLE") {
          setStatus("retry");
          return;
        }
        try {
          await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
        } catch {
          // ignore
        }
        const code = result.code;
        const errMsg = result.error;
        const query =
          code === "MERCHANT_NOT_FOUND" && errMsg ? `?error=${encodeURIComponent(errMsg)}` : "";
        window.location.href = `/auth/login${query}`;
        return;
      }

      setData(result);
      setStatus("home");
    } catch {
      setStatus("retry");
    }
  }, []);

  useEffect(() => {
    resolveSession();
  }, [resolveSession]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    if (u.searchParams.get("verification_updates_submitted") !== "1") return;
    setVerificationSubmittedBanner(true);
    const hi = u.searchParams.get("highlight_store")?.trim();
    if (hi) setHighlightStorePublicId(hi);
    u.searchParams.delete("verification_updates_submitted");
    u.searchParams.delete("highlight_store");
    const qs = u.searchParams.toString();
    window.history.replaceState({}, "", `${u.pathname}${qs ? `?${qs}` : ""}`);
  }, []);

  const goToDashboard = (storeId: string) => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("selectedStoreId", storeId);
    }
    window.location.href = "/partners/dashboard";
  };

  const goToOnboarding = (storeId?: string) => {
    const parentId = data?.parentId ?? data?.onboardingProgress?.parent_id ?? 0;
    const store = storeId && data?.stores ? data.stores.find((s) => s.store_id === storeId) : undefined;
    const rej = store?.verification_step_rejections;
    const fixParam =
      Array.isArray(rej) && rej.length > 0
        ? `&verification_fix_step=${Math.min(...rej.map((r) => Number(r.step_number)))}`
        : "";
    const query = storeId
      ? `?parent_id=${parentId}&store_id=${encodeURIComponent(storeId)}${fixParam}`
      : `?parent_id=${parentId}`;
    router.push(`/auth/register-store${query}`);
  };

  const addNewChildStore = () => {
    const parentId = data?.parentId ?? data?.onboardingProgress?.parent_id ?? 0;
    router.push(`/auth/register-store?parent_id=${parentId}&new=1`);
  };

  const isOnboardingPending = (store: StoreItem) => storeNeedsOnboardingAction(store);

  const getStatusBadge = (store: StoreItem) => getStoreOnboardingBadge(store);

  const storesOrdered = useMemo(() => {
    const stores = data?.stores ?? [];
    const list = [...stores];
    list.sort((a, b) => {
      const aHi = highlightStorePublicId && a.store_id === highlightStorePublicId ? 1 : 0;
      const bHi = highlightStorePublicId && b.store_id === highlightStorePublicId ? 1 : 0;
      if (aHi !== bHi) return bHi - aHi;
      const aOk = String(a.approval_status || "").toUpperCase() === "APPROVED" ? 1 : 0;
      const bOk = String(b.approval_status || "").toUpperCase() === "APPROVED" ? 1 : 0;
      if (aOk !== bOk) return bOk - aOk;
      const an = (a.store_name || "").toLowerCase();
      const bn = (b.store_name || "").toLowerCase();
      if (an !== bn) return an.localeCompare(bn);
      return String(a.store_id).localeCompare(String(b.store_id));
    });
    return list;
  }, [data?.stores, highlightStorePublicId]);

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

  if (status === "retry") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 px-4">
        <div className="text-center space-y-6 max-w-sm">
          <div className="inline-flex p-4 rounded-full bg-amber-100">
            <Store className="w-10 h-10 text-amber-600" />
          </div>
          <p className="text-sm font-medium text-slate-700">
            Service temporarily unavailable. Please check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => resolveSession()}
            className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (status !== "home" || !data) return null;

  const { parentName, ownerName, ownerEmail, parentMerchantId, stores = [] } = data;

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/auth/login";
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setIsLoggingOut(false);
      setShowLogoutModal(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/50 flex flex-col">
      <header className="shrink-0">
        <div className="px-3 sm:px-6 pt-3 sm:pt-4">
          <div className="mx-auto max-w-6xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="GatiMitra" className="h-8 w-auto sm:h-9 object-contain" />
              <span className="hidden sm:inline text-xs font-semibold uppercase tracking-wider text-slate-500">
                Partner
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowLogoutModal(true)}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/90 backdrop-blur-sm px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
              <NeedHelpBadge inline variant="pill" />
            </div>
          </div>
        </div>

        <div className="px-3 sm:px-6 pt-3 sm:pt-4 pb-2 sm:pb-3">
          <div className="mx-auto max-w-5xl text-center">
            <p className="text-sm sm:text-base font-semibold text-slate-900">{parentName || ownerName || "Partner"}</p>
            <p className="text-xs sm:text-sm text-slate-500 font-mono">{parentMerchantId ?? "—"}</p>
            {ownerEmail ? (
              <p className="text-[11px] sm:text-xs text-slate-500 truncate max-w-[92vw] mx-auto">{ownerEmail}</p>
            ) : null}
          </div>
        </div>
      </header>

      <main className="flex-1 px-3 sm:px-6 pb-8 sm:pb-10">
        <div className="mx-auto max-w-6xl">
          {verificationSubmittedBanner && (
            <div
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-sm flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-4"
              role="status"
            >
              <p className="leading-relaxed pr-2">
                Your updates have been successfully submitted. Our team will review and verify them shortly.
              </p>
              <button
                type="button"
                onClick={() => setVerificationSubmittedBanner(false)}
                className="shrink-0 self-end sm:self-start rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="text-center mt-2">
            <p className="text-xs sm:text-sm font-semibold tracking-wide text-slate-500 uppercase">Select Store</p>
          </div>

          <div className="mt-6 sm:mt-8 flex justify-center">
            <div className="w-full max-w-6xl">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 sm:gap-10 justify-items-center">
                {storesOrdered.map((store) => {
                  const badge = getStatusBadge(store);
                  const pendingOnboarding = isOnboardingPending(store);
                  const isApproved = String(store.approval_status || "").toUpperCase() === "APPROVED";
                  const hasStepRejections =
                    Array.isArray(store.verification_step_rejections) && store.verification_step_rejections.length > 0;
                  const anyResubmitted =
                    hasStepRejections && (store.verification_step_rejections ?? []).some((r) => r.merchant_resubmitted_at);
                  const canContinueOnboarding = storeNeedsOnboardingAction(store);
                  const isHighlighted = !!highlightStorePublicId && store.store_id === highlightStorePublicId;
                  const bannerSrc =
                    !pendingOnboarding && store.banner_url
                      ? normalizeMerchantStoreMediaUrl(store.banner_url) ?? store.banner_url
                      : null;

                  const onCardClick = () => {
                    if (isApproved) {
                      goToDashboard(store.store_id);
                      return;
                    }
                    if (isStoreOnboardingSubmitted(store) && !storeHasOpenVerificationFix(store)) {
                      return;
                    }
                    if (canContinueOnboarding && !(anyResubmitted && hasStepRejections)) {
                      goToOnboarding(store.store_id);
                      return;
                    }
                    if (canContinueOnboarding) {
                      goToOnboarding(store.store_id);
                    }
                  };

                  return (
                    <div
                      key={store.store_id}
                      className="group w-full max-w-[200px] sm:max-w-[220px]"
                    >
                      <button
                        type="button"
                        onClick={onCardClick}
                        className="w-full focus:outline-none"
                        aria-label={store.store_name ? `Open ${store.store_name}` : `Open store ${store.store_id}`}
                      >
                      <div className="flex flex-col items-center">
                        <div className="relative">
                          {pendingOnboarding ? (
                            <span className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 inline-flex items-center justify-center rounded-full bg-emerald-500 p-1.5 shadow-md ring-2 ring-white">
                              <Leaf className="h-3.5 w-3.5 text-white" aria-hidden />
                            </span>
                          ) : null}
                          <div
                            className={`relative h-[104px] w-[104px] sm:h-[120px] sm:w-[120px] overflow-hidden rounded-full shadow-lg transition-transform duration-200 group-hover:scale-[1.03] group-active:scale-[0.99] ${
                              isHighlighted ? "ring-4 ring-emerald-300" : "ring-2 ring-slate-200"
                            }`}
                          >
                            {pendingOnboarding ? (
                              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100">
                                <span className="text-4xl sm:text-5xl font-bold text-emerald-700 select-none">P</span>
                              </div>
                            ) : bannerSrc ? (
                              <img
                                src={bannerSrc}
                                alt=""
                                className="absolute inset-0 h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-blue-50 to-purple-50" />
                            )}
                            {!pendingOnboarding ? (
                              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />
                            ) : null}
                            <span
                              className={`absolute bottom-2 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-sm ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </div>

                          <p className="mt-2 text-[11px] sm:text-xs text-slate-600 font-mono truncate max-w-[160px] text-center">
                            {store.store_id}
                          </p>

                          {hasStepRejections ? (
                            <div className="mt-2 w-[160px] sm:w-[180px]">
                              <StoreVerificationRejectionsBadge
                                rejections={store.verification_step_rejections}
                                variant="inline"
                                hideInlineResubmittedChip={anyResubmitted}
                                className="max-w-full"
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>

                        <div className="mt-2 px-1">
                          <p className="text-sm sm:text-base font-semibold text-slate-900 leading-snug text-center break-words line-clamp-2">
                            {store.store_name || "Unnamed store"}
                          </p>
                        </div>
                      </button>

                      {pendingOnboarding && canContinueOnboarding ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            goToOnboarding(store.store_id);
                          }}
                          className="mt-2 w-full rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                        >
                          Complete Onboarding
                        </button>
                      ) : null}
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={addNewChildStore}
                  className="group w-full max-w-[200px] sm:max-w-[220px] focus:outline-none"
                  aria-label="Add Store"
                >
                  <div className="flex flex-col items-center">
                    <div className="relative h-[104px] w-[104px] sm:h-[120px] sm:w-[120px] rounded-full border-2 border-dashed border-indigo-300 bg-white/70 shadow-sm transition-transform duration-200 group-hover:scale-[1.03] group-hover:shadow-md group-active:scale-[0.99]">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-indigo-50 ring-1 ring-indigo-200 flex items-center justify-center">
                          <Plus className="h-8 w-8 sm:h-9 sm:w-9 text-indigo-700" strokeWidth={2.5} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 px-1">
                    <p className="text-sm sm:text-base font-semibold text-slate-900 leading-snug text-center">Add Store</p>
                    <p className="mt-0.5 text-[11px] sm:text-xs text-slate-500 text-center">Start a new onboarding</p>
                  </div>
                </button>
              </div>

              {stores.length === 0 ? (
                <div className="mt-8 text-center">
                  <p className="text-sm text-slate-500 mb-4">No store registered yet. Add your first store to get started.</p>
                  <button
                    type="button"
                    onClick={addNewChildStore}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 py-3 px-4 text-sm font-semibold text-slate-700 hover:border-indigo-400 hover:bg-indigo-50/50"
                  >
                    <Plus className="h-5 w-5" />
                    Add your first store
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </main>

      <LogoutConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleSignOut}
        isLoading={isLoggingOut}
      />
    </div>
  );
}

