"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, Check, Info, Loader2, CheckCircle, Handshake, FileText } from "lucide-react";

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

/** Promotional price (₹1); standard onboarding amount. Later: configurable via dashboard offer. */
const PROMO_PRICE_TODAY = 1;
const STANDARD_ONBOARDING_AMOUNT = 99;

const DEFAULT_PLANS: OnboardingPlan[] = [
  {
    id: "FREE",
    name: "Starter Plan",
    onboardingFee: STANDARD_ONBOARDING_AMOUNT,
    baseServiceFee: "0%",
    highlighted: true,
    features: [
      `Onboarding fee: ₹${PROMO_PRICE_TODAY} out of ₹${STANDARD_ONBOARDING_AMOUNT} — 99% discount for limited time (standard amount configurable by platform)`,
      "Base service fee 0% for initial period",
      "Real-time on-call support",
      "Weekly or daily payouts",
      "Full access to partner dashboard",
    ],
  },
];

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
  const plans = DEFAULT_PLANS;
  const canContinue = !!selectedPlanId;

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
        // Get store_id from step1 or URL
        const storePublicId = typeof window !== "undefined" 
          ? new URLSearchParams(window.location.search).get("store_id") 
          : null;
        const storeId = storePublicId || step1?.store_public_id || step1?.__storePublicId || step1?.__draftStorePublicId || null;
        
        // Payment status is checked by store_id only (merchant_store_id in DB). No store_id → not paid.
        const url = storeId
          ? `/api/onboarding/payment-status?merchantParentId=${encodeURIComponent(parentInfo!.id!)}&merchantStoreId=${encodeURIComponent(storeId)}`
          : `/api/onboarding/payment-status?merchantParentId=${encodeURIComponent(parentInfo!.id!)}`;

        const res = await fetch(url);
        const data = await res.json();
        if (cancelled) return;
        if (data.success && data.alreadyPaid) {
          console.log('[plans] Payment already completed for store:', storeId, parentInfo.id);
          setAlreadyPaid(true);
        } else {
          console.log('[plans] Payment not completed or check failed:', data);
          setAlreadyPaid(false);
        }
      } catch (err) {
        console.error('[plans] Payment status check error:', err);
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
    if (!selectedPlanId || !parentInfo?.id) {
      setPaymentError("Please select a plan and ensure you are logged in.");
      return;
    }
    setPaying(true);
    setPaymentError("");
    try {
      // Get store_id from URL or step1 data
      const storePublicId = typeof window !== "undefined" 
        ? new URLSearchParams(window.location.search).get("store_id") 
        : null;
      const storeId = storePublicId || step1?.store_public_id || step1?.__storePublicId || step1?.__draftStorePublicId || null;
      
      const orderRes = await fetch("/api/onboarding/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantParentId: parentInfo.id,
          merchantStoreId: storeId, // Pass store_id to payment API
          planId: selectedPlanId,
          planName: plans.find((p) => p.id === selectedPlanId)?.name,
          amountPaise: PROMO_PRICE_TODAY * 100,
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
      const rzp = new window.Razorpay({
        key: orderData.keyId,
        amount: orderData.amount,
        order_id: orderData.orderId,
        name: "Merchant Onboarding",
        description: `Onboarding fee: ₹${PROMO_PRICE_TODAY} out of ₹${STANDARD_ONBOARDING_AMOUNT} (99% off, limited time)`,
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
  }, [selectedPlanId, parentInfo?.id, plans, loadRazorpayScript, onContinue]);

  return (
    <div className="min-h-full w-full bg-gradient-to-br from-slate-50 to-white">
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 pb-32 sm:pb-36">
        <div className="text-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
            Your commission plan
          </h1>
          <p className="text-slate-600 text-sm sm:text-base">
            Choose your plan. Fees and benefits can be viewed below. Contract link will be sent after you proceed.
          </p>
        </div>

        <div className="space-y-6 mb-6">
          {plans.map((plan) => {
            const isSelected = selectedPlanId === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => onSelectPlan(plan.id)}
                className={`w-full text-left rounded-2xl border-2 p-4 sm:p-5 transition-all ${
                  isSelected
                    ? "border-indigo-600 bg-indigo-50/50 shadow-md"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h2 className="text-lg sm:text-xl font-bold text-slate-900">{plan.name}</h2>
                      {plan.highlighted && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                          Recommended
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs sm:text-sm text-slate-700 mb-3">
                      <span className="flex items-center gap-1">
                        <Info className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
                        Onboarding fee: <strong>₹{PROMO_PRICE_TODAY} out of ₹{STANDARD_ONBOARDING_AMOUNT}</strong>
                        <span className="text-emerald-600 font-medium"> — 99% off for limited time</span>
                        {plan.onboardingFee !== PROMO_PRICE_TODAY && (
                          <span className="text-slate-500"> (standard ₹{plan.onboardingFee})</span>
                        )}
                      </span>
                      <span>Base service fee {plan.baseServiceFee}</span>
                    </div>
                    <ul className="space-y-1.5">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-slate-600">
                          <Check className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500 shrink-0 mt-0.5" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    {/* Payment status on card */}
                    {!paymentStatusLoading && alreadyPaid && (
                      <div className="mt-3 pt-3 border-t border-emerald-200">
                        <div className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs sm:text-sm font-semibold text-emerald-900">Payment completed</p>
                            <p className="text-[10px] sm:text-xs text-emerald-700 mt-0.5">
                              Your onboarding payment has been recorded. Click Continue below to proceed to the agreement.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Payment message on card */}
                    {!paymentStatusLoading && !alreadyPaid && (
                      <div className="mt-3 pt-3 border-t border-amber-200">
                        <div className="flex items-start gap-2">
                          <Info className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 shrink-0 mt-0.5" />
                          <p className="text-[10px] sm:text-xs text-amber-800">
                            Pay ₹{PROMO_PRICE_TODAY} to proceed (₹{STANDARD_ONBOARDING_AMOUNT} value — 99% discount for limited time). Contract and agreement will be shown on the next step. You will need to read the full contract and sign digitally before submission.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center">
                    <div
                      className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? "border-indigo-600 bg-indigo-600" : "border-slate-300"
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {paymentError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 mb-4 text-sm text-red-800">
            {paymentError}
          </div>
        )}

        {paymentStatusLoading && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4 mb-4 flex items-center gap-3 text-slate-600">
            <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin shrink-0" />
            <span className="text-xs sm:text-sm">Checking payment status...</span>
          </div>
        )}

        {/* Commission Information Box */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:p-4 mb-4 flex items-start gap-2 sm:gap-3">
          <Handshake className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              Our commission structure is designed to be transparent and fair. All fees are clearly communicated upfront, and you'll receive detailed breakdowns in your monthly statements. For any questions about commission rates or charges, please contact our support team.
            </p>
          </div>
        </div>

        <p className="text-center text-xs sm:text-sm text-slate-600 mb-6">
          <Link
            href="/refund-policy?source=onboarding"
            className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 font-medium underline underline-offset-2"
          >
            <FileText size={14} />
            View refund policy
          </Link>
        </p>
      </div>

      {/* Navigation - Bottom (padding so taskbar doesn't overlap) */}
      <div className="fixed bottom-0 left-14 sm:left-[13rem] md:left-56 lg:left-60 right-0 z-20 bg-white border-t border-slate-200 px-3 sm:px-4 py-4 pb-6 sm:pb-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={actionLoading || paying}
            className="flex items-center gap-2 px-3 sm:px-5 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium disabled:opacity-60 disabled:cursor-not-allowed text-sm sm:text-base"
          >
            {actionLoading ? <Loader2 className="w-5 h-5 animate-spin shrink-0" /> : <ChevronLeft className="w-5 h-5 shrink-0" />}
            Previous
          </button>
          {paymentStatusLoading ? (
            <button
              type="button"
              disabled
              className="px-6 sm:px-8 py-3 bg-indigo-600 text-white font-semibold rounded-xl opacity-50 cursor-not-allowed flex items-center gap-2"
            >
              <Loader2 className="w-5 h-5 animate-spin shrink-0" />
              <span>Checking payment...</span>
            </button>
          ) : alreadyPaid ? (
            <button
              type="button"
              onClick={() => {
                // Ensure we proceed to agreement (step 8) when payment is completed
                console.log('[plans] Continue clicked, alreadyPaid:', alreadyPaid);
                onContinue();
              }}
              disabled={actionLoading}
              className="px-6 sm:px-8 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {actionLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <span>Continue to Agreement</span>
                  <ChevronLeft className="w-4 h-4 rotate-180 shrink-0" />
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePayAndContinue}
              disabled={!canContinue || paying || actionLoading}
              className="px-6 sm:px-8 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {(paying || actionLoading) ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <span>Pay ₹{PROMO_PRICE_TODAY} (99% off) & Continue</span>
                  <ChevronLeft className="w-4 h-4 rotate-180 shrink-0" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
