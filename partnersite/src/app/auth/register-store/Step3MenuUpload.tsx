"use client";

import type { RefObject, Dispatch, SetStateAction } from 'react';

export type MenuUploadMode = 'IMAGE' | 'PDF' | 'CSV';

export interface Step3MenuUploadProps {
  menuUploadMode: MenuUploadMode;
  onModeClick: (mode: MenuUploadMode) => void;
  menuImageFiles: File[];
  menuUploadedImageUrls: string[];
  menuUploadedImageNames: string[];
  menuUploadIds: number[];
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
      variant?: 'warning' | 'error' | 'info';
      confirmLabel?: string;
      onConfirm: () => void;
      onCancel?: () => void;
    } | null>
  >;
  menuUploadError: string | null;
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
  imagePreviewUrls: (string | null)[];
  onRemovePendingImage: (idx: number) => void;
  onRemoveUploadedImage: (idx: number) => void;
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
    menuSpreadsheetFile,
    menuUploadedSpreadsheetUrl,
    menuUploadedSpreadsheetFileName,
    menuPdfFile,
    menuUploadedPdfUrl,
    menuUploadedPdfFileName,
    setConfirmModal,
    menuUploadError,
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
    imagePreviewUrls,
    onRemovePendingImage,
    onRemoveUploadedImage,
    onRemoveCsvFile,
    onRemovePdfFile,
  } = props;

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
            onDragOver={(e) => { e.preventDefault(); setIsImageDragActive(true); }}
            onDragLeave={() => setIsImageDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsImageDragActive(false);
              onMenuImageUpload(Array.from(e.dataTransfer.files || []));
            }}
            className={`rounded-xl border-2 border-dashed p-4 sm:p-6 transition ${isImageDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50'}`}
          >
            <input ref={imageUploadInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" multiple className="hidden" onChange={(e) => onMenuImageUpload(Array.from(e.target.files || []))} />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs sm:text-sm text-slate-600">JPG, PNG, WEBP · max 5 · 5 MB each</p>
              <button type="button" onClick={() => imageUploadInputRef.current?.click()} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 min-h-[40px] touch-manipulation">
                Upload images
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
              <p className="text-xs sm:text-sm text-slate-600">One PDF · up to 5 MB</p>
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
              <p className="text-xs sm:text-sm text-slate-600">.csv, .xls, .xlsx · one file · 5 MB</p>
              <button type="button" onClick={() => csvUploadInputRef.current?.click()} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 min-h-[40px] touch-manipulation">
                Upload spreadsheet
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 sm:mt-6">
          {menuUploadMode === 'IMAGE' && (menuImageFiles.length > 0 || menuUploadedImageUrls.length > 0) && (
            <>
              <h3 className="text-sm font-semibold text-slate-700 mb-2 sm:mb-3">Your images</h3>
              <ul className="list-none p-0 m-0 flex flex-col gap-2 sm:gap-3 max-h-[min(50vh,400px)] overflow-y-auto pr-1">
                {menuImageFiles.map((file, idx) => (
                  <li key={`pending-${idx}`} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5 sm:p-3 shrink-0">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                      {imagePreviewUrls[idx] ? (
                        <img src={imagePreviewUrls[idx]!} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-slate-400 text-lg">IMG</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
                      <p className="text-xs text-slate-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                    <button type="button" onClick={() => onRemovePendingImage(idx)} className="text-xs text-rose-600 hover:text-rose-700 font-medium shrink-0 min-h-[36px] px-2 touch-manipulation">
                      Remove
                    </button>
                  </li>
                ))}
                {menuUploadedImageUrls.map((url, idx) => (
                  <li key={`uploaded-${menuUploadIds[idx] ?? idx}`} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5 sm:p-3 shrink-0">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                      {url ? (
                        <img src={url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="text-slate-400 text-lg">IMG</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{menuUploadedImageNames[idx] || `Image ${idx + 1}`}</p>
                      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">View</a>}
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmModal({ title: 'Remove uploaded image?', message: 'This will be deleted from the server.', variant: 'warning', onConfirm: () => onRemoveUploadedImage(idx), onCancel: () => setConfirmModal(null) })}
                      className="text-xs text-rose-600 hover:text-rose-700 font-medium shrink-0 min-h-[36px] px-2 touch-manipulation"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {menuUploadMode === 'CSV' && (menuSpreadsheetFile || menuUploadedSpreadsheetUrl) && (
            <>
              <h3 className="text-sm font-semibold text-slate-700 mb-2 sm:mb-3">Your file</h3>
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5 sm:p-3">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <span className="text-slate-500 text-xs font-medium">CSV</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{menuSpreadsheetFile?.name ?? menuUploadedSpreadsheetFileName ?? 'Spreadsheet'}</p>
                  {menuSpreadsheetFile && <p className="text-xs text-slate-500">{(menuSpreadsheetFile.size / (1024 * 1024)).toFixed(2)} MB</p>}
                  {menuUploadedSpreadsheetUrl && <a href={menuUploadedSpreadsheetUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">View</a>}
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmModal({ title: 'Remove file?', message: 'This will be deleted from the server.', variant: 'warning', onConfirm: onRemoveCsvFile, onCancel: () => setConfirmModal(null) })}
                  className="text-xs text-rose-600 hover:text-rose-700 font-medium shrink-0 min-h-[36px] px-2 touch-manipulation"
                >
                  Remove
                </button>
              </div>
            </>
          )}
          {menuUploadMode === 'PDF' && (menuPdfFile || menuUploadedPdfUrl) && (
            <>
              <h3 className="text-sm font-semibold text-slate-700 mb-2 sm:mb-3">Your file</h3>
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5 sm:p-3">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <span className="text-slate-500 text-xs font-medium">PDF</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{menuPdfFile?.name ?? menuUploadedPdfFileName ?? 'PDF'}</p>
                  {menuPdfFile && <p className="text-xs text-slate-500">{(menuPdfFile.size / (1024 * 1024)).toFixed(2)} MB</p>}
                  {menuUploadedPdfUrl && <a href={menuUploadedPdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">View</a>}
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmModal({ title: 'Remove file?', message: 'This will be deleted from the server.', variant: 'warning', onConfirm: onRemovePdfFile, onCancel: () => setConfirmModal(null) })}
                  className="text-xs text-rose-600 hover:text-rose-700 font-medium shrink-0 min-h-[36px] px-2 touch-manipulation"
                >
                  Remove
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
