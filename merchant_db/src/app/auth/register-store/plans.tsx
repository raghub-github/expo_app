"use client";

import { useState, useCallback } from "react";
import { ChevronLeft, Check, Info, Loader2 } from "lucide-react";

export interface OnboardingPlan {
  id: string;
  name: string;
  onboardingFee: number;
  baseServiceFee: string;
  features: string[];
  highlighted?: boolean;
}

/** Display price for today (promotional); actual amount is configurable by super admin. */
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
      `One-time onboarding fee ₹${PROMO_PRICE_TODAY}/- today (standard ₹${STANDARD_ONBOARDING_AMOUNT} — updatable by admin)`,
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
  onBack,
  onContinue,
  actionLoading = false,
}: OnboardingPlansPageProps) {
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  const plans = DEFAULT_PLANS;
  const canContinue = !!selectedPlanId;

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
      const orderRes = await fetch("/api/onboarding/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantParentId: parentInfo.id,
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
      await loadRazorpayScript();
      if (!window.Razorpay) {
        setPaymentError("Payment gateway could not be loaded. Try again or contact support.");
        return;
      }
      const rzp = new window.Razorpay({
        key: orderData.keyId,
        amount: orderData.amount,
        order_id: orderData.orderId,
        name: "Merchant Onboarding",
        description: "One-time onboarding fee (₹1 today)",
        handler: async (res) => {
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
              onContinue();
            } else {
              setPaymentError(verifyData.error || "Payment verification failed.");
            }
          } finally {
            setPaying(false);
          }
        },
      });
      rzp.open();
    } catch (e) {
      setPaymentError("Something went wrong. Please try again.");
    } finally {
      setPaying(false);
    }
  }, [selectedPlanId, parentInfo?.id, plans, loadRazorpayScript, onContinue]);

  return (
    <div className="min-h-full w-full bg-gradient-to-br from-slate-50 to-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-28">
        <div className="text-center mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
            Your commission plan
          </h1>
          <p className="text-slate-600 text-sm sm:text-base">
            Choose your plan. Fees and benefits can be viewed below. Contract link will be sent after you proceed.
          </p>
        </div>

        <div className="space-y-6 mb-10">
          {plans.map((plan) => {
            const isSelected = selectedPlanId === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => onSelectPlan(plan.id)}
                className={`w-full text-left rounded-2xl border-2 p-6 transition-all ${
                  isSelected
                    ? "border-indigo-600 bg-indigo-50/50 shadow-md"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h2 className="text-xl font-bold text-slate-900">{plan.name}</h2>
                      {plan.highlighted && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                          Recommended
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-slate-700 mb-4">
                      <span className="flex items-center gap-1">
                        <Info className="w-4 h-4 text-slate-400" />
                        One-time onboarding fee <strong>₹{PROMO_PRICE_TODAY}/- today</strong>
                        {plan.onboardingFee !== PROMO_PRICE_TODAY && (
                          <span className="text-slate-500"> (standard ₹{plan.onboardingFee})</span>
                        )}
                      </span>
                      <span>Base service fee {plan.baseServiceFee}</span>
                    </div>
                    <ul className="space-y-2">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-slate-600">
                          <Check className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex items-center">
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? "border-indigo-600 bg-indigo-600" : "border-slate-300"
                      }`}
                    >
                      {isSelected && <Check className="w-4 h-4 text-white" />}
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

        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 mb-8 text-sm text-amber-900">
          <p>
            Pay ₹{PROMO_PRICE_TODAY}/- today to proceed. Contract and agreement will be shown on the next step. You will need to read the full contract and sign digitally before submission.
          </p>
        </div>
      </div>

      {/* Navigation - Bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-10 bg-white border-t border-slate-200 px-4 py-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={actionLoading || paying}
            className="flex items-center gap-2 px-5 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ChevronLeft className="w-5 h-5" />}
            Back
          </button>
          <button
            type="button"
            onClick={handlePayAndContinue}
            disabled={!canContinue || paying || actionLoading}
            className="px-6 sm:px-8 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {(paying || actionLoading) ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Pay ₹{PROMO_PRICE_TODAY} & Continue
                <ChevronLeft className="w-4 h-4 rotate-180" />
              </>
            )}
            {(paying || actionLoading) ? 'Loading...' : `Pay ₹${PROMO_PRICE_TODAY} & Continue`}
          </button>
        </div>
      </div>
    </div>
  );
}
