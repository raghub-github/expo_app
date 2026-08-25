/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Store, Plus, LogOut, Leaf } from "lucide-react";
import { toast } from "sonner";
import LogoutConfirmModal from "@/components/LogoutConfirmModal";
import NeedHelpBadge from "@/components/NeedHelpBadge";
import { PartnerAccountLoadingSpinner } from "@/components/PartnerAccountLoadingSpinner";
import { StoreVerificationRejectedHeaderBanner } from "@/components/partner/StoreVerificationRejectedHeaderBanner";
import {
  getStoreOnboardingBadge,
  isStoreOnboardingSubmitted,
  storeHasOpenVerificationFix,
  storeNeedsOnboardingAction,
} from "@/lib/onboarding/store-onboarding-status";
import type { PartnerVerificationStepRejection } from "@/lib/onboarding/partner-verification-rejections";
import { normalizeMerchantStoreMediaUrl } from "@/lib/r2";
import {
  clearPartnerStoreSelection,
  persistPartnerLastParentId,
  persistPartnerSelectedStoreId,
  readPartnerLastParentId,
} from "@/lib/partner-selected-store";
import { merchantKeys } from "@/lib/query-keys";
import { allStoresPickerHref } from "@/lib/partner-all-stores-href";

type StoreItem = {
  store_id: string;
  store_name: string | null;
  full_address: string | null;
  store_phones: string[] | null;
  approval_status: string | null;
  delisted_at?: string | null;
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
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"loading" | "home" | "retry">("loading");
  const [data, setData] = useState<ResolveData | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [verificationSubmittedBanner, setVerificationSubmittedBanner] = useState(false);
  const [highlightStorePublicId, setHighlightStorePublicId] = useState<string | null>(null);

  const applyResolved = useCallback(
    (result: ResolveData) => {
      if (result.parentId != null) persistPartnerLastParentId(result.parentId);
      setData(result);
      setStatus("home");

      const stores = result.stores ?? [];
      if (stores.length === 0) {
        clearPartnerStoreSelection();
        return;
      }
      const owned = new Set(stores.map((s) => String(s.store_id || "").trim()).filter(Boolean));
      try {
        const selected = (localStorage.getItem("selectedStoreId") || "").trim();
        if (selected && !owned.has(selected)) {
          clearPartnerStoreSelection();
        }
      } catch {
        /* ignore */
      }
    },
    []
  );

  const resolveSession = useCallback(async () => {
    const preferredParentId =
      (typeof window !== "undefined"
        ? new URL(window.location.href).searchParams.get("parent_id")?.trim() || ""
        : "") ||
      readPartnerLastParentId();
    if (preferredParentId) persistPartnerLastParentId(preferredParentId);

    const sessionKey = merchantKeys.resolveSession(preferredParentId || null);
    const cached = queryClient.getQueryData<ResolveData>(sessionKey);
    if (cached?.success) {
      applyResolved(cached);
    } else {
      setStatus("loading");
    }
    try {
      const result = await queryClient.fetchQuery({
        queryKey: sessionKey,
        queryFn: async () => {
          const q = preferredParentId
            ? `?parent_id=${encodeURIComponent(preferredParentId)}`
            : "";
          const res = await fetch(`/api/merchant-auth/resolve-session${q}`, { credentials: "include" });
          if (res.status === 404) {
            const err = new Error("NOT_FOUND") as Error & { status: number; body?: ResolveData };
            err.status = 404;
            throw err;
          }
          let body: ResolveData & { code?: string; error?: string };
          try {
            body = await res.json();
          } catch {
            const err = new Error("INVALID_JSON") as Error & { status: number };
            err.status = res.status;
            throw err;
          }
          if (!res.ok || !body.success) {
            const err = new Error(body.code || "RESOLVE_FAILED") as Error & {
              status: number;
              body: ResolveData & { code?: string; error?: string };
            };
            err.status = res.status;
            err.body = body;
            throw err;
          }
          return body;
        },
        staleTime: 5 * 60 * 1000,
      });
      if (result.parentId != null) persistPartnerLastParentId(result.parentId);
      if (typeof window !== "undefined" && result.parentId != null) {
        const u = new URL(window.location.href);
        if (!u.searchParams.get("parent_id")) {
          u.searchParams.set("parent_id", String(result.parentId));
          const qs = u.searchParams.toString();
          window.history.replaceState({}, "", `${u.pathname}${qs ? `?${qs}` : ""}`);
        }
      }
      applyResolved(result);
    } catch (e) {
      const err = e as Error & {
        status?: number;
        body?: ResolveData & { code?: string; error?: string };
      };
      if (err.status === 404) {
        setStatus("retry");
        return;
      }
      const result = err.body;
      if (result && (!result.success || err.status)) {
        if (err.status === 503 || result.code === "SERVICE_UNAVAILABLE") {
          setStatus("retry");
          return;
        }
        const code = result.code;
        const fatalAuth =
          code === "SESSION_INVALID" ||
          code === "DEVICE_SESSION_INVALID" ||
          code === "MERCHANT_NOT_FOUND";

        if (fatalAuth) {
          if (code === "SESSION_INVALID" || code === "DEVICE_SESSION_INVALID") {
            try {
              const { partnerLogoutLocal } = await import("@/lib/auth/partner-logout");
              await partnerLogoutLocal({ redirectToLogin: false, clearStoreSelection: true });
            } catch {
              // ignore
            }
          }
          const errMsg = result.error;
          if (code === "MERCHANT_NOT_FOUND") {
            window.location.href = "/auth/register";
            return;
          }
          const query = errMsg ? `?error=${encodeURIComponent(errMsg)}` : "";
          window.location.href = `/auth${query}`;
          return;
        }

        if (!cached?.success) setStatus("retry");
        return;
      }

      if (!cached?.success) setStatus("retry");
    }
  }, [applyResolved, queryClient]);

  useEffect(() => {
    resolveSession();
  }, [resolveSession]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    const notice = u.searchParams.get("notice");
    if (notice === "store_removed") {
      toast.error("This store is no longer available. It was removed with the parent account.", {
        duration: 5500,
      });
      u.searchParams.delete("notice");
      const qs = u.searchParams.toString();
      window.history.replaceState({}, "", `${u.pathname}${qs ? `?${qs}` : ""}`);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    if (u.searchParams.get("verification_updates_submitted") !== "1") return;
    // Keep flag briefly so single-store auto-dashboard redirect does not fire.
    setVerificationSubmittedBanner(true);
    toast.success(
      "Your updates have been successfully submitted. Our team will review and verify them shortly.",
      { duration: 5500 }
    );
    const hi = u.searchParams.get("highlight_store")?.trim();
    if (hi) setHighlightStorePublicId(hi);
    u.searchParams.delete("verification_updates_submitted");
    u.searchParams.delete("highlight_store");
    const qs = u.searchParams.toString();
    window.history.replaceState({}, "", `${u.pathname}${qs ? `?${qs}` : ""}`);
  }, []);

  // Highlight store from ?highlight_store= (e.g. post-onboarding) without requiring verification banner.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    const hi = u.searchParams.get("highlight_store")?.trim();
    if (!hi) return;
    setHighlightStorePublicId(hi);
  }, []);

  const goToDashboard = (storeId: string) => {
    persistPartnerSelectedStoreId(storeId);
    try {
      localStorage.setItem("partnerManagedStoreIds", JSON.stringify([storeId]));
    } catch {
      /* ignore */
    }
    // Replace so Back from dashboard does not re-land on the store picker
    // immediately after a fresh login → all-stores → auto-enter chain.
    window.location.replace("/partners/dashboard");
  };

  const goToOnboarding = (storeId?: string) => {
    const parentId = data?.parentId ?? data?.onboardingProgress?.parent_id ?? 0;
    const store = storeId && data?.stores ? data.stores.find((s) => s.store_id === storeId) : undefined;
    const rej = store?.verification_step_rejections;
    const openRej = Array.isArray(rej) ? rej : [];
    const fixParam =
      openRej.length > 0
        ? `&verification_fix_step=${Math.min(...openRej.map((r) => Number(r.step_number)))}`
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

  /** Prefer highlighted store; else first store with open verification rejection. */
  const storeNeedingVerificationFix = useMemo(() => {
    const stores = data?.stores ?? [];
    if (highlightStorePublicId) {
      const highlighted = stores.find(
        (s) => s.store_id === highlightStorePublicId && storeHasOpenVerificationFix(s)
      );
      if (highlighted) return highlighted;
    }
    return stores.find((s) => storeHasOpenVerificationFix(s)) ?? null;
  }, [data?.stores, highlightStorePublicId]);

  /** Single approved child → open dashboard. Do NOT auto-open the register-store form
   * for a single submitted/pending store — stay on the All Stores picker so "View Store"
   * after onboarding does not dump the merchant back into the form. */
  useEffect(() => {
    if (status !== "home" || !data) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("picker") === "1") return;
    if (params.get("verification_updates_submitted") === "1") return;
    if (highlightStorePublicId) return;
    if (verificationSubmittedBanner) return;
    const stores = data.stores ?? [];
    if (stores.length !== 1) return;
    const only = stores[0]!;
    const approved = String(only.approval_status || "").toUpperCase() === "APPROVED";
    if (approved) {
      goToDashboard(only.store_id);
    }
    // Non-approved: show the store list (user can tap Complete Onboarding or Add Store).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when session home is ready
  }, [status, data, highlightStorePublicId, verificationSubmittedBanner]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 px-4">
        <PartnerAccountLoadingSpinner label="Loading your account..." />
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

  // Brief hold while single approved store auto-enters dashboard (unless picker forced).
  const forcePicker =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("picker") === "1";
  const onlyStore = stores.length === 1 ? stores[0] : null;
  const onlyApproved =
    !!onlyStore && String(onlyStore.approval_status || "").toUpperCase() === "APPROVED";
  if (
    !forcePicker &&
    !highlightStorePublicId &&
    !verificationSubmittedBanner &&
    onlyApproved
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 px-4">
        <PartnerAccountLoadingSpinner size="sm" label="Opening your store…" />
      </div>
    );
  }

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    try {
      const { partnerLogoutLocal } = await import("@/lib/auth/partner-logout");
      await partnerLogoutLocal({ redirectToLogin: true, clearStoreSelection: true });
    } catch (error) {
      console.error("Logout error:", error);
      window.location.href = "/auth";
    } finally {
      setIsLoggingOut(false);
      setShowLogoutModal(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/50 flex flex-col">
      <header className="shrink-0">
        <div className="px-3 sm:px-4 pt-3 sm:pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <img src="/onlylogo.png" alt="GatiMitra" className="h-8 w-auto sm:h-9 object-contain shrink-0" />
              <span className="hidden sm:inline text-xs font-semibold uppercase tracking-wider text-slate-500">
                Partner
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <NeedHelpBadge inline variant="pill" />
              <button
                type="button"
                onClick={() => setShowLogoutModal(true)}
                className="flex items-center gap-2 rounded-lg border border-red-600 bg-red-600 px-3 py-2 text-xs sm:text-sm font-medium text-white hover:bg-red-700 hover:border-red-700"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>
        </div>

        <div className="px-3 sm:px-6 pt-3 sm:pt-4 pb-2 sm:pb-3">
          <div className="mx-auto max-w-5xl flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center sm:gap-x-4">
            <p className="text-sm sm:text-base font-semibold text-slate-900">
              {parentName || ownerName || "Partner"}
            </p>
            <span className="hidden sm:inline text-slate-300" aria-hidden>
              ·
            </span>
            <p className="text-xs sm:text-sm text-slate-500 font-mono">{parentMerchantId ?? "—"}</p>
            {ownerEmail ? (
              <>
                <span className="hidden sm:inline text-slate-300" aria-hidden>
                  ·
                </span>
                <p className="text-[11px] sm:text-xs text-slate-500 truncate max-w-[min(92vw,28rem)]">
                  {ownerEmail}
                </p>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main
        className={`flex-1 px-2 sm:px-4 lg:px-6 pb-8 sm:pb-10 ${
          stores.length === 0 ? "flex items-start justify-center pt-10 sm:pt-14" : ""
        }`}
      >
        <div className="mx-auto max-w-7xl w-full">
          {storeNeedingVerificationFix ? (
            <div className="mt-3 sm:mt-4 w-full">
              <StoreVerificationRejectedHeaderBanner
                badgeLabel={
                  (storeNeedingVerificationFix.verification_step_rejections?.length ?? 0) > 1
                    ? "Few onboarding details Rejected"
                    : "Onboarding detail Rejected"
                }
                title="Please review & fix your onboarding"
                primaryMessage={
                  storeNeedingVerificationFix.store_name
                    ? `${storeNeedingVerificationFix.store_name} — update the rejected steps so we can verify your store.`
                    : "Update the rejected steps so we can verify your store."
                }
                secondaryMessage="Complete onboarding is mandatory to keep your store active on GatiMitra."
                ctaLabel="Fix onboarding details"
                onFix={() => {
                  const storeId = storeNeedingVerificationFix.store_id;
                  const parentId = data?.parentId ?? data?.onboardingProgress?.parent_id ?? 0;
                  const rej = storeNeedingVerificationFix.verification_step_rejections;
                  const openRej = Array.isArray(rej) ? rej : [];
                  const fixStep =
                    openRej.length > 0
                      ? Math.min(...openRej.map((r) => Number(r.step_number)))
                      : 4;
                  router.push(
                    `/auth/resubmit-onboarding?store_id=${encodeURIComponent(storeId)}&parent_id=${encodeURIComponent(String(parentId))}&verification_fix_step=${fixStep}&returnTo=${encodeURIComponent(allStoresPickerHref(parentId))}`
                  );
                }}
              />
            </div>
          ) : null}

          {stores.length > 0 ? (
            <div className="text-center mt-5 sm:mt-6">
              <p className="text-xs sm:text-sm font-semibold tracking-wide text-slate-500 uppercase">Select Store</p>
            </div>
          ) : null}

          <div className={stores.length === 0 ? "flex justify-center" : "mt-6 sm:mt-8 flex justify-center"}>
            <div className={stores.length === 0 ? "" : "w-full max-w-6xl"}>
              <div
                className={
                  stores.length === 0
                    ? "flex justify-center"
                    : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 sm:gap-10 justify-items-center"
                }
              >
                {storesOrdered.map((store) => {
                  const badge = getStatusBadge(store);
                  const pendingOnboarding = isOnboardingPending(store);
                  const hasOpenFix = storeHasOpenVerificationFix(store);
                  const isApproved = String(store.approval_status || "").toUpperCase() === "APPROVED";
                  const canContinueOnboarding = storeNeedsOnboardingAction(store);
                  const isHighlighted = !!highlightStorePublicId && store.store_id === highlightStorePublicId;
                  // Always prefer store banner when available — including rejected onboarding.
                  const bannerSrc = store.banner_url
                    ? normalizeMerchantStoreMediaUrl(store.banner_url) ?? store.banner_url
                    : null;
                  const showDraftPlaceholder = pendingOnboarding && !hasOpenFix && !bannerSrc;

                  const onCardClick = () => {
                    // Open rejection steps still need the fix flow.
                    if (hasOpenFix) {
                      const parentId = data?.parentId ?? data?.onboardingProgress?.parent_id ?? 0;
                      const openRej = store.verification_step_rejections ?? [];
                      const fixStep =
                        openRej.length > 0
                          ? Math.min(...openRej.map((r) => Number(r.step_number)))
                          : 4;
                      router.push(
                        `/auth/resubmit-onboarding?store_id=${encodeURIComponent(store.store_id)}&parent_id=${encodeURIComponent(String(parentId))}&verification_fix_step=${fixStep}&returnTo=${encodeURIComponent(allStoresPickerHref(parentId))}`
                      );
                      return;
                    }
                    // Incomplete draft stays on All Stores until they tap Complete Onboarding or Add Store.
                    if (canContinueOnboarding && !isStoreOnboardingSubmitted(store) && !isApproved) {
                      return;
                    }
                    // Verified or under review / submitted — always allow partner dashboard entry.
                    goToDashboard(store.store_id);
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
                          {showDraftPlaceholder ? (
                            <span className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 inline-flex items-center justify-center rounded-full bg-emerald-500 p-1.5 shadow-md ring-2 ring-white">
                              <Leaf className="h-3.5 w-3.5 text-white" aria-hidden />
                            </span>
                          ) : null}
                          <div
                            className={`relative h-[104px] w-[104px] sm:h-[120px] sm:w-[120px] overflow-hidden rounded-full shadow-lg transition-transform duration-200 group-hover:scale-[1.03] group-active:scale-[0.99] ${
                              isHighlighted ? "ring-4 ring-emerald-300" : "ring-2 ring-slate-200"
                            }`}
                          >
                            {bannerSrc ? (
                              <img
                                src={bannerSrc}
                                alt=""
                                className="absolute inset-0 h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : showDraftPlaceholder ? (
                              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100">
                                <span className="text-4xl sm:text-5xl font-bold text-emerald-700 select-none">P</span>
                              </div>
                            ) : (
                              <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-blue-50 to-purple-50" />
                            )}
                            {bannerSrc || !showDraftPlaceholder ? (
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
                        </div>
                      </div>

                        <div className="mt-2 px-1">
                          <p className="text-sm sm:text-base font-semibold text-slate-900 leading-snug text-center break-words line-clamp-2">
                            {store.store_name || "Unnamed store"}
                          </p>
                        </div>
                      </button>

                      {pendingOnboarding && canContinueOnboarding && !hasOpenFix ? (
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

