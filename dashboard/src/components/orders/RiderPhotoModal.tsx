"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";

export type RiderPhotoModalProps = {
  open: boolean;
  imageUrl: string | null;
  riderName?: string | null;
  onClose: () => void;
};

export function RiderPhotoModal({
  open,
  imageUrl,
  riderName,
  onClose,
}: RiderPhotoModalProps) {
  const [imgError, setImgError] = useState(false);

  const resolvedImageUrl = useMemo(() => {
    const raw = imageUrl?.trim() || "";
    if (!raw) return "";

    if (
      raw.startsWith("http://") ||
      raw.startsWith("https://") ||
      raw.startsWith("data:") ||
      raw.startsWith("blob:")
    ) {
      return raw;
    }

    const proxied = resolveAttachmentProxyUrl(raw);
    if (!proxied) return "";
    if (typeof window !== "undefined" && proxied.startsWith("/")) {
      return `${window.location.origin}${proxied}`;
    }
    return proxied;
  }, [imageUrl]);

  useEffect(() => {
    if (!open) return;
    setImgError(false);
  }, [open, resolvedImageUrl]);

  if (!open || !resolvedImageUrl || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2600] flex items-center justify-center p-4"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-sm"
        aria-hidden
      />
      <div
        className="relative max-h-[92vh] max-w-lg w-full"
        role="dialog"
        aria-modal="true"
        aria-label={riderName ? `Photo of ${riderName}` : "Rider photo"}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-2 -right-2 z-10 rounded-full bg-white p-2 shadow-lg hover:bg-gray-50"
          aria-label="Close"
        >
          <X className="h-5 w-5 text-gray-700" />
        </button>
        {riderName ? (
          <p className="mb-2 text-center text-sm font-semibold text-white drop-shadow">
            {riderName}
          </p>
        ) : null}
        {imgError ? (
          <div className="flex min-h-[200px] items-center justify-center rounded-2xl bg-slate-900 px-6 py-10 text-center text-sm text-slate-300 ring-2 ring-white/20">
            Could not load image. Try refreshing the page.
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={resolvedImageUrl}
            alt={riderName ?? "Rider"}
            className="max-h-[85vh] w-full rounded-2xl object-contain bg-black shadow-2xl ring-2 ring-white/20"
            onError={() => setImgError(true)}
          />
        )}
      </div>
    </div>,
    document.body
  );
}
