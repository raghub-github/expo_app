"use client";

import { createPortal } from "react-dom";
import { Camera, X } from "lucide-react";
import { R2Image } from "@/components/ui/R2Image";
import { ITEM_PLACEHOLDER_SVG } from "./menu-types";

export function MenuItemPhotoModal({
  open,
  itemName,
  imageUrl,
  onClose,
  onReplace,
}: {
  open: boolean;
  itemName: string;
  imageUrl?: string | null;
  onClose: () => void;
  onReplace?: () => void;
}) {
  if (!open || typeof document === "undefined") return null;

  const hasPhoto = Boolean(imageUrl?.trim());

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="menu-item-photo-title"
    >
      <div
        className="flex max-h-[min(560px,90vh)] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-2.5">
          <h2 id="menu-item-photo-title" className="text-base font-bold text-gray-900">
            Photo
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-3">
          {hasPhoto ? (
            <div className="relative h-52 overflow-hidden rounded-xl border border-gray-200 bg-gray-100 sm:h-64">
              <R2Image
                src={imageUrl}
                alt={itemName}
                className="h-full w-full object-contain"
                fallbackSrc={ITEM_PLACEHOLDER_SVG}
              />
            </div>
          ) : (
            <div className="flex h-40 flex-col items-center justify-center rounded-xl bg-gray-50 text-gray-500">
              <Camera size={36} className="mb-2 opacity-50" />
              <p className="text-sm">No photo uploaded yet</p>
            </div>
          )}

          <p className="shrink-0 text-sm text-gray-600">
            Item name: <span className="font-semibold text-gray-900">{itemName}</span>
          </p>

          {onReplace ? (
            <button
              type="button"
              onClick={onReplace}
              className="shrink-0 w-full rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white hover:bg-orange-600"
            >
              {hasPhoto ? "Replace photo" : "Add photo"}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
