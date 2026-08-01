"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { ShieldCheck, X } from "lucide-react";
import { VerificationPageSkeleton } from "@/app/dashboard/merchants/verifications/VerificationPageSkeleton";

const StoreVerificationInner = dynamic(
  () =>
    import("@/app/dashboard/merchants/verifications/StoreVerificationInner").then((m) => ({
      default: m.StoreVerificationInner,
    })),
  { ssr: false, loading: () => <VerificationPageSkeleton /> }
);

const VERIFICATION_STEP_LABELS: Record<number, string> = {
  1: "Restaurant info",
  2: "Location",
  3: "Menu",
  4: "Restaurant documents",
  5: "Operational details",
  6: "Bank account",
  7: "Commission",
  8: "Sign & submit",
};

export function StoreVerificationSideSheet({
  storeId,
  initialStep,
  canPerformVerify,
  onClose,
}: {
  storeId: string;
  initialStep: number | null;
  canPerformVerify: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const stepLabel =
    initialStep != null ? VERIFICATION_STEP_LABELS[initialStep] ?? `Step ${initialStep}` : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex justify-end bg-slate-900/50 backdrop-blur-[2px] animate-[fadeIn_0.2s_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-label="Store verification"
      onClick={onClose}
    >
      <VerificationSheetPanel
        storeId={storeId}
        initialStep={initialStep}
        stepLabel={stepLabel}
        canPerformVerify={canPerformVerify}
        onClose={onClose}
      />
    </div>,
    document.body
  );
}

function VerificationSheetPanel({
  storeId,
  initialStep,
  stepLabel,
  canPerformVerify,
  onClose,
}: {
  storeId: string;
  initialStep: number | null;
  stepLabel: string | null;
  canPerformVerify: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="flex h-full w-full max-w-4xl flex-col border-l border-indigo-200/40 bg-white shadow-2xl animate-[slideInRight_0.28s_cubic-bezier(0.16,1,0.3,1)]"
      onClick={(e) => e.stopPropagation()}
    >
      <header className="relative shrink-0 overflow-hidden border-b border-indigo-200/30 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 px-5 py-4 text-white">
        <div
          className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-12 left-1/3 h-28 w-28 rounded-full bg-fuchsia-400/20 blur-2xl"
          aria-hidden
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-white/20">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                Verification
              </span>
              {canPerformVerify ? (
                <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-medium text-emerald-100 ring-1 ring-emerald-300/30">
                  Admin actions enabled
                </span>
              ) : (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-indigo-100 ring-1 ring-white/15">
                  View only
                </span>
              )}
            </div>
            <h2 className="mt-2 truncate text-base font-semibold tracking-tight">
              Store verification
            </h2>
            {stepLabel != null && initialStep != null ? (
              <p className="mt-1 text-xs text-indigo-100/90">
                <span className="font-semibold text-white">Step {initialStep}</span>
                <span className="mx-1.5 text-indigo-200/60">·</span>
                {stepLabel}
              </p>
            ) : (
              <p className="mt-1 text-xs text-indigo-100/80">
                Review onboarding steps and approve or reject documents.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg bg-white/10 p-2 text-white/90 ring-1 ring-white/20 transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
            aria-label="Close verification panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="verification-typo min-h-0 flex-1 overflow-y-auto bg-slate-50/90 p-4 sm:p-5">
        <StoreVerificationInner
          key={`${storeId}-${initialStep ?? "all"}`}
          storeId={storeId}
          returnTo={null}
          embedded
          initialStep={initialStep}
          onClose={onClose}
          canPerformVerify={canPerformVerify}
        />
      </div>
    </div>
  );
}


