"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FileText, X } from "lucide-react";
import { ModalPortal } from "@/components/ui/ModalPortal";

type Props = {
  title: string;
  status: "verified" | "pending" | "rejected" | "skipped" | "missing" | "not_required";
  statusLabel: string;
  maskedNumber?: string | null;
  /** When false, hide the document-number row (e.g. selfie / profile photo). Default true. */
  showDocumentNumber?: boolean;
  subtitle?: string | null;
  /** Real uploaded image URL — shows a small rectangular thumb at bottom-right. */
  previewImageUrl?: string | null;
  /** When true, show a PDF chip thumb instead of an <img>. */
  previewIsPdf?: boolean;
  onClick: () => void;
  /** Opens full-size image/PDF modal (thumb click). Falls back to onClick when omitted. */
  onPreviewClick?: () => void;
  /** Extra footer content (e.g. PAN skip). Prefer placing outside the card for equal heights. */
  footer?: ReactNode;
};

const STATUS_STYLES: Record<
  Props["status"],
  { badge: string; card: string }
> = {
  verified: {
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200/80",
    card: "border-slate-200/90 hover:border-slate-300",
  },
  pending: {
    badge: "bg-rose-50 text-rose-800 ring-rose-300/80",
    card: "border-rose-500 border-2 shadow-[0_0_0_1px_rgba(244,63,94,0.15)] hover:border-rose-600",
  },
  rejected: {
    badge: "bg-rose-50 text-rose-700 ring-rose-200/80",
    card: "border-rose-300/90 hover:border-rose-400",
  },
  skipped: {
    badge: "bg-sky-50 text-sky-800 ring-sky-200/80",
    card: "border-slate-200/90 hover:border-slate-300",
  },
  missing: {
    badge: "bg-slate-50 text-slate-600 ring-slate-200/80",
    card: "border-slate-200/90 hover:border-slate-300",
  },
  not_required: {
    badge: "bg-slate-50 text-slate-500 ring-slate-200/60",
    card: "border-slate-200/70 opacity-90 hover:border-slate-300",
  },
};

export function maskDocNumberForBlock(raw: string | null | undefined, kind?: string): string {
  const value = String(raw || "").replace(/\s+/g, "").trim();
  if (!value || value === "?" || value === "N/A") return "—";
  if (kind === "aadhaar" || /^\d{12}$/.test(value.replace(/X/gi, "0"))) {
    const digits = value.replace(/\D/g, "");
    if (digits.length >= 4) return `XXXX-XXXX-${digits.slice(-4)}`;
  }
  if (kind === "pan" || /^[A-Z0-9]{10}$/i.test(value)) {
    return `${"X".repeat(Math.max(0, value.length - 5))}${value.slice(-5)}`.toUpperCase();
  }
  if (value.length <= 4) return value;
  return `${"•".repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
}

export function DocumentSummaryBlock({
  title,
  status,
  statusLabel,
  maskedNumber,
  showDocumentNumber = true,
  subtitle,
  previewImageUrl,
  previewIsPdf = false,
  onClick,
  onPreviewClick,
  footer,
}: Props) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.missing;
  const thumb = String(previewImageUrl || "").trim();
  const [thumbBroken, setThumbBroken] = useState(false);
  const showPdfThumb = Boolean(thumb) && previewIsPdf;
  const showImageThumb = Boolean(thumb) && !previewIsPdf && !thumbBroken;

  useEffect(() => {
    setThumbBroken(false);
  }, [thumb, previewIsPdf]);

  return (
    <div
      className={`flex h-full min-h-0 cursor-pointer flex-col overflow-hidden rounded-xl border bg-white transition hover:shadow-sm ${style.card}`}
    >
      <div className="flex min-h-0 flex-1 flex-col p-3.5">
        <button
          type="button"
          onClick={onClick}
          className="flex min-h-0 w-full flex-1 cursor-pointer flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0A2342]/25"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-[#0A2342]">{title}</h3>
              {subtitle ? (
                <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{subtitle}</p>
              ) : null}
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${style.badge}`}
            >
              {statusLabel}
            </span>
          </div>

          {showDocumentNumber ? (
            <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-2.5 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Document number
              </p>
              <p className="mt-0.5 truncate font-mono text-[13px] font-semibold tracking-wide text-slate-900">
                {maskedNumber || "—"}
              </p>
            </div>
          ) : (
            <div className="mt-3 flex-1" />
          )}
        </button>

        <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
          <button
            type="button"
            onClick={onClick}
            className="cursor-pointer text-[11px] font-semibold text-[#0A2342]/65 hover:text-[#0A2342] focus:outline-none focus-visible:underline"
          >
            View details →
          </button>
          {showPdfThumb ? (
            <button
              type="button"
              aria-label={`View ${title} PDF`}
              title="View PDF"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (onPreviewClick ?? onClick)();
              }}
              className="group relative flex h-12 w-[4.25rem] shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md border border-rose-200 bg-rose-50 shadow-sm ring-1 ring-rose-900/5 transition hover:ring-rose-400/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50"
            >
              <FileText className="h-5 w-5 text-rose-600" />
              <span className="text-[9px] font-bold uppercase tracking-wide text-rose-700">PDF</span>
            </button>
          ) : showImageThumb ? (
            <button
              type="button"
              aria-label={`View full ${title} image`}
              title="View full image"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (onPreviewClick ?? onClick)();
              }}
              className="group relative h-12 w-[4.25rem] shrink-0 cursor-pointer overflow-hidden rounded-md border border-slate-200 bg-slate-100 shadow-sm ring-1 ring-slate-900/5 transition hover:ring-[#0A2342]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0A2342]/30"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumb}
                alt=""
                className="h-full w-full object-cover object-center transition group-hover:scale-[1.03]"
                onError={() => setThumbBroken(true)}
              />
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 to-transparent opacity-0 transition group-hover:opacity-100" />
            </button>
          ) : null}
        </div>
      </div>
      {footer ? (
        <div className="border-t border-dashed border-slate-200 px-3 py-2.5">{footer}</div>
      ) : null}
    </div>
  );
}

