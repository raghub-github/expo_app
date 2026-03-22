"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";
import type { PartnerVerificationStepRejection } from "@/lib/onboarding/partner-verification-rejections";

type Props = {
  rejections: PartnerVerificationStepRejection[] | undefined | null;
  /** Single row of pills — tight spaces; tap opens same detail modal. */
  variant?: "inline" | "panel";
  className?: string;
  /** When true (inline only), omit the "Updates sent" chip — e.g. parent shows "Resubmitted" elsewhere. */
  hideInlineResubmittedChip?: boolean;
};

function formatRejectedAt(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

/**
 * Partner-facing notice when GatiMitra rejected one or more onboarding steps.
 * Panel: compact row + chevron; opens modal (close only via ✕, not backdrop).
 */
export function StoreVerificationRejectionsBadge({
  rejections,
  variant = "panel",
  className = "",
  hideInlineResubmittedChip = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const list = rejections?.length ? rejections : null;
  if (!list?.length) return null;

  const anyResubmitted = list.some((r) => r.merchant_resubmitted_at);

  const stepSummary = list
    .map((r) => r.step_label?.trim() || `Step ${r.step_number}`)
    .join(" · ");

  const openModal = () => setOpen(true);
  const closeModal = () => setOpen(false);

  const modal =
    open &&
    mounted &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rejection-detail-title"
      >
        {/* Backdrop: visual only — does not close modal */}
        <div className="absolute inset-0 bg-black/45" aria-hidden />

        <div
          className="relative z-10 flex max-h-[min(85vh,560px)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="min-w-0">
              <h2 id="rejection-detail-title" className="text-base font-semibold text-slate-900">
                Verification feedback
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                What our team flagged and why — update these in onboarding, then use Review & fix.
              </p>
            </div>
            <button
              type="button"
              onClick={closeModal}
              className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {list.map((r) => {
              const what = r.step_label?.trim() || `Step ${r.step_number}`;
              return (
                <div
                  key={`${r.step_number}-${r.rejected_at}`}
                  className="rounded-lg border border-red-100 bg-red-50/50 px-3 py-2.5"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-red-800">
                    What was rejected
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-slate-900">{what}</p>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-red-800">
                    Why it was rejected
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
                    {r.rejection_reason || "—"}
                  </p>
                  <p className="mt-2 text-[10px] text-slate-500">
                    Noted on {formatRejectedAt(r.rejected_at)}
                  </p>
                </div>
              );
            })}
            {anyResubmitted && (
              <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                You already submitted updates for some items — our team will review again.
              </p>
            )}
          </div>
        </div>
      </div>,
      document.body
    );

  if (variant === "inline") {
    return (
      <>
        <button
          type="button"
          onClick={openModal}
          className={`inline-flex max-w-full flex-wrap items-center gap-1 ${className}`}
        >
          <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
            Step rejected
            <ChevronDown className="h-3 w-3 opacity-80" aria-hidden />
          </span>
          {anyResubmitted && !hideInlineResubmittedChip && (
            <span className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900">
              Updates sent
            </span>
          )}
        </button>
        {modal}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={`flex w-full max-w-full items-center gap-2 rounded-md border border-red-200/90 bg-red-50/95 px-2 py-1 text-left shadow-sm transition hover:border-red-300 hover:bg-red-100/90 ${className}`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase leading-tight tracking-wide text-red-800">
            Steps need correction
          </p>
          <p className="truncate text-[11px] font-medium leading-tight text-red-950">{stepSummary}</p>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-red-700" aria-hidden />
      </button>
      {modal}
    </>
  );
}
