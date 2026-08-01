"use client";

import { useState } from "react";
import { ExternalLink, FileText, ImageIcon } from "lucide-react";
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
}: {
  url: string;
  fileName?: string | null;
  label: string;
  onImagePreview?: () => void;
  className?: string;
  emptyMessage?: string;
}) {
  const resolved = resolveAttachmentProxyUrl(url);
  const [imgFailed, setImgFailed] = useState(false);
  const [treatAsPdf, setTreatAsPdf] = useState(false);
  const isPdf = treatAsPdf || isPdfAttachment(resolved, fileName);
  const hasFile = !!resolved.trim();

  if (!hasFile) {
    const isNoImageNeeded = /no images? needed/i.test(emptyMessage);
    return (
      <div
        className={`flex h-32 w-full max-w-[8.5rem] flex-col items-center justify-center rounded-xl border border-dashed px-2 text-center ${
          isNoImageNeeded
            ? "border-emerald-200 bg-emerald-50/70 text-emerald-800"
            : "border-gray-300 bg-gray-50 text-gray-400"
        } ${className}`}
      >
        {isNoImageNeeded ? (
          <FileText className="h-7 w-7 opacity-50" aria-hidden />
        ) : (
          <ImageIcon className="h-7 w-7 opacity-40" aria-hidden />
        )}
        <span className="mt-1 text-[10px] font-medium leading-snug">{emptyMessage}</span>
      </div>
    );
  }

  if (isPdf) {
    return (
      <div
        className={`flex h-32 w-full max-w-[8.5rem] flex-col overflow-hidden rounded-xl border border-indigo-100 bg-white shadow-sm ${className}`}
      >
        <a
          href={resolved}
          target="_blank"
          rel="noopener noreferrer"
          className="relative flex min-h-0 flex-1 overflow-hidden bg-slate-100"
          title="Open PDF preview"
        >
          {/* Browser-native first-page preview when supported */}
          <object
            data={`${resolved}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
            type="application/pdf"
            className="pointer-events-none h-full w-full scale-[1.15] origin-top"
            aria-label={`${label} PDF preview`}
          >
            <div className="flex h-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-indigo-50 to-violet-50 p-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-indigo-100">
                <FileText className="h-5 w-5 text-indigo-500" aria-hidden />
              </div>
              <span className="text-[9px] font-semibold uppercase tracking-wide text-indigo-700">
                PDF
              </span>
            </div>
          </object>
        </a>
        <a
          href={resolved}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 border-t border-indigo-100 bg-white py-2 text-[10px] font-semibold text-indigo-700 transition hover:bg-indigo-50"
        >
          <ExternalLink className="h-3 w-3" aria-hidden />
          Open in new tab
        </a>
      </div>
    );
  }

  const thumb = (
    <>
      {!imgFailed ? (
        <img
          src={resolved}
          alt={label}
          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          onError={() => {
            // Proxy keys sometimes omit a clear extension in the path; fall back to PDF card.
            if (/\.pdf/i.test(resolved) || /\.pdf/i.test(fileName || "")) {
              setTreatAsPdf(true);
              return;
            }
            // Detect PDF by response Content-Type when extension is missing from the key.
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
          <span className="text-[9px] text-center leading-tight font-medium text-indigo-700">
            Document file
          </span>
          <a
            href={resolved}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] font-semibold text-indigo-600 underline-offset-2 hover:underline"
          >
            Open file
          </a>
        </div>
      )}
    </>
  );

  return (
    <div className={`flex w-full max-w-[8.5rem] flex-col gap-1.5 ${className}`}>
      {onImagePreview ? (
        <button
          type="button"
          onClick={onImagePreview}
          className="group relative h-32 w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-100 shadow-inner ring-1 ring-gray-100"
          title="Tap to preview"
        >
          {thumb}
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent py-2 text-center text-[9px] font-medium text-white opacity-0 transition group-hover:opacity-100">
            View full size
          </span>
        </button>
      ) : (
        <div className="relative h-32 w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-100 shadow-inner">
          {thumb}
        </div>
      )}
      <a
        href={resolved}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white py-1.5 text-[10px] font-medium text-gray-700 shadow-sm hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-800"
      >
        <ExternalLink className="h-3 w-3" aria-hidden />
        Open in new tab
      </a>
    </div>
  );
}
