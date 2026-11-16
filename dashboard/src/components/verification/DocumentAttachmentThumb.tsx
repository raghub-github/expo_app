"use client";

import { useState } from "react";
import { Eye, ExternalLink, FileText, ImageIcon } from "lucide-react";
import {
  isPdfAttachment,
  resolveAttachmentProxyUrl,
} from "@/lib/attachments/resolve-attachment-proxy-url";

export function DocumentAttachmentThumb({
  url,
  fileName,
  label,
  onImagePreview,
  className = "",
  /** Shown when there is no file (e.g. Cashfree auto-verify without upload). */
  emptyMessage = "No file",
  /** Larger media panel for redesigned document cards. */
  size = "default",
}: {
  url: string;
  fileName?: string | null;
  label: string;
  onImagePreview?: () => void;
  className?: string;
  emptyMessage?: string;
  size?: "default" | "lg" | "panel";
}) {
  const resolved = resolveAttachmentProxyUrl(url);
  const [imgFailed, setImgFailed] = useState(false);
  const [treatAsPdf, setTreatAsPdf] = useState(false);
  const isPdf = treatAsPdf || isPdfAttachment(resolved, fileName);
  const hasFile = !!resolved.trim();
  const isPanel = size === "panel";
  const isLg = size === "lg" || isPanel;
  const frameCls = isPanel
    ? "h-52 w-full sm:h-56"
    : isLg
      ? "h-44 w-full max-w-[12.5rem] sm:h-48 sm:max-w-[14rem]"
      : "h-32 w-full max-w-[8.5rem]";

  if (!hasFile) {
    const isNoImageNeeded = /no images? needed/i.test(emptyMessage);
    return (
      <div
        className={`flex ${frameCls} flex-col items-center justify-center rounded-2xl border border-dashed px-3 text-center ${
          isNoImageNeeded
            ? "border-emerald-200 bg-gradient-to-b from-emerald-50 to-white text-emerald-800"
            : "border-slate-300 bg-gradient-to-b from-slate-50 to-white text-slate-400"
        } ${className}`}
      >
        {isNoImageNeeded ? (
          <FileText className="h-8 w-8 opacity-45" aria-hidden />
        ) : (
          <ImageIcon className="h-8 w-8 opacity-35" aria-hidden />
        )}
        <span className="mt-1.5 text-[11px] font-semibold leading-snug">{emptyMessage}</span>
        {isNoImageNeeded ? (
          <span className="mt-0.5 text-[10px] text-emerald-700/80">Auto-verified without scan</span>
        ) : null}
      </div>
    );
  }

  if (isPdf) {
    return (
      <div
        className={`flex ${frameCls} flex-col overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${className}`}
      >
        <a
          href={resolved}
          target="_blank"
          rel="noopener noreferrer"
          className="relative flex min-h-0 flex-1 overflow-hidden bg-slate-100"
          title="Open PDF"
        >
          <object
            data={`${resolved}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
            type="application/pdf"
            className="pointer-events-none h-full w-full origin-top scale-[1.15]"
            aria-label={`${label} PDF preview`}
          >
            <div className="flex h-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-indigo-50 to-violet-50 p-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-indigo-100">
                <FileText className="h-5 w-5 text-indigo-500" aria-hidden />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700">PDF</span>
            </div>
          </object>
        </a>
        <a
          href={resolved}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 border-t border-indigo-100 bg-white py-2 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-50"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          Open PDF
        </a>
      </div>
    );
  }

  const thumb = (
    <>
      {!imgFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolved}
          alt={label}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          onError={() => {
            if (/\.pdf/i.test(resolved) || /\.pdf/i.test(fileName || "")) {
              setTreatAsPdf(true);
              return;
            }
            void fetch(resolved, { method: "HEAD" })
              .then((res) => {
                const ct = (res.headers.get("content-type") || "").toLowerCase();
                if (ct.includes("pdf")) {
                  setTreatAsPdf(true);
                  return;
                }
                setImgFailed(true);
              })
              .catch(() => setImgFailed(true));
          }}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-gray-500">
          <FileText className="h-7 w-7 text-indigo-400" />
          <span className="text-center text-[10px] font-medium leading-tight text-indigo-700">
            Document file
          </span>
          <a
            href={resolved}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-semibold text-indigo-600 underline-offset-2 hover:underline"
          >
            Open file
          </a>
        </div>
      )}
    </>
  );

  const wrapCls = isPanel
    ? "w-full"
    : isLg
      ? "w-full max-w-[14rem]"
      : "w-full max-w-[8.5rem]";
  const mediaH = isPanel ? "h-52 sm:h-56" : isLg ? "h-44 sm:h-48" : "h-32";

  return (
    <div className={`flex ${wrapCls} flex-col gap-1.5 ${className}`}>
      {onImagePreview ? (
        <button
          type="button"
          onClick={onImagePreview}
          className={`group relative ${mediaH} w-full cursor-zoom-in overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-100 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-100`}
          title="Open preview"
        >
          {thumb}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/10 opacity-90" />
          <span className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-slate-700 opacity-0 shadow-sm transition group-hover:opacity-100">
            <Eye className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="absolute inset-x-0 bottom-0 px-2.5 py-2 text-left text-[11px] font-semibold text-white">
            Click to preview
          </span>
        </button>
      ) : (
        <div
          className={`relative ${mediaH} w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100`}
        >
          {thumb}
        </div>
      )}
      {!isPanel && (
        <a
          href={resolved}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-800"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          Open in new tab
        </a>
      )}
    </div>
  );
}
