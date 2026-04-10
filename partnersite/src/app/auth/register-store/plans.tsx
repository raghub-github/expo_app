"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, Check, Info, Loader2, CheckCircle, Handshake, FileText } from "lucide-react";
import type { StoreOnboardingCommissionConfigDTO } from "@/lib/store-onboarding-commission-config";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 100; // ~5 min

export interface OnboardingPlan {
  id: string;
  name: string;
  onboardingFee: number;
  baseServiceFee: string;
  features: string[];
  highlighted?: boolean;
}

function configToPlans(c: StoreOnboardingCommissionConfigDTO): OnboardingPlan[] {
  const std = parseFloat(c.standardOnboardingFee);
  const basePct = parseFloat(c.baseServiceFeePercent);
  const features = Array.isArray(c.features) ? c.features.filter((x) => typeof x === "string" && x.trim()) : [];
  return [
    {
      id: "FREE",
      name: c.planName.trim() || "Plan",
      onboardingFee: Number.isFinite(std) ? std : 0,
      baseServiceFee: `${Number.isFinite(basePct) ? basePct : 0}%`,
      highlighted: c.showRecommendedBadge,
      features,
    },
  ];
}

interface OnboardingPlansPageProps {
  selectedPlanId: string | null;
  onSelectPlan: (planId: string) => void;
  parentInfo: { id: number | null; name: string | null; parent_merchant_id: string | null } | null;
  step1?: any; // Store data from step 1 to get store_id
  onBack: () => void;
  onContinue: () => void;
  actionLoading?: boolean;
}

declare global {
  interface Window {
    Razorpay?: new (options: {
      key: string;
      amount: number;
      order_id: string;
      name: string;
      description: string;
      handler: (res: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
      prefill?: { email?: string; contact?: string };
    }) => { open: () => void };
  }
}

function PlanCardSkeleton() {
  return (
    <div className="w-full rounded-xl border-2 border-slate-200 bg-white p-3 sm:p-4 animate-pulse">
      <div className="flex justify-between gap-2">
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <div className="h-5 w-36 rounded bg-slate-200" />
            <div className="h-4 w-20 rounded-full bg-amber-100" />
          </div>
          <div className="h-3 w-full max-w-md rounded bg-slate-200" />
          <div className="h-3 w-24 rounded bg-slate-100" />
          <div className="space-y-1.5 pt-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-2.5 w-full rounded bg-slate-100" />
            ))}
          </div>
        </div>
        <div className="h-5 w-5 shrink-0 rounded-full border-2 border-slate-200" />
      </div>
    </div>
  );
}

