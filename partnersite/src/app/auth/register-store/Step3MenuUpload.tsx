"use client";

import type { RefObject, Dispatch, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";
import { Trash2, Upload } from "lucide-react";
import {
  type MenuEntryVerificationTag,
  menuPdfStatusFromRejectionDetail,
  resolvePartnerMenuImageVerificationTag,
  resolvePartnerMenuPdfVerificationTag,
} from "@/lib/store-verification-menu-rejection-detail-shared";

/** Local file preview + object URL lifecycle for pending menu images. */
function PendingMenuImageCell({
  file,
  fileIndex,
  onRemove,
}: {
  file: File;
  fileIndex: number;
  onRemove: (idx: number) => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setObjectUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  return (
    <li className="relative flex w-[28vw] max-w-[9.5rem] shrink-0 flex-col gap-1 md:w-auto md:max-w-none md:min-w-0">
      <div className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm">
        {objectUrl ? (
          <a
            href={objectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            aria-label={`Open ${file.name} in new tab`}
          >
            <img
              src={objectUrl}
              alt=""
              className="h-full w-full object-cover transition hover:opacity-95"
            />
          </a>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">…</div>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove(fileIndex);
          }}
          className="absolute right-1 top-1 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-rose-600 shadow-sm hover:bg-rose-50 hover:text-rose-700"
          aria-label="Remove image"
        >
          <Trash2 className="h-4 w-4 shrink-0" strokeWidth={2} />
        </button>
      </div>
      <p
        className="truncate px-0.5 text-center text-[10px] leading-tight text-slate-600"
        title={file.name}
      >
        {file.name}
      </p>
      <p className="text-center text-[9px] text-slate-400">
        {(file.size / (1024 * 1024)).toFixed(2)} MB · not saved
      </p>
    </li>
  );
}

export type MenuUploadMode = 'IMAGE' | 'PDF' | 'CSV';

export interface Step3MenuUploadProps {
  menuUploadMode: MenuUploadMode;
  onModeClick: (mode: MenuUploadMode) => void;
  menuImageFiles: File[];
  menuUploadedImageUrls: string[];
  menuUploadedImageNames: string[];
  menuUploadIds: number[];
  /** Stable ids for DELETE ?entry_id= (menu image bundle rows). */
  menuImageEntryIds: string[];
  /** Same length as menuUploadedImageUrls when from DB; e.g. REJECTED after verification step 3 rejection. */
  menuImageVerificationStatuses: string[];
  /**
   * True when the merchant is in verification-fix mode on partner step 3 (menu).
   * Fallback when no `menuEntryRejectionStatuses` snapshot exists.
   */
  menuStepVerificationFixActive?: boolean;
  /** Step 3 rejection snapshot: `entry_id` → VERIFIED | REJECTED | PENDING (from `step_rejection_detail`). */
  menuEntryRejectionStatuses?: Record<string, MenuEntryVerificationTag>;
  /** DB `merchant_store_media_files.verification_status` for the menu PDF row (from progress merge). */
  menuPdfVerificationStatus?: string | null;
  /** Raw step-3 `step_rejection_detail` from verification API (MENU_REFERENCE snapshot includes PDF row). */
  menuStep3RejectionDetail?: unknown;
  menuSpreadsheetFile: File | null;
  menuUploadedSpreadsheetUrl: string | null;
  menuUploadedSpreadsheetFileName: string | null;
  menuPdfFile: File | null;
  menuUploadedPdfUrl: string | null;
  menuUploadedPdfFileName: string | null;
  setConfirmModal: Dispatch<
    SetStateAction<{
      title: string;
      message: string;
      variant?: 'warning' | 'error' | 'info' | 'success';
      confirmLabel?: string;
      onConfirm: () => void | Promise<void>;
      onCancel?: () => void;
      isLoading?: boolean;
      notice?: boolean;
    } | null>
  >;
  menuUploadError: string | null;
  /** True while menu images are uploading to R2 (spinner on Upload images). */
  menuImageUploading: boolean;
  isImageDragActive: boolean;
  setIsImageDragActive: (v: boolean) => void;
  isPdfDragActive: boolean;
  setIsPdfDragActive: (v: boolean) => void;
  isCsvDragActive: boolean;
  setIsCsvDragActive: (v: boolean) => void;
  onMenuImageUpload: (files: File[]) => void;
  onMenuPdfUpload: (file: File | null) => void;
  onMenuSpreadsheetUpload: (file: File | null) => void;
  imageUploadInputRef: RefObject<HTMLInputElement | null>;
  pdfUploadInputRef: RefObject<HTMLInputElement | null>;
  csvUploadInputRef: RefObject<HTMLInputElement | null>;
  onRemovePendingImage: (idx: number) => void;
  onRemoveUploadedImage: (idx: number) => void;
  /** Clears all pending local images and deletes every uploaded image from the server. */
  onRemoveAllMenuImages: () => void | Promise<void>;
  /** Replace one rejected cloud image; server marks the new file REUPLOADED. */
  onReuploadRejectedMenuImage?: (uploadedSlotIndex: number, file: File) => void | Promise<void>;
  /** Index in `menuUploadedImageUrls` while a rejected-slot re-upload is running. */
  menuImageReuploadingIndex?: number | null;
  onRemoveCsvFile: () => void;
  onRemovePdfFile: () => void;
}

export default function Step3MenuUpload(props: Step3MenuUploadProps) {
  const {
    menuUploadMode,
    onModeClick,
    menuImageFiles,
    menuUploadedImageUrls,
    menuUploadedImageNames,
    menuUploadIds,
    menuImageEntryIds,
    menuSpreadsheetFile,
    menuUploadedSpreadsheetUrl,
    menuUploadedSpreadsheetFileName,
    menuPdfFile,
    menuUploadedPdfUrl,
    menuUploadedPdfFileName,
    setConfirmModal,
    menuUploadError,
    menuImageUploading,
    isImageDragActive,
    setIsImageDragActive,
    isPdfDragActive,
    setIsPdfDragActive,
    isCsvDragActive,
    setIsCsvDragActive,
    onMenuImageUpload,
    onMenuPdfUpload,
    onMenuSpreadsheetUpload,
    imageUploadInputRef,
    pdfUploadInputRef,
    csvUploadInputRef,
    onRemovePendingImage,
    onRemoveUploadedImage,
    onRemoveAllMenuImages,
    onReuploadRejectedMenuImage,
    menuImageReuploadingIndex = null,
    onRemoveCsvFile,
    onRemovePdfFile,
    menuStepVerificationFixActive = false,
    menuEntryRejectionStatuses: menuEntryRejectionStatusesProp,
    menuPdfVerificationStatus: menuPdfVerificationStatusProp,
    menuStep3RejectionDetail: menuStep3RejectionDetailProp,
  } = props;

  const reuploadInputRef = useRef<HTMLInputElement | null>(null);
  const [reuploadTargetIdx, setReuploadTargetIdx] = useState<number | null>(null);

  /** Read from props (not a nested helper) so React Compiler / hoisting cannot drop the closure. */
  const menuImageVerificationStatusesSafe = props.menuImageVerificationStatuses ?? [];
  const menuEntryRejectionStatuses = menuEntryRejectionStatusesProp ?? {};
  const hasMenuRejectionEntrySnapshot = Object.keys(menuEntryRejectionStatuses).length > 0;

  const pdfVerificationTag = resolvePartnerMenuPdfVerificationTag({
    rawDbStatus: menuPdfVerificationStatusProp ?? null,
    snapshotPdfStatus: menuPdfStatusFromRejectionDetail(menuStep3RejectionDetailProp),
    menuStepVerificationFixActive,
  });

  const uploadedHasRemovableSlot = menuUploadedImageUrls.some((_, idx) => {
    const entryId = String(menuImageEntryIds[idx] ?? "").trim();
    const tag = resolvePartnerMenuImageVerificationTag({
      entryId,
      menuEntryRejectionStatuses,
      hasMenuRejectionEntrySnapshot,
      rawDbStatus: menuImageVerificationStatusesSafe[idx],
      menuStepVerificationFixActive,
    });
    return tag !== "VERIFIED";
  });
  const canRemoveAllMenuImages = menuImageFiles.length > 0 || uploadedHasRemovableSlot;

  return (
    <div className="h-full flex items-start justify-center">
      <div className="w-full max-w-6xl h-full overflow-y-auto rounded-2xl bg-white shadow-sm border border-slate-200 p-3 sm:p-6 hide-scrollbar">
        <div className="mb-4 sm:mb-5 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
            <div className="flex items-start gap-2 sm:gap-3 min-w-0">
              <div className="p-2 rounded-lg sm:rounded-xl bg-indigo-50 border border-indigo-100 shrink-0">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
                </svg>
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-xl font-bold text-slate-800">Delivery Menu Upload</h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">One type only: up to 5 images, or 1 PDF, or 1 CSV/Excel. Manual entry after verification.</p>
              </div>
            </div>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 shrink-0">
              {(['IMAGE', 'PDF', 'CSV'] as const).map((mode) => {
                const label = mode === 'IMAGE' ? 'Menu Images' : mode === 'PDF' ? 'PDF' : 'CSV / Excel';
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onModeClick(mode)}
                    className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition ${
                      menuUploadMode === mode ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {menuUploadError && (
          <div className="mb-3 sm:mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs sm:text-sm text-amber-700">
            {menuUploadError}
          </div>
        )}

        <input
          ref={reuploadInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={(e) => {
            const idx = reuploadTargetIdx;
            const f = (e.target.files || [])[0] || null;
            e.target.value = "";
            setReuploadTargetIdx(null);
            if (idx == null || !f || !onReuploadRejectedMenuImage) return;
            void onReuploadRejectedMenuImage(idx, f);
          }}
        />

        <div className="mb-3 sm:mb-4 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
          <span className="font-medium text-slate-600">Attachments:</span>
          {menuUploadMode === 'IMAGE' && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-700">
              {menuImageFiles.length + menuUploadedImageUrls.length} of 5 images
            </span>
          )}
          {menuUploadMode === 'PDF' && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-700">
              {(menuPdfFile || menuUploadedPdfUrl) ? '1 PDF file' : 'No file'}
            </span>
          )}
          {menuUploadMode === 'CSV' && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-700">
              {(menuSpreadsheetFile || menuUploadedSpreadsheetUrl) ? '1 CSV/Excel file' : 'No file'}
            </span>
          )}
        </div>

        {menuUploadMode === 'IMAGE' && (
          <div
            onDragOver={(e) => {
              if (menuImageUploading) return;
              e.preventDefault();
              setIsImageDragActive(true);
            }}
            onDragLeave={() => setIsImageDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsImageDragActive(false);
              if (menuImageUploading) return;
              onMenuImageUpload(Array.from(e.dataTransfer.files || []));
            }}
            className={`rounded-xl border-2 border-dashed p-4 sm:p-6 transition ${isImageDragActive && !menuImageUploading ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50'}`}
          >
            <input
              ref={imageUploadInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              multiple
              className="hidden"
              disabled={menuImageUploading}
              onChange={(e) => onMenuImageUpload(Array.from(e.target.files || []))}
            />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs sm:text-sm text-slate-600">
                JPG, PNG, WEBP · max 5 · 5 MB each · saved to cloud when you add files (after Store ID exists)
              </p>
              <button
                type="button"
                disabled={menuImageUploading}
                onClick={() => imageUploadInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 min-h-[40px] touch-manipulation disabled:opacity-80 disabled:cursor-not-allowed shrink-0"
              >
                {menuImageUploading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Uploading…
                  </>
                ) : (
                  "Upload images"
                )}
              </button>
            </div>
          </div>
        )}
        {menuUploadMode === 'PDF' && (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsPdfDragActive(true); }}
            onDragLeave={() => setIsPdfDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsPdfDragActive(false);
              const f = Array.from(e.dataTransfer.files || [])[0] || null;
              if (f) onMenuPdfUpload(f);
            }}
            className={`rounded-xl border-2 border-dashed p-4 sm:p-6 transition ${isPdfDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50'}`}
          >
            <input ref={pdfUploadInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={(e) => onMenuPdfUpload((e.target.files || [])[0] || null)} />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs sm:text-sm text-slate-600">
                One PDF · up to 5 MB · saved to cloud when you pick the file (after Store ID exists)
              </p>
              <button type="button" onClick={() => pdfUploadInputRef.current?.click()} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 min-h-[40px] touch-manipulation">
                Upload PDF
              </button>
            </div>
          </div>
        )}
        {menuUploadMode === 'CSV' && (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsCsvDragActive(true); }}
            onDragLeave={() => setIsCsvDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsCsvDragActive(false);
              const dropped = Array.from(e.dataTransfer.files || [])[0] || null;
              onMenuSpreadsheetUpload(dropped);
            }}
            className={`rounded-xl border-2 border-dashed p-4 sm:p-6 transition ${isCsvDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50'}`}
          >
            <input ref={csvUploadInputRef} type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={(e) => onMenuSpreadsheetUpload((e.target.files || [])[0] || null)} />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs sm:text-sm text-slate-600">
                .csv, .xls, .xlsx · one file · 5 MB · saved to cloud when you pick the file (after Store ID exists)
              </p>
              <button type="button" onClick={() => csvUploadInputRef.current?.click()} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 min-h-[40px] touch-manipulation">
                Upload spreadsheet
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 sm:mt-6 space-y-3">
          {menuUploadMode === 'IMAGE' && (menuImageFiles.length > 0 || menuUploadedImageUrls.length > 0) && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-700">Uploaded menu</h3>
                <button
                  type="button"
                  disabled={!canRemoveAllMenuImages}
                  onClick={() => {
                    if (!canRemoveAllMenuImages) return;
                    setConfirmModal({
                      title: "Remove removable menu images?",
                      message:
                        "This clears images that are not yet saved and deletes rejected or pending images from the server. Verified images stay on file.",
                      variant: "warning",
                      confirmLabel: "Remove all",
                      onConfirm: () => onRemoveAllMenuImages(),
                      onCancel: () => setConfirmModal(null),
                    });
                  }}
                  className={`text-xs font-semibold underline-offset-2 min-h-[36px] px-1 ${
                    canRemoveAllMenuImages
                      ? "text-rose-600 hover:text-rose-800 hover:underline"
                      : "cursor-not-allowed text-slate-400"
                  }`}
                >
                  Remove all
                </button>
              </div>
              <ul className="list-none m-0 flex w-full flex-nowrap gap-2 overflow-x-auto pb-1 sm:gap-3 md:grid md:max-w-full md:grid-cols-5 md:flex-none md:overflow-visible md:pb-0 [scrollbar-width:thin]">
                {menuImageFiles.map((file, idx) => (
                  <PendingMenuImageCell
                    key={`pending-${idx}-${file.name}-${file.size}`}
                    file={file}
                    fileIndex={idx}
                    onRemove={onRemovePendingImage}
                  />
                ))}
                {menuUploadedImageUrls.map((url, idx) => {
                  const entryId = String(menuImageEntryIds[idx] ?? "").trim();
                  const verificationTag = resolvePartnerMenuImageVerificationTag({
                    entryId,
                    menuEntryRejectionStatuses,
                    hasMenuRejectionEntrySnapshot,
                    rawDbStatus: menuImageVerificationStatusesSafe[idx],
                    menuStepVerificationFixActive,
                  });
                  const isVerifiedLocked = verificationTag === "VERIFIED";
                  const label = menuUploadedImageNames[idx] || `Menu image ${idx + 1}`;
                  return (
                    <li
                      key={`uploaded-${menuImageEntryIds[idx] || String(menuUploadIds[idx] ?? idx)}`}
                      className="relative flex w-[28vw] max-w-[9.5rem] shrink-0 flex-col gap-1 md:w-auto md:max-w-none md:min-w-0"
                    >
                      <div
                        className={`relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm ${
                          isVerifiedLocked ? "ring-1 ring-emerald-200/80" : ""
                        }`}
                        title={isVerifiedLocked ? "Verified — cannot be changed" : undefined}
                      >
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute inset-0 block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                            aria-label={`Open ${label} in new tab`}
                          >
                            <img
                              src={url}
                              alt={label}
                              className="h-full w-full object-cover transition hover:opacity-95"
                              loading="lazy"
                            />
                          </a>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                            No preview
                          </div>
                        )}
                        {verificationTag === "REJECTED" ? (
                          <span
                            className="pointer-events-none absolute left-1 top-1 z-[15] max-w-[calc(100%-2.25rem)] truncate rounded-md bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-md ring-1 ring-rose-800/30"
                            title="Rejected by verification — please update and resubmit"
                          >
                            Rejected
                          </span>
                        ) : null}
                        {verificationTag === "VERIFIED" ? (
                          <span
                            className="pointer-events-none absolute left-1 top-1 z-[15] max-w-[calc(100%-2.25rem)] truncate rounded-md bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-md ring-1 ring-emerald-800/30"
                            title="Verified by verification team at last review"
                          >
                            Verified
                          </span>
                        ) : null}
                        {verificationTag === "REUPLOADED" ? (
                          <span
                            className="pointer-events-none absolute left-1 top-1 z-[15] max-w-[calc(100%-2.25rem)] truncate rounded-md bg-indigo-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-md ring-1 ring-indigo-900/30"
                            title="You replaced this image — pending review"
                          >
                            Reuploaded
                          </span>
                        ) : null}
                        {verificationTag === "PENDING" && hasMenuRejectionEntrySnapshot ? (
                          <span
                            className="pointer-events-none absolute left-1 top-1 z-[15] max-w-[calc(100%-2.25rem)] truncate rounded-md bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-md ring-1 ring-amber-800/30"
                            title="Awaiting verification review"
                          >
                            Pending
                          </span>
                        ) : null}
                        {!isVerifiedLocked ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setConfirmModal({
                                title: "Remove uploaded image?",
                                message: "This will be deleted from the server.",
                                variant: "warning",
                                onConfirm: () => onRemoveUploadedImage(idx),
                                onCancel: () => setConfirmModal(null),
                              });
                            }}
                            className="absolute right-1 top-1 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-rose-600 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                            aria-label="Remove image"
                          >
                            <Trash2 className="h-4 w-4 shrink-0" strokeWidth={2} />
                          </button>
                        ) : null}
                      </div>
                      <p
                        className="truncate px-0.5 text-center text-[10px] leading-tight text-slate-600"
                        title={label}
                      >
                        {label}
                      </p>
                      {verificationTag === "REJECTED" && onReuploadRejectedMenuImage ? (
                        <button
                          type="button"
                          disabled={menuImageUploading || menuImageReuploadingIndex != null}
                          onClick={() => {
                            setReuploadTargetIdx(idx);
                            reuploadInputRef.current?.click();
                          }}
                          className="mt-0.5 flex w-full min-h-[32px] items-center justify-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {menuImageReuploadingIndex === idx ? (
                            <>
                              <svg
                                className="h-3.5 w-3.5 shrink-0 animate-spin text-indigo-600"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                aria-hidden
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                              </svg>
                              Uploading…
                            </>
                          ) : (
                            <>
                              <Upload className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                              Re-upload
                            </>
                          )}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {menuUploadMode === 'CSV' && (menuSpreadsheetFile || menuUploadedSpreadsheetUrl) && (
            <>
              <h3 className="text-sm font-semibold text-slate-700">Uploaded menu</h3>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {menuSpreadsheetFile?.name ?? menuUploadedSpreadsheetFileName ?? 'Spreadsheet'}
                  </p>
                  {menuSpreadsheetFile && (
                    <p className="text-xs text-slate-500">{(menuSpreadsheetFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {menuUploadedSpreadsheetUrl ? (
                    <a
                      href={menuUploadedSpreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 min-h-[36px]"
                    >
                      View uploaded menu
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmModal({
                        title: 'Remove file?',
                        message: 'This will be deleted from the server.',
                        variant: 'warning',
                        onConfirm: onRemoveCsvFile,
                        onCancel: () => setConfirmModal(null),
                      })
                    }
                    className="text-xs font-medium text-rose-600 hover:text-rose-700 min-h-[36px] px-2"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </>
          )}
          {menuUploadMode === 'PDF' && (menuPdfFile || menuUploadedPdfUrl) && (
            <>
              <h3 className="text-sm font-semibold text-slate-700">Uploaded menu</h3>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {menuPdfFile?.name ?? menuUploadedPdfFileName ?? "PDF"}
                    </p>
                    {pdfVerificationTag === "REJECTED" ? (
                      <span
                        className="shrink-0 rounded-md bg-rose-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm ring-1 ring-rose-800/30"
                        title="Rejected by verification — please update and resubmit"
                      >
                        Rejected
                      </span>
                    ) : null}
                    {pdfVerificationTag === "VERIFIED" ? (
                      <span
                        className="shrink-0 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm ring-1 ring-emerald-800/30"
                        title="Verified by verification team at last review"
                      >
                        Verified
                      </span>
                    ) : null}
                    {pdfVerificationTag === "REUPLOADED" ? (
                      <span
                        className="shrink-0 rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm ring-1 ring-indigo-900/30"
                        title="You replaced this file — pending review"
                      >
                        Reuploaded
                      </span>
                    ) : null}
                  </div>
                  {menuPdfFile && <p className="text-xs text-slate-500">{(menuPdfFile.size / (1024 * 1024)).toFixed(2)} MB</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {menuUploadedPdfUrl ? (
                    <a
                      href={menuUploadedPdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 min-h-[36px]"
                    >
                      View uploaded menu
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmModal({
                        title: 'Remove file?',
                        message: 'This will be deleted from the server.',
                        variant: 'warning',
                        onConfirm: onRemovePdfFile,
                        onCancel: () => setConfirmModal(null),
                      })
                    }
                    className="text-xs font-medium text-rose-600 hover:text-rose-700 min-h-[36px] px-2"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
