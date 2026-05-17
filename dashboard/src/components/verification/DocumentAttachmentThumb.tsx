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
}: {
  url: string;
  fileName?: string | null;
  label: string;
  onImagePreview?: () => void;
  className?: string;
}) {
  const resolved = resolveAttachmentProxyUrl(url);
  const [imgFailed, setImgFailed] = useState(false);
  const isPdf = isPdfAttachment(resolved, fileName);
  const hasFile = !!resolved.trim();

  if (!hasFile) {
    return (
      <div
        className={`flex h-32 w-full max-w-[8.5rem] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-gray-400 ${className}`}
      >
        <ImageIcon className="h-7 w-7 opacity-40" aria-hidden />
        <span className="mt-1 text-[10px] font-medium">No file</span>
      </div>
    );
  }

  if (isPdf) {
    return (
      <div
        className={`flex h-32 w-full max-w-[8.5rem] flex-col overflow-hidden rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 shadow-sm ${className}`}
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-indigo-100">
            <FileText className="h-6 w-6 text-indigo-500" aria-hidden />
          </div>
          <span className="text-[9px] font-semibold uppercase tracking-wide text-indigo-700">PDF document</span>
        </div>
        <a
          href={resolved}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 border-t border-indigo-100 bg-white/90 py-2 text-[10px] font-semibold text-indigo-700 transition hover:bg-indigo-50"
        >
          <ExternalLink className="h-3 w-3" aria-hidden />
          Preview in new tab
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
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-gray-500">
          <ImageIcon className="h-7 w-7 text-gray-400" />
          <span className="text-[9px] text-center leading-tight">Could not load</span>
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