export default function OnboardingPlansPage({
  selectedPlanId,
  onSelectPlan,
  parentInfo,
  step1,
  onBack,
  onContinue,
  actionLoading = false,
}: OnboardingPlansPageProps) {
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentStatusLoading, setPaymentStatusLoading] = useState(true);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [commissionCfg, setCommissionCfg] = useState<StoreOnboardingCommissionConfigDTO | null>(null);
  const [commissionLoading, setCommissionLoading] = useState(true);
  const [commissionError, setCommissionError] = useState<string | null>(null);

  const configReady = commissionCfg != null && !commissionLoading && !commissionError;

  const plans = useMemo(() => (commissionCfg ? configToPlans(commissionCfg) : []), [commissionCfg]);

  const promoRupee = useMemo(
    () => (commissionCfg ? parseFloat(commissionCfg.discountedOnboardingFee) : NaN),
    [commissionCfg]
  );
  const standardRupee = useMemo(
    () => (commissionCfg ? parseFloat(commissionCfg.standardOnboardingFee) : NaN),
    [commissionCfg]
  );
  const discountPct = useMemo(
    () => (commissionCfg ? parseFloat(commissionCfg.discountPercent) : NaN),
    [commissionCfg]
  );

  /** GST % on discounted onboarding fee (0 = none). */
  const gstPct = useMemo(() => {
    if (!commissionCfg) return 0;
    const n = parseFloat(commissionCfg.gstPercent);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(100, n);
  }, [commissionCfg]);

  const { subtotalPaise, gstAmountPaise, totalPaise } = useMemo(() => {
    const sub = Math.max(0, Math.round(promoRupee * 100));
    if (!Number.isFinite(promoRupee)) {
      return { subtotalPaise: 0, gstAmountPaise: 0, totalPaise: 0 };
    }
    const gst = Math.round((sub * gstPct) / 100);
    return { subtotalPaise: sub, gstAmountPaise: gst, totalPaise: sub + gst };
  }, [promoRupee, gstPct]);

  const totalRupeeDisplay = useMemo(() => {
    const r = totalPaise / 100;
    return Number.isInteger(r) ? String(r) : r.toFixed(2);
  }, [totalPaise]);
  const gstRupeeDisplay = useMemo(() => {
    const r = gstAmountPaise / 100;
    if (gstAmountPaise === 0) return "0";
    return Number.isInteger(r) ? String(r) : r.toFixed(2);
  }, [gstAmountPaise]);

  const canContinue = !!selectedPlanId;
  const feesValid =
    configReady && Number.isFinite(promoRupee) && Number.isFinite(standardRupee) && Number.isFinite(discountPct);

  const loadCommission = useCallback(async () => {
    setCommissionLoading(true);
    setCommissionError(null);
    try {
      const res = await fetch("/api/public/store-onboarding-commission-config", { cache: "no-store" });
      const data = await res.json();
      if (data.success && data.config) {
        setCommissionCfg(data.config as StoreOnboardingCommissionConfigDTO);
      } else {
        setCommissionCfg(null);
        setCommissionError(typeof data.error === "string" ? data.error : "Could not load plan pricing.");
      }
    } catch {
      setCommissionCfg(null);
      setCommissionError("Could not load plan pricing. Check your connection and try again.");
    } finally {
      setCommissionLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCommission();
  }, [loadCommission]);

  // Poll payment status by orderId when user may have paid but closed/refreshed (or webhook captured)
  const checkOrderStatus = useCallback(async (orderId: string): Promise<boolean> => {
    const res = await fetch(`/api/onboarding/payment-status?orderId=${encodeURIComponent(orderId)}`);
    const data = await res.json();
    return !!(data.success && data.alreadyPaid);
  }, []);

  useEffect(() => {
    if (!pendingOrderId || alreadyPaid) return;
    let attempts = 0;
    const t = setInterval(async () => {
      attempts++;
      if (attempts > POLL_MAX_ATTEMPTS) {
        clearInterval(t);
        setPendingOrderId(null);
        return;
      }
      const captured = await checkOrderStatus(pendingOrderId);
      if (captured) {
        clearInterval(t);
        setPendingOrderId(null);
        setAlreadyPaid(true);
        onContinue();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [pendingOrderId, alreadyPaid, checkOrderStatus, onContinue]);

  // When user returns to tab, check pending order once
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible" || !pendingOrderId || alreadyPaid) return;
      checkOrderStatus(pendingOrderId).then((captured) => {
        if (captured) {
          setPendingOrderId(null);
          setAlreadyPaid(true);
          onContinue();
        }
      });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pendingOrderId, alreadyPaid, checkOrderStatus, onContinue]);

  // Check if this store has already completed onboarding payment (e.g. after logout or navigating back)
  useEffect(() => {
    if (!parentInfo?.id) {
      setPaymentStatusLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const storePublicId =
          typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("store_id") : null;
        const storeId =
          storePublicId || step1?.store_public_id || step1?.__storePublicId || step1?.__draftStorePublicId || null;

        const url = storeId
          ? `/api/onboarding/payment-status?merchantParentId=${encodeURIComponent(parentInfo!.id!)}&merchantStoreId=${encodeURIComponent(storeId)}`
          : `/api/onboarding/payment-status?merchantParentId=${encodeURIComponent(parentInfo!.id!)}`;

        const res = await fetch(url);
        const data = await res.json();
        if (cancelled) return;
        if (data.success && data.alreadyPaid) {
          setAlreadyPaid(true);
        } else {
          setAlreadyPaid(false);
        }
      } catch (err) {
        console.error("[plans] Payment status check error:", err);
        if (!cancelled) setAlreadyPaid(false);
      } finally {
        if (!cancelled) setPaymentStatusLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [parentInfo?.id, step1]);

  const loadRazorpayScript = useCallback(() => {
    return new Promise<void>((resolve) => {
      if (typeof window !== "undefined" && window.Razorpay) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.body.appendChild(script);
    });
  }, []);

  const handlePayAndContinue = useCallback(async () => {
    if (!commissionCfg || !feesValid) {
      setPaymentError("Plan pricing is not loaded yet. Please wait or refresh.");
      return;
    }
    if (!selectedPlanId || !parentInfo?.id) {
      setPaymentError("Please select a plan and ensure you are logged in.");
      return;
    }
    setPaying(true);
    setPaymentError("");
    try {
      const storePublicId =
        typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("store_id") : null;
      const storeId =
        storePublicId || step1?.store_public_id || step1?.__storePublicId || step1?.__draftStorePublicId || null;

      const orderRes = await fetch("/api/onboarding/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantParentId: parentInfo.id,
          merchantStoreId: storeId,
          planId: selectedPlanId,
          planName: plans.find((p) => p.id === selectedPlanId)?.name,
        }),
      });
      const orderData = await orderRes.json();
      if (!orderData.success || !orderData.orderId) {
        if (orderRes.status === 503) {
          onContinue();
          return;
        }
        setPaymentError(orderData.error || "Could not create order.");
        return;
      }
      setPendingOrderId(orderData.orderId);
      await loadRazorpayScript();
      if (!window.Razorpay) {
        setPaymentError("Payment gateway could not be loaded. Try again or contact support.");
        setPendingOrderId(null);
        return;
      }
      const rzpDesc =
        gstPct > 0
          ? `Onboarding ₹${promoRupee} + ${gstPct}% GST (₹${gstRupeeDisplay}) = ₹${totalRupeeDisplay} total`
          : `Onboarding fee: ₹${promoRupee} out of ₹${standardRupee} (${discountPct}% off, ${commissionCfg.discountPeriodLabel})`;
      const rzp = new window.Razorpay({
        key: orderData.keyId,
        amount: orderData.amount,
        order_id: orderData.orderId,
        name: "Merchant Onboarding",
        description: rzpDesc,
        handler: async (res: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          setPaying(true);
          try {
            const verifyRes = await fetch("/api/onboarding/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: res.razorpay_order_id,
                razorpay_payment_id: res.razorpay_payment_id,
                razorpay_signature: res.razorpay_signature,
              }),
            });
            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              setPendingOrderId(null);
              setAlreadyPaid(true);
              onContinue();
            } else {
              setPaymentError(verifyData.error || "Payment verification failed.");
            }
          } finally {
            setPaying(false);
          }
        },
        modal: {
          ondismiss: () => setPaying(false),
        },
      } as any);
      rzp.open();
    } catch (e) {
      setPaymentError("Something went wrong. Please try again.");
    } finally {
      setPaying(false);
    }
  }, [
    commissionCfg,
    feesValid,
    selectedPlanId,
    parentInfo?.id,
    plans,
    loadRazorpayScript,
    onContinue,
    promoRupee,
    standardRupee,
    discountPct,
    gstPct,
    gstRupeeDisplay,
    totalRupeeDisplay,
    step1,
  ]);

  const payButtonLabel =
    commissionCfg?.payButtonText?.trim() ||
    (feesValid
      ? gstPct > 0
        ? `Pay ₹${totalRupeeDisplay} (incl. ${gstPct}% GST) & Continue`
        : `Pay ₹${promoRupee} (${discountPct}% off) & Continue`
      : "Pay & Continue");

  /** Primary action: commission config must load before payment flow; payment status runs in parallel. */
  const showCommissionGate = commissionLoading || commissionError || !commissionCfg;

  return (
    <div className="min-h-full w-full bg-gradient-to-br from-slate-50 to-white">
      <div className="max-w-4xl mx-auto px-3 sm:px-5 py-4 sm:py-5 pb-[calc(7.5rem+env(safe-area-inset-bottom))] sm:pb-[calc(8.5rem+env(safe-area-inset-bottom))]">
        <div className="text-center mb-3 sm:mb-4">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">Your commission plan</h1>
          <p className="text-slate-600 text-xs sm:text-sm leading-snug max-w-lg mx-auto">
            Fees and benefits load from our servers and are shown below.
          </p>
        </div>

        {commissionLoading && (
          <div className="mb-3 space-y-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 flex items-center gap-2 text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span className="text-xs sm:text-sm">Loading plan and onboarding fees…</span>
            </div>
            <PlanCardSkeleton />
          </div>
        )}

        {!commissionLoading && commissionError && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-3 space-y-2">
            <p className="text-sm text-amber-900">{commissionError}</p>
            <button
              type="button"
              onClick={() => void loadCommission()}
              className="rounded-lg bg-amber-800 px-4 py-2 text-sm font-medium text-white hover:bg-amber-900"
            >
              Try again
            </button>
          </div>
        )}

        {configReady && (
          <div className="space-y-3 mb-3">
            {plans.map((plan) => {
              const isSelected = selectedPlanId === plan.id;
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => onSelectPlan(plan.id)}
                  className={`w-full text-left rounded-xl border-2 p-3 sm:p-4 transition-all ${
                    isSelected
                      ? "border-indigo-600 bg-indigo-50/50 shadow-md"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 pr-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <h2 className="text-base sm:text-lg font-bold text-slate-900">{plan.name}</h2>
                        {plan.highlighted && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-amber-100 text-amber-800">
                            Recommended
                          </span>
                        )}
                      </div>
                      <div className="space-y-1.5 mb-2 text-left">
                        <div className="flex items-start gap-1.5 text-[11px] sm:text-xs text-slate-700 leading-snug">
                          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span>
                            Onboarding fee:{" "}
                            <strong>
                              ₹{promoRupee} out of ₹{standardRupee}
                            </strong>
                            <span className="text-emerald-600 font-medium">
                              {" "}
                              — {discountPct}% off {commissionCfg!.discountPeriodLabel}
                            </span>
                            {plan.onboardingFee !== promoRupee && (
                              <span className="text-slate-500"> (standard ₹{plan.onboardingFee})</span>
                            )}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 pl-[1.375rem] sm:pl-5">
                          <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] sm:text-xs font-semibold text-slate-700">
                            Base service fee {plan.baseServiceFee}
                          </span>
                          {commissionCfg!.baseServiceFeePeriodLabel?.trim() ? (
                            <span className="text-[10px] sm:text-[11px] text-slate-500 leading-tight">
                              {commissionCfg!.baseServiceFeePeriodLabel}
                            </span>
                          ) : null}
                        </div>
                        {gstPct > 0 ? (
                          <div className="pl-[1.375rem] sm:pl-5 pt-0.5 space-y-0.5">
                            <p className="text-[10px] sm:text-[11px] text-slate-600 leading-snug">
                              <span className="font-medium text-slate-700">Payable now:</span> ₹{promoRupee} fee +{" "}
                              <span className="font-medium">{gstPct}% GST</span> (₹{gstRupeeDisplay}) ={" "}
                              <span className="font-semibold text-slate-900">₹{totalRupeeDisplay}</span>
                            </p>
                            <p className="text-[10px] text-slate-500">Checkout charges this total (incl. GST).</p>
                          </div>
                        ) : null}
                      </div>
                      <ul className="space-y-1">
                        {plan.features.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-1.5 text-[11px] sm:text-xs text-slate-600 leading-snug">
                            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                      {!paymentStatusLoading && alreadyPaid && (
                        <div className="mt-2 pt-2 border-t border-emerald-200">
                          <div className="flex items-start gap-1.5">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[11px] sm:text-xs font-semibold text-emerald-900">Payment completed</p>
                              <p className="text-[10px] sm:text-[11px] text-emerald-700 mt-0.5 leading-snug">
                                Continue below to proceed to the agreement.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      {!paymentStatusLoading && !alreadyPaid && (
                        <div className="mt-2 pt-2 border-t border-amber-200">
                          <div className="flex items-start gap-1.5">
                            <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-[10px] sm:text-[11px] text-amber-800 leading-snug">{commissionCfg!.alertNotice}</p>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-start pt-0.5">
                      <div
                        className={`w-5 h-5 sm:w-5 sm:h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          isSelected ? "border-indigo-600 bg-indigo-600" : "border-slate-300"
                        }`}
                      >
                        {isSelected && <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {paymentError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 mb-3 text-xs sm:text-sm text-red-800">{paymentError}</div>
        )}

        {configReady && paymentStatusLoading && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 mb-3 flex items-center gap-2 text-slate-600">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span className="text-[11px] sm:text-xs">Checking payment status…</span>
          </div>
        )}

        {configReady && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-2.5 sm:p-3 mb-3 flex items-start gap-2">
            <Handshake className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1 min-w-0">
              <p className="text-[11px] sm:text-xs text-slate-700 leading-snug">{commissionCfg!.footerNote}</p>
              <p className="text-[11px] sm:text-xs text-slate-600 leading-snug">{commissionCfg!.supportContact}</p>
            </div>
          </div>
        )}

        <p className="text-center text-[11px] sm:text-xs text-slate-600 pb-1">
          <Link
            href="/refund-policy?source=onboarding"
            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium underline underline-offset-2 py-1"
          >
            <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            View refund policy
          </Link>
        </p>
      </div>

      <div className="fixed bottom-0 left-14 sm:left-[13rem] md:left-56 lg:left-60 right-0 z-20 bg-white/95 backdrop-blur-sm border-t border-slate-200 px-3 sm:px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:py-3 sm:pb-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.08)]">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={actionLoading || paying}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium disabled:opacity-60 disabled:cursor-not-allowed text-xs sm:text-sm"
          >
            {actionLoading ? <Loader2 className="w-5 h-5 animate-spin shrink-0" /> : <ChevronLeft className="w-5 h-5 shrink-0" />}
            Previous
          </button>

          {showCommissionGate ? (
            commissionLoading ? (
              <button
                type="button"
                disabled
                className="px-4 sm:px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg opacity-50 cursor-not-allowed flex items-center gap-2"
              >
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>Loading plan…</span>
              </button>
            ) : commissionError ? (
              <button
                type="button"
                onClick={() => void loadCommission()}
                className="px-4 sm:px-6 py-2.5 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 flex items-center gap-2"
              >
                Retry loading plan
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="px-4 sm:px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg opacity-50 cursor-not-allowed flex items-center gap-2"
              >
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>Loading plan…</span>
              </button>
            )
          ) : paymentStatusLoading ? (
            <button
              type="button"
              disabled
              className="px-4 sm:px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg opacity-50 cursor-not-allowed flex items-center gap-2"
            >
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>Checking payment…</span>
            </button>
          ) : alreadyPaid ? (
            <button
              type="button"
              onClick={() => onContinue()}
              disabled={actionLoading}
              className="px-4 sm:px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {actionLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>Loading…</span>
                </>
              ) : (
                <>
                  <span className="max-w-[10rem] sm:max-w-none truncate sm:whitespace-normal">Continue to Agreement</span>
                  <ChevronLeft className="w-3.5 h-3.5 rotate-180 shrink-0" />
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePayAndContinue}
              disabled={!canContinue || paying || actionLoading || !feesValid}
              className="px-4 sm:px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 max-w-[min(100%,14rem)] sm:max-w-none"
            >
              {paying || actionLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>Loading…</span>
                </>
              ) : (
                <>
                  <span className="truncate sm:whitespace-normal text-left leading-tight">{payButtonLabel}</span>
                  <ChevronLeft className="w-3.5 h-3.5 rotate-180 shrink-0" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
