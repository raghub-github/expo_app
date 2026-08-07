"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { R2Image } from "@/components/ui/R2Image";

type Props = {
  open: boolean;
  imageSrc: string | null;
  customerName: string;
  onClose: () => void;
};

export function CustomerProfilePhotoModal({ open, imageSrc, customerName, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !imageSrc) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={`${customerName} profile photo`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
          aria-label="Close"
        >
          <X className="size-5" aria-hidden />
        </button>
        <p className="mb-4 pr-10 text-lg font-semibold text-gray-900">{customerName}</p>
        <div className="mx-auto aspect-square w-full max-w-[min(100%,320px)] overflow-hidden rounded-full ring-4 ring-teal-100">
          <R2Image
            src={imageSrc}
            alt={`${customerName} profile`}
            className="size-full object-cover"
          />
        </div>
      </div>
    </div>
  );
}
