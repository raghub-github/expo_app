"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ChevronLeft, ChevronRight, Info, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { R2Image } from "@/components/R2Image";
import {
  itemHasCatalogPhoto,
  normalizeImageModerationStatus,
  type CatalogPhotoMenuItem,
} from "@/lib/catalog-photo-helpers";
import {
  deletePartnerMenuItemImage,
  fetchPartnerMenuItem,
  type MenuItemDetailResponse,
  type MenuItemImageRow,
} from "@/lib/partnerMenuPhotoApi";

type Props = {
  open: boolean;
  item: (CatalogPhotoMenuItem & { item_name: string }) | null;
  storeId: string | null;
  imageLimitReached?: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onRequestUploadOptions: () => void;
};

function approvalMessage(
  status: string | null | undefined,
  hasPhotos: boolean,
): { text: string; tone: "ok" | "warn" | "bad" } | null {
  if (!hasPhotos) return null;
  const s = normalizeImageModerationStatus(status);
  if (s === "APPROVED") return { text: "This image is approved", tone: "ok" };
  if (s === "REJECTED") return null;
  return { text: "This image is in review", tone: "warn" };
}

export function CatalogItemPhotoModal({
  open,
  item,
  storeId,
  imageLimitReached = false,
  onClose,
  onUpdated,
  onRequestUploadOptions,
}: Props) {
  const [detail, setDetail] = useState<MenuItemDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  const loadDetail = useCallback(async () => {
    if (!item || !storeId) return;
    setLoading(true);
    try {
      const data = await fetchPartnerMenuItem(storeId, item.id);
      if (data) {
        setDetail(data);
        setActiveIndex(0);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load photos");
    } finally {
      setLoading(false);
    }
  }, [item, storeId]);

  useEffect(() => {
    if (!open || !item) {
      setDetail(null);
      setActiveIndex(0);
      setReplaceConfirmOpen(false);
      return;
    }
    void loadDetail();
  }, [open, item?.id, loadDetail]);

  const previewImages: MenuItemImageRow[] = useMemo(
    () =>
      item?.item_image_url
        ? [
            {
              id: -1,
              image_url: item.item_image_url,
              is_primary: true,
              display_order: 0,
              moderation_status:
                item.primary_image_moderation_status ?? item.approval_status ?? "PENDING",
              rejection_reason: null,
            },
          ]
        : [],
    [item?.item_image_url, item?.primary_image_moderation_status, item?.approval_status],
  );

  const images = useMemo(() => {
    if (detail?.images && detail.images.length > 0) return detail.images;
    return previewImages;
  }, [detail?.images, previewImages]);

  const approvalStatus = detail?.approval_status ?? item?.approval_status ?? null;
  const currentImage = images[activeIndex] ?? null;
  const hasPhotos = images.length > 0;
  const currentModeration = currentImage
    ? normalizeImageModerationStatus(currentImage.moderation_status)
    : normalizeImageModerationStatus(approvalStatus);
  const primaryImage = images.find((img) => img.is_primary) ?? images[0] ?? null;
  const primaryModeration = primaryImage
    ? normalizeImageModerationStatus(primaryImage.moderation_status)
    : normalizeImageModerationStatus(approvalStatus);
  const status =
    primaryModeration === "REJECTED"
      ? null
      : approvalMessage(primaryModeration === "APPROVED" ? "APPROVED" : "PENDING", hasPhotos);
  const isPrimaryRejected = hasPhotos && primaryModeration === "REJECTED";
  const showAddPhotoSlide = isPrimaryRejected || approvalStatus === "REJECTED";
  const totalSlides = images.length + (showAddPhotoSlide ? 1 : 0);
  const isOnAddPhotoSlide = showAddPhotoSlide && activeIndex === images.length;
  const isCurrentRejected =
    activeIndex < images.length && hasPhotos && currentModeration === "REJECTED";
  const rejectionReason =
    (isCurrentRejected ? currentImage?.rejection_reason?.trim() : null) ||
    (isPrimaryRejected ? primaryImage?.rejection_reason?.trim() : null) ||
    detail?.rejection_reason?.trim() ||
    null;

  const scrollToSlide = (index: number) => {
    if (index < 0 || index >= totalSlides) return;
    setActiveIndex(index);
    const el = carouselRef.current;
    if (!el) return;
    const slide = el.children[index] as HTMLElement | undefined;
    slide?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };

  const handleAddPhoto = () => {
    if (!item || busy) return;
    if (imageLimitReached) {
      toast.error("Image upload limit reached for your plan. Upgrade to add more.");
      return;
    }
    onRequestUploadOptions();
  };

  const handleReplacePhotoPress = () => {
    if (!item || busy) return;
    if (isOnAddPhotoSlide || isCurrentRejected || !hasPhotos) {
      handleAddPhoto();
      return;
    }
    if (primaryModeration === "APPROVED") {
      setReplaceConfirmOpen(true);
      return;
    }
    handleAddPhoto();
  };

  const handleDeletePhoto = async (imageToDelete: MenuItemImageRow) => {
    if (!imageToDelete || !storeId || busy || imageToDelete.id <= 0) return;
    if (!window.confirm("Delete photo? This will remove the selected image from this item.")) return;
    setBusy(true);
    try {
      await deletePartnerMenuItemImage(storeId, imageToDelete.id);
      await loadDetail();
      onUpdated();
      toast.success("Photo deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  if (!open || !item || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
        onClick={onClose}
      >
        <div
          className="flex max-h-[min(520px,90vh)] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <h2 className="text-base font-bold text-gray-900">Photo status</h2>
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
            {loading && images.length === 0 && !item.item_image_url ? (
              <div className="flex h-36 items-center justify-center">
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
              </div>
            ) : images.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center rounded-xl bg-gray-50 text-gray-500">
                <Camera size={36} className="mb-2 opacity-50" />
                <p className="text-sm">No photos uploaded yet</p>
              </div>
            ) : (
              <div className="relative">
                <div
                  ref={carouselRef}
                  className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-1"
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const w = el.clientWidth || 1;
                    const idx = Math.round(el.scrollLeft / w);
                    if (idx !== activeIndex && idx >= 0 && idx < totalSlides) setActiveIndex(idx);
                  }}
                >
                  {images.map((img) => {
                    const slideModeration = normalizeImageModerationStatus(img.moderation_status);
                    return (
                      <div
                        key={img.image_url || String(img.id)}
                        className="relative h-44 min-w-full shrink-0 snap-center overflow-hidden rounded-xl border border-gray-200 bg-gray-100 sm:h-48"
                      >
                        <R2Image
                          src={img.image_url}
                          alt=""
                          className="h-full w-full object-contain"
                        />
                        {img.id > 0 ? (
                          <button
                            type="button"
                            onClick={() => void handleDeletePhoto(img)}
                            disabled={busy}
                            className="absolute right-2 top-2 rounded-full bg-black/55 p-2 text-white hover:bg-black/70 disabled:opacity-50"
                            aria-label="Delete photo"
                          >
                            <Trash2 size={16} />
                          </button>
                        ) : null}
                        {slideModeration === "APPROVED" ? (
                          <span className="absolute left-2 top-2 rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">
                            Approved
                          </span>
                        ) : null}
                        {slideModeration === "REJECTED" ? (
                          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
                            <Info size={12} />
                            Rejected
                          </span>
                        ) : slideModeration === "PENDING" && img.is_primary ? (
                          <span className="absolute left-2 top-2 rounded-md bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white">
                            Image in review
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                  {showAddPhotoSlide ? (
                    <button
                      type="button"
                      onClick={handleAddPhoto}
                      disabled={busy}
                      className="flex h-44 min-w-full shrink-0 snap-center flex-col items-center justify-center rounded-xl border-2 border-dashed border-orange-300 bg-orange-50/60 text-orange-700 hover:bg-orange-50 sm:h-48"
                    >
                      <div className="relative mb-2">
                        <Camera size={32} />
                        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
                          +
                        </span>
                      </div>
                      <span className="text-sm font-semibold">Add photo</span>
                    </button>
                  ) : null}
                </div>

                {totalSlides > 1 ? (
                  <div className="mt-2 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => scrollToSlide(activeIndex - 1)}
                      disabled={activeIndex <= 0}
                      className="rounded-full p-1 text-gray-500 disabled:opacity-30"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <div className="flex gap-1.5">
                      {Array.from({ length: totalSlides }).map((_, idx) => (
                        <button
                          key={idx === images.length ? "add" : `dot-${idx}`}
                          type="button"
                          onClick={() => scrollToSlide(idx)}
                          className={`h-2 w-2 rounded-full ${idx === activeIndex ? "bg-orange-500" : "bg-gray-300"}`}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => scrollToSlide(activeIndex + 1)}
                      disabled={activeIndex >= totalSlides - 1}
                      className="rounded-full p-1 text-gray-500 disabled:opacity-30"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                ) : null}
              </div>
            )}

            <p className="shrink-0 text-sm text-gray-600">
              Item name: <span className="font-semibold text-gray-900">{item.item_name}</span>
            </p>

            {isOnAddPhotoSlide ? (
              <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                Image increases chances of order by 60%
              </div>
            ) : isCurrentRejected ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs font-bold uppercase text-red-700">Rejection reason</p>
                <p className="mt-1 text-sm text-red-800">
                  {rejectionReason ??
                    "Photo does not meet our photo guidelines. Please upload a new photo."}
                </p>
              </div>
            ) : status ? (
              <div
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  status.tone === "ok"
                    ? "bg-emerald-50 text-emerald-800"
                    : status.tone === "warn"
                      ? "bg-amber-50 text-amber-800"
                      : "bg-red-50 text-red-800"
                }`}
              >
                {status.text}
              </div>
            ) : !hasPhotos && !itemHasCatalogPhoto(item) ? (
              <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
                No photo yet. Add one so customers can see this item on the app.
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleReplacePhotoPress}
              disabled={busy}
              className={`shrink-0 w-full rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-60 ${
                isPrimaryRejected || isOnAddPhotoSlide || images.length === 0
                  ? "border border-orange-300 bg-white text-orange-700 hover:bg-orange-50"
                  : "bg-orange-500 text-white hover:bg-orange-600"
              }`}
            >
              {busy
                ? "Please wait…"
                : isOnAddPhotoSlide || images.length === 0
                  ? "Add photo"
                  : "Replace photo"}
            </button>
          </div>
        </div>
      </div>

      {replaceConfirmOpen ? (
        <div
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 px-4"
          onClick={() => setReplaceConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-white">
              <Info size={24} />
            </div>
            <p className="text-center text-sm font-medium text-gray-800 whitespace-pre-line">
              This image is approved{"\n"}Do you still want to replace it?
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setReplaceConfirmOpen(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setReplaceConfirmOpen(false);
                  handleAddPhoto();
                }}
                className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white hover:bg-orange-600"
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>,
    document.body,
  );
}
