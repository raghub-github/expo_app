"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ImageIcon, X } from "lucide-react";
import { toast } from "sonner";
import type { CatalogPhotoMenuItem } from "@/lib/catalog-photo-helpers";
import { uploadPartnerMenuItemImage } from "@/lib/partnerMenuPhotoApi";
import {
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

async function pickAndValidateFile(file: File): Promise<File | null> {
  const validation = await validateMenuItemImageFile(file);
  if (!validation.valid) {
    toast.error(validation.error);
    return null;
  }
  const normalized = await normalizeMenuItemImageFile(file);
  if (!normalized.ok) {
    toast.error(normalized.error);
    return null;
  }
  return normalized.file;
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
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  const handleFile = async (file: File | null | undefined) => {
    if (!file || !item || !storeId || busy) return;
    if (imageLimitReached) {
      toast.error("Image upload limit reached for your plan. Upgrade to add more.");
      return;
    }
    setBusy(true);
    try {
      const ready = await pickAndValidateFile(file);
      if (!ready) return;

      const previewUrl = URL.createObjectURL(ready);
      uploadCallbacks?.onStart?.(item.id, previewUrl);
      onClose();

      const result = await uploadPartnerMenuItemImage(storeId, item.id, ready, (p) => {
        uploadCallbacks?.onProgress?.(item.id, p);
      });

      uploadCallbacks?.onSuccess?.(item.id, previewUrl, result.image_url);
      onUploaded();
      toast.success("Photo uploaded — pending review");
    } catch (e) {
      if (item) uploadCallbacks?.onError?.(item.id);
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  if (!open || !item || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10002] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Choose an option</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100">
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
          onClick={onClose}
          disabled={busy}
          className="w-full rounded-xl py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}
