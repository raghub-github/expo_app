"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Star, X } from "lucide-react";
import type { OrderCustomerFeedback } from "@/lib/orders/order-customer-feedback";
import { formatTipInr } from "@/lib/orders/order-customer-feedback";

export type FeedbackSheetTarget = "merchant" | "rider";

function Stars({ value }: { value: number }) {
  const n = Math.max(1, Math.min(5, Math.round(value)));
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-5 w-5 ${i <= n ? "fill-amber-400 text-amber-400" : "text-slate-200"}`}
          aria-hidden
        />
      ))}
      <span className="ml-1 text-sm font-semibold text-slate-800">{n}/5</span>
    </div>
  );
}

function formatRatedAt(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function FeedbackTags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function CustomerFeedbackBody({
  tags,
  reviewText,
}: {
  tags: string[];
  reviewText: string | null;
}) {
  const hasTags = tags.length > 0;
  const hasText = !!reviewText?.trim();

  if (!hasTags && !hasText) {
    return <p className="text-slate-500 italic">No feedback provided</p>;
  }

  return (
    <div className="space-y-2">
      {hasTags ? <FeedbackTags tags={tags} /> : null}
      {hasText ? (
        <p className="rounded-lg border border-slate-200 bg-white p-3 leading-relaxed whitespace-pre-wrap">
          {reviewText}
        </p>
      ) : null}
    </div>
  );
}

export function OrderCustomerFeedbackSideSheet({
  target,
  feedback,
  tipAmount,
  merchantName,
  riderName,
  onClose,
}: {
  target: FeedbackSheetTarget;
  feedback: OrderCustomerFeedback;
  tipAmount?: number | null;
  merchantName?: string | null;
  riderName?: string | null;
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

  const isMerchant = target === "merchant";
  const title = isMerchant ? "Restaurant feedback" : "Delivery partner feedback";
  const subtitle = isMerchant
    ? merchantName?.trim() || "Merchant"
    : riderName?.trim() || "Delivery partner";
  const accent = isMerchant ? "from-cyan-600 to-teal-600" : "from-sky-600 to-blue-600";
  const tipLabel = formatTipInr(tipAmount ?? null);

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex justify-end bg-slate-900/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl animate-[slideInRight_0.28s_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={`relative shrink-0 bg-gradient-to-br ${accent} px-5 py-4 text-white`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/80">
                Customer rating
              </p>
              <h2 className="text-base font-bold truncate">{title}</h2>
              <p className="text-xs text-white/90 mt-0.5 truncate">{subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 hover:bg-white/15 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-[13px] text-slate-800">
          {feedback.customerName ? (
            <div>
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                Rated by
              </p>
              <p className="font-semibold text-slate-900 mt-0.5">{feedback.customerName}</p>
            </div>
          ) : null}

          <div>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
              Rated on
            </p>
            <p className="mt-0.5">{formatRatedAt(feedback.ratedAtIso)}</p>
          </div>

          {isMerchant ? (
            <>
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-3">
                <div>
                  <p className="text-[11px] font-medium text-slate-500 mb-1">Overall rating</p>
                  {feedback.storeRating != null ? (
                    <Stars value={feedback.storeRating} />
                  ) : (
                    <span>—</span>
                  )}
                </div>
                {feedback.foodRating != null && feedback.foodRating !== feedback.storeRating ? (
                  <div>
                    <p className="text-[11px] font-medium text-slate-500 mb-1">Food quality</p>
                    <Stars value={feedback.foodRating} />
                  </div>
                ) : null}
                {feedback.packagingRating != null ? (
                  <div>
                    <p className="text-[11px] font-medium text-slate-500 mb-1">Packaging</p>
                    <Stars value={feedback.packagingRating} />
                  </div>
                ) : null}
              </div>

              <div>
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1.5">
                  Customer feedback
                </p>
                <CustomerFeedbackBody
                  tags={feedback.storeReviewTags}
                  reviewText={feedback.storeReviewText}
                />
              </div>
            </>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                <p className="text-[11px] font-medium text-slate-500 mb-1">Delivery rating</p>
                {feedback.deliveryRating != null ? (
                  <Stars value={feedback.deliveryRating} />
                ) : (
                  <span>—</span>
                )}
              </div>

              {tipLabel ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3">
                  <p className="text-[11px] font-medium text-emerald-700 uppercase tracking-wide">
                    Tip received
                  </p>
                  <p className="text-lg font-bold text-emerald-800 mt-1">{tipLabel}</p>
                </div>
              ) : null}

              <div>
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1.5">
                  Customer feedback
                </p>
                <CustomerFeedbackBody
                  tags={feedback.riderReviewTags}
                  reviewText={feedback.riderReviewText}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