function statusTone(statusLabel?: string | null): {
  chip: string;
  bar: string;
} {
  const s = String(statusLabel || "").toLowerCase();
  if (s.includes("verified") || s === "skipped") {
    return {
      chip: "bg-emerald-50 text-emerald-800 ring-emerald-200",
      bar: "bg-emerald-500",
    };
  }
  if (s.includes("reject")) {
    return {
      chip: "bg-rose-50 text-rose-800 ring-rose-200",
      bar: "bg-rose-500",
    };
  }
  return {
    chip: "bg-amber-50 text-amber-900 ring-amber-200",
    bar: "bg-slate-400",
  };
}

/** Compact document detail drawer — medium or wide for dense auto-verify fields. */
export function DocumentDetailModalShell({
  open,
  title,
  statusLabel,
  onClose,
  children,
  size = "default",
}: {
  open: boolean;
  title: string;
  statusLabel?: string | null;
  onClose: () => void;
  children: React.ReactNode;
  /** `wide` for DL / RC / Aadhaar detail grids. */
  size?: "default" | "wide";
}) {
  if (!open) return null;
  const tone = statusTone(statusLabel);
  const widthClass = size === "wide" ? "max-w-5xl" : "max-w-2xl";

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4">
        <button
          type="button"
          className="absolute inset-0 cursor-pointer bg-slate-900/35 backdrop-blur-md"
          aria-label="Close"
          onClick={onClose}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={`relative z-[121] flex max-h-[88vh] w-full ${widthClass} flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl`}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                Document detail
              </p>
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="min-w-0 truncate text-lg font-semibold text-[#0A2342]">{title}</h2>
                {statusLabel ? (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${tone.chip}`}
                  >
                    {statusLabel}
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-3 sm:px-5 sm:py-4">
            {children}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

export function useDocumentDetailModal() {
  const [docType, setDocType] = useState<string | null>(null);
  return useMemo(
    () => ({
      docType,
      open: (next: string) => setDocType(next),
      close: () => setDocType(null),
      isOpen: Boolean(docType),
    }),
    [docType],
  );
}
