"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle, ChevronRight, Loader2, Smartphone } from "lucide-react";
import type { StoreOnboardingCommissionConfigDTO } from "@/lib/db/operations/store-onboarding-commission-config";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 100;

declare global {
  interface Window {
    Razorpay?: new (options: {
      key: string;
      amount: number;
      order_id: string;
      name: string;
      description: string;
      handler: (res: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      }) => void;
      modal?: { ondismiss?: () => void };
    }) => { open: () => void };
  }
}

type MerchantOnboardingPaymentPanelProps = {
  storeInternalId: number;
  storePublicId?: string | null;
  onPaymentCaptured?: () => void;
  apiBase?: string;
};

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve) => {
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
}

export default function MerchantOnboardingPaymentPanel({
  storeInternalId,
  storePublicId,
  onPaymentCaptured,
  apiBase = "/api/area-manager/merchant-onboarding",
}: MerchantOnboardingPaymentPanelProps) {
  const [commissionCfg, setCommissionCfg] = useState<StoreOnboardingCommissionConfigDTO | null>(null);
  const [commissionLoading, setCommissionLoading] = useState(true);
  const [paymentStatusLoading, setPaymentStatusLoading] = useState(true);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [resolvedStorePublicId, setResolvedStorePublicId] = useState(storePublicId ?? "");

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
  const gstPct = useMemo(() => {
    if (!commissionCfg) return 0;
    const n = parseFloat(commissionCfg.gstPercent);
    return Number.isFinite(n) && n >= 0 ? Math.min(100, n) : 0;
  }, [commissionCfg]);

  const { totalPaise, gstAmountPaise } = useMemo(() => {
    const sub = Math.max(0, Math.round(promoRupee * 100));
    if (!Number.isFinite(promoRupee)) return { totalPaise: 0, gstAmountPaise: 0 };
    const gst = Math.round((sub * gstPct) / 100);
    return { totalPaise: sub + gst, gstAmountPaise: gst };
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

  const displayStoreId = resolvedStorePublicId || storePublicId || "store";

  const payButtonLabel =
    commissionCfg?.payButtonText?.trim() ||
    (gstPct > 0
      ? `Pay ₹${totalRupeeDisplay} (incl. ${gstPct}% GST)`
      : `Pay ₹${totalRupeeDisplay}`);

  const markPaid = useCallback(() => {
    setAlreadyPaid(true);
    setPendingOrderId(null);
    onPaymentCaptured?.();
  }, [onPaymentCaptured]);

  const checkStorePaid = useCallback(async (): Promise<boolean> => {
    const res = await fetch(
      `${apiBase}/payment-status?storeInternalId=${encodeURIComponent(String(storeInternalId))}`,
      { credentials: "include" }
    );
    const data = await res.json();
    return Boolean(data.success && data.alreadyPaid);
  }, [apiBase, storeInternalId]);

  const checkOrderPaid = useCallback(
    async (oid: string): Promise<boolean> => {
      const res = await fetch(
        `${apiBase}/payment-status?orderId=${encodeURIComponent(oid)}`,
        { credentials: "include" }
      );
      const data = await res.json();
      return Boolean(data.success && data.alreadyPaid);
    },
    [apiBase]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCommissionLoading(true);
      try {
        const res = await fetch("/api/public/store-onboarding-commission-config", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && data.success && data.config) {
          setCommissionCfg(data.config as StoreOnboardingCommissionConfigDTO);
        }
      } finally {
        if (!cancelled) setCommissionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPaymentStatusLoading(true);
      try {
        const paid = await checkStorePaid();
        if (!cancelled && paid) setAlreadyPaid(true);
      } finally {
        if (!cancelled) setPaymentStatusLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checkStorePaid]);

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
      const captured = await checkOrderPaid(pendingOrderId);
      if (captured) {
        clearInterval(t);
        setPendingOrderId(null);
        markPaid();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [pendingOrderId, alreadyPaid, checkOrderPaid, markPaid]);

  const handlePayNow = useCallback(async () => {
    if (alreadyPaid || paying) return;
    if (!commissionCfg) {
      setPaymentError("Plan pricing is not loaded yet. Please wait or refresh.");
      return;
    }

    setPaying(true);
    setPaymentError("");
    try {
      const res = await fetch(`${apiBase}/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storeInternalId }),
      });
      const orderData = await res.json();

      if (orderData.success && orderData.alreadyPaid) {
        markPaid();
        return;
      }
      if (!orderData.success || !orderData.orderId || !orderData.keyId) {
        setPaymentError(orderData.error || "Could not create payment order.");
        return;
      }

      if (typeof orderData.storePublicId === "string" && orderData.storePublicId) {
        setResolvedStorePublicId(orderData.storePublicId);
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
        handler: async (res) => {
          setPaying(true);
          try {
            const verifyRes = await fetch(`${apiBase}/verify-payment`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                razorpay_order_id: res.razorpay_order_id,
                razorpay_payment_id: res.razorpay_payment_id,
                razorpay_signature: res.razorpay_signature,
              }),
            });
            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              setPendingOrderId(null);
              markPaid();
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
      });
      rzp.open();
    } catch {
      setPaymentError("Something went wrong. Please try again.");
      setPendingOrderId(null);
    } finally {
      setPaying(false);
    }
  }, [
    alreadyPaid,
    paying,
    commissionCfg,
    apiBase,
    storeInternalId,
    gstPct,
    promoRupee,
    gstRupeeDisplay,
    totalRupeeDisplay,
    standardRupee,
    discountPct,
    markPaid,
  ]);

  if (paymentStatusLoading || commissionLoading) {
    return (
      <div className="verification-typo w-full rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        <span className="verification-num">Loading payment details…</span>
      </div>
    );
  }

  if (alreadyPaid) {
    return (
      <div className="verification-typo w-full rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 flex items-start gap-3">
        <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-emerald-900">Payment completed</p>
          <p className="text-xs text-emerald-800 mt-1 verification-num">
            Onboarding fee received for <span className="font-mono">{displayStoreId}</span>. This step
            will advance automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="verification-typo w-full rounded-xl border border-emerald-100 bg-gradient-to-r from-emerald-50/40 via-white to-white p-4 sm:p-5">
      <div className="flex w-full flex-row items-center justify-between gap-4 sm:gap-6">
        <div className="min-w-0 flex-1 flex items-start gap-3">
          <div className="rounded-lg bg-emerald-600 p-2 text-white shrink-0">
            <Smartphone className="h-4 w-4" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <h3 className="text-sm sm:text-base font-semibold text-slate-900 leading-tight">
              Pay onboarding fee
            </h3>
            {commissionCfg ? (
              <p className="verification-num text-xs sm:text-sm font-medium text-emerald-800">
                ₹{totalRupeeDisplay}
                {gstPct > 0 ? ` (incl. ${gstPct}% GST)` : ""}
                {commissionCfg.planName ? ` · ${commissionCfg.planName}` : ""}
              </p>
            ) : null}
            <ul className="list-disc pl-4 space-y-0.5 text-[11px] sm:text-xs text-slate-600 leading-snug">
              <li>Pay here on merchant&apos;s behalf, or share the Partner Site link above.</li>
              <li>Opens secure Razorpay checkout — same as Partner Site.</li>
            </ul>
            {paymentError ? (
              <p className="verification-num text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">
                {paymentError}
              </p>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handlePayNow()}
          disabled={paying || !commissionCfg}
          className="verification-num shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 sm:px-6 py-2.5 sm:py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 shadow-sm whitespace-nowrap"
        >
          {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          <span className="max-w-[10rem] sm:max-w-none truncate sm:whitespace-normal text-left leading-tight">
            {payButtonLabel}
          </span>
          {!paying ? <ChevronRight className="h-4 w-4 shrink-0" /> : null}
        </button>
      </div>
    </div>
  );
}
