"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ImageIcon, Maximize2, X } from "lucide-react";
import { toast } from "sonner";
import type { CatalogPhotoMenuItem } from "@/lib/catalog-photo-helpers";
import { uploadPartnerMenuItemImage } from "@/lib/partnerMenuPhotoApi";
import {
  MENU_ITEM_IMAGE_MIN_SIDE,
  normalizeMenuItemImageFile,
  validateMenuItemImageFile,
} from "@/lib/menuItemImageValidationClient";

export type CatalogPhotoUploadCallbacks = {
  onStart?: (itemId: number, previewUrl: string) => void;
  onProgress?: (itemId: number, progress: number) => void;
  onSuccess?: (itemId: number, previewUrl: string, imageUrl: string) => void;
  onError?: (itemId: number) => void;
};

type Props = {
  open: boolean;
  item: (CatalogPhotoMenuItem & { item_name?: string }) | null;
  storeId: string | null;
  imageLimitReached?: boolean;
  onClose: () => void;
  onUploaded: () => void;
  uploadCallbacks?: CatalogPhotoUploadCallbacks;
};

type AutoFitPrompt = {
  file: File;
  message: string;
  previewUrl: string;
};

function isAutoFitFixableError(error: string): boolean {
  const e = error.toLowerCase();
  return (
    e.includes("minimum size") ||
    e.includes("maximum size") ||
    e.includes("must be square") ||
    e.includes("1:1")
  );
}

export function CatalogPhotoUploadOptionsModal({
  open,
  item,
  storeId,
  imageLimitReached = false,
  onClose,
  onUploaded,
  uploadCallbacks,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [autoFitPrompt, setAutoFitPrompt] = useState<AutoFitPrompt | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setAutoFitPrompt((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return null;
      });
    }
  }, [open]);

  const clearAutoFitPrompt = () => {
    setAutoFitPrompt((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  };

  const closeAll = () => {
    if (busy) return;
    clearAutoFitPrompt();
    onClose();
  };

  const uploadReadyFile = async (ready: File) => {
    if (!item || !storeId) return;
    const previewUrl = URL.createObjectURL(ready);
    uploadCallbacks?.onStart?.(item.id, previewUrl);
    clearAutoFitPrompt();
    onClose();

    const result = await uploadPartnerMenuItemImage(storeId, item.id, ready, (p) => {
      uploadCallbacks?.onProgress?.(item.id, p);
    });

    uploadCallbacks?.onSuccess?.(item.id, previewUrl, result.image_url);
    onUploaded();
    toast.success("Photo uploaded — pending review");
  };

  const handleFile = async (file: File | null | undefined) => {
    if (!file || !item || !storeId || busy) return;
    if (imageLimitReached) {
      toast.error("Image upload limit reached for your plan. Upgrade to add more.");
      return;
    }
    setBusy(true);
    try {
      const validation = await validateMenuItemImageFile(file);
      if (!validation.valid) {
        if (isAutoFitFixableError(validation.error)) {
          clearAutoFitPrompt();
          setAutoFitPrompt({
            file,
            message: validation.error,
            previewUrl: URL.createObjectURL(file),
          });
          return;
        }
        toast.error(validation.error);
        return;
      }

      const normalized = await normalizeMenuItemImageFile(file);
      if (!normalized.ok) {
        toast.error(normalized.error);
        return;
      }
      await uploadReadyFile(normalized.file);
    } catch (e) {
      if (item) uploadCallbacks?.onError?.(item.id);
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const handleAutoFit = async () => {
    if (!autoFitPrompt || !item || !storeId || busy) return;
    setBusy(true);
    try {
      const normalized = await normalizeMenuItemImageFile(autoFitPrompt.file);
      if (!normalized.ok) {
        toast.error(normalized.error);
        return;
      }
      await uploadReadyFile(normalized.file);
    } catch (e) {
      if (item) uploadCallbacks?.onError?.(item.id);
      toast.error(e instanceof Error ? e.message : "Auto fit failed");
    } finally {
      setBusy(false);
    }
  };

  if (!open || !item || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10002] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      onClick={closeAll}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">
            {autoFitPrompt ? "Auto fit photo" : "Choose an option"}
          </h2>
          <button
            type="button"
            onClick={closeAll}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <input
          ref={galleryRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            void handleFile(f);
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            void handleFile(f);
          }}
        />

        {autoFitPrompt ? (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50">
              <div className="flex items-center gap-3 p-3">
                <img
                  src={autoFitPrompt.previewUrl}
                  alt=""
                  className="h-16 w-16 rounded-lg border border-amber-100 bg-white object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-amber-950">Needs resize to upload</p>
                  <p className="mt-0.5 text-[12px] leading-snug text-amber-900/90">
                    {autoFitPrompt.message}
                  </p>
                  <p className="mt-1 text-[11px] text-amber-800/80">
                    Auto fit will crop to square and scale to {MENU_ITEM_IMAGE_MIN_SIDE}×
                    {MENU_ITEM_IMAGE_MIN_SIDE} px.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => void handleAutoFit()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {busy ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Maximize2 size={18} />
              )}
              Auto fit & upload
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => galleryRef.current?.click()}
              className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Choose another photo
            </button>

            <button
              type="button"
              onClick={closeAll}
              disabled={busy}
              className="w-full rounded-xl py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => cameraRef.current?.click()}
              className="mb-2 flex w-full items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-left hover:bg-gray-50 disabled:opacity-50"
            >
              <Camera size={22} className="text-gray-700" />
              <span className="text-sm font-semibold text-gray-800">Take photo</span>
              {busy ? (
                <span className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
              ) : null}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => galleryRef.current?.click()}
              className="mb-3 flex w-full items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-left hover:bg-gray-50 disabled:opacity-50"
            >
              <ImageIcon size={22} className="text-gray-700" />
              <span className="text-sm font-semibold text-gray-800">Upload from gallery</span>
            </button>

            <button
              type="button"
              onClick={closeAll}
              disabled={busy}
              className="w-full rounded-xl py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
