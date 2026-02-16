"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i;

export function isImageUrl(url: string): boolean {
  if (!url || url === "#") return false;
  try {
    const path = new URL(url, "http://dummy").pathname;
    return IMAGE_EXT.test(path);
  } catch {
    return IMAGE_EXT.test(url);
  }
}

interface AttachmentModalProps {
  url: string;
  name: string;
  onClose: () => void;
}

export function AttachmentModal({ url, name, onClose }: AttachmentModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const showImage = isImageUrl(url);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Attachment preview"
    >
      <div
        className="relative max-h-[90vh] max-w-[90vw] rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute -right-2 -top-2 z-10 rounded-full bg-gray-800 p-1.5 text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-white"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
        {showImage ? (
          <img
            src={url}
            alt={name}
            className="max-h-[90vh] max-w-full rounded-lg object-contain"
          />
        ) : (
          <div className="p-6 text-center">
            <p className="mb-4 text-sm text-gray-600">{name}</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Open in new tab
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
