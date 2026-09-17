"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Upload, FileText, Trash2 } from "lucide-react";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { ModalPortal } from "@/components/ui/ModalPortal";

interface DocumentEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { docNumber?: string; file?: File }) => Promise<void>;
  onRemove: () => Promise<void>;
  currentDocNumber?: string | null;
  currentImageUrl?: string | null;
  currentR2Key?: string | null;
  docType: string;
  isLoading?: boolean;
  /**
   * `embedded` — render form inside an existing Document Detail shell (no second modal).
   * `modal` — standalone dialog with backdrop click-to-close.
   */
  variant?: "modal" | "embedded";
  /** Hide the top title row when the parent shell already shows the document name. */
  hideChrome?: boolean;
}

/** Doc types that never show / require a document number field. */
const NO_DOC_NUMBER_TYPES = new Set([
  "selfie",
  "profile_photo",
]);

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
];

function isPendingUrl(url?: string | null): boolean {
  const v = (url ?? "").trim();
  return !v || v === "pending" || v.endsWith("/pending");
}

export function DocumentEditModal({
  isOpen,
  onClose,
  onSave,
  onRemove,
  currentDocNumber,
  currentImageUrl,
  currentR2Key,
  docType,
  isLoading = false,
  variant = "modal",
  hideChrome = false,
}: DocumentEditModalProps) {
  const hideDocNumber = NO_DOC_NUMBER_TYPES.has(docType);
  const [docNumber, setDocNumber] = useState(currentDocNumber || "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const [errors, setErrors] = useState<{ docNumber?: string; file?: string }>({});
  const [removing, setRemoving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);

  const showRemove =
    !selectedFile &&
    ((!isPendingUrl(currentImageUrl) && Boolean(currentImageUrl?.trim())) ||
      Boolean(currentR2Key?.trim()) ||
      (!isPendingUrl(previewUrl) && Boolean(previewUrl)));

  useEffect(() => {
    if (isOpen) {
      setDocNumber(currentDocNumber || "");
      setSelectedFile(null);
      setPreviewUrl(isPendingUrl(currentImageUrl) ? null : currentImageUrl || null);
      setErrors({});
      setRemoving(false);
      setDragging(false);
      dragDepthRef.current = 0;
    }
  }, [isOpen, currentDocNumber, currentImageUrl]);

  const applyFile = useCallback(
    (file: File | undefined | null) => {
      if (!file) return;

      if (!ALLOWED_TYPES.includes(file.type)) {
        setErrors((prev) => ({
          ...prev,
          file: "Invalid file type. Allowed types: JPEG, PNG, WebP, PDF",
        }));
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setErrors((prev) => ({ ...prev, file: "File size exceeds 10MB limit" }));
        return;
      }

      setSelectedFile(file);
      setErrors((prev) => ({ ...prev, file: undefined }));

      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onloadend = () => setPreviewUrl(reader.result as string);
        reader.readAsDataURL(file);
      } else {
        setPreviewUrl(null);
      }
    },
    [],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    applyFile(e.target.files?.[0]);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const busy = isLoading || removing;
  const inputId = `document-file-input-${docType}`;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDragging(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    applyFile(file);
  };

  const handleRemoveStoredImage = async () => {
    if (!showRemove || busy) return;
    const ok =
      typeof window !== "undefined"
        ? window.confirm(
            "Your image will be removed and you need to upload a new one.",
          )
        : true;
    if (!ok) return;

    try {
      setRemoving(true);
      await onRemove();
      setPreviewUrl(null);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setRemoving(false);
    }
  };

  const handleSave = async () => {
    const newErrors: { docNumber?: string; file?: string } = {};
    if (
      !hideDocNumber &&
      docNumber &&
      docNumber.trim().length > 0 &&
      docNumber.trim().length < 3
    ) {
      newErrors.docNumber = "Document number must be at least 3 characters";
    }

    const docNumberChanged =
      !hideDocNumber && docNumber !== (currentDocNumber || "");
    const fileChanged = selectedFile !== null;
    const isNew = isPendingUrl(currentImageUrl) && !currentR2Key;

    if (isNew && !fileChanged) {
      newErrors.file = "Please upload a document image or PDF";
    }

    if (!docNumberChanged && !fileChanged && !isNew) {
      onClose();
      return;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    await onSave({
      docNumber: hideDocNumber
        ? undefined
        : docNumber.trim()
          ? docNumber.trim()
          : undefined,
      file: fileChanged ? selectedFile || undefined : undefined,
    });
  };

  const getDocTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      aadhaar: "Aadhaar Card",
      aadhaar_front: "Aadhaar Card (Front)",
      aadhaar_back: "Aadhaar Card (Back)",
      pan: "PAN Card",
      dl: "Driving License",
      dl_front: "Driving License (Front)",
      dl_back: "Driving License (Back)",
      rc: "RC (Registration Certificate)",
      selfie: "Selfie",
      rental_proof: "Rental Proof",
      bank_proof: "Bank Proof",
      insurance: "Insurance Certificate",
      vehicle_image: "Vehicle Photo",
      upi_qr_proof: "UPI QR Code Proof",
      other: "Other Document",
    };
    return labels[type] || type;
  };

  if (!isOpen) return null;

  const titleText =
    hideDocNumber && isPendingUrl(currentImageUrl) && !currentR2Key
      ? `Upload ${getDocTypeLabel(docType)}`
      : `Edit ${getDocTypeLabel(docType)}`;

  const body = (
    <>
      {!hideChrome ? (
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 p-4 sm:p-6">
          <h2 className="truncate pr-2 text-lg font-semibold text-gray-900 sm:text-xl">
            {titleText}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="shrink-0 rounded-lg p-2 transition-colors hover:bg-gray-100 disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
        {!hideDocNumber ? (
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Document number{" "}
              {[
                "bank_proof",
                "vehicle_image",
                "upi_qr_proof",
                "insurance",
                "rental_proof",
                "ev_proof",
              ].includes(docType)
                ? "(optional — not required)"
                : "(optional)"}
            </label>
            <input
              type="text"
              value={docNumber}
              onChange={(e) => {
                setDocNumber(e.target.value);
                setErrors({ ...errors, docNumber: undefined });
              }}
              className={`w-full rounded-xl border bg-white px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.docNumber ? "border-red-500" : "border-gray-300"
              }`}
            />
            {errors.docNumber ? (
              <p className="mt-1 text-sm text-red-600">{errors.docNumber}</p>
            ) : null}
          </div>
        ) : null}

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            {hideDocNumber ? "Selfie Image" : "Document Image"}
          </label>
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              if (!busy) fileInputRef.current?.click();
            }}
            onKeyDown={(e) => {
              if (!busy && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-3 transition-colors ${
              dragging
                ? "border-blue-500 bg-blue-50"
                : previewUrl
                  ? "border-gray-300 bg-gray-50/50"
                  : "border-gray-200 bg-gray-50"
            } ${busy ? "pointer-events-none opacity-50" : ""}`}
          >
            {previewUrl ? (
              <div className="flex justify-center">
                {previewUrl.startsWith("data:") ||
                previewUrl.includes("/attachments/proxy") ||
                previewUrl.startsWith("http") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="Document preview"
                    className="max-h-52 rounded-lg object-contain pointer-events-none"
                    onError={() => {
                      setPreviewUrl(null);
                      setErrors((prev) => ({
                        ...prev,
                        file: undefined,
                      }));
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center py-8 text-gray-400">
                    <FileText className="mb-2 h-10 w-10" />
                    <span className="text-sm">PDF Document</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-gray-500">
                <Upload className="mx-auto mb-2 h-8 w-8 text-gray-400" />
                <p className="font-medium text-gray-600">
                  {dragging ? "Drop image here" : "Drag & drop an image here"}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  or click to browse (JPEG, PNG, WebP, PDF · max 10MB)
                </p>
              </div>
            )}
          </div>
          {selectedFile ? (
            <p className="mt-2 text-sm text-blue-700">
              New file ready: {selectedFile.name} — click Upload &amp; Save to upload.
            </p>
          ) : null}
          {errors.file ? <p className="mt-1 text-sm text-red-600">{errors.file}</p> : null}
        </div>
      </div>

      <div className="shrink-0 space-y-3 border-t border-gray-200 bg-gray-50 p-4 sm:p-5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
          onChange={handleFileChange}
          className="hidden"
          id={inputId}
        />

        <div className="flex flex-col gap-2 sm:flex-row">
          <label
            htmlFor={inputId}
            className={`inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-blue-400 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-800 transition-colors hover:bg-blue-100 ${
              busy ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <Upload className="h-4 w-4 shrink-0" />
            {isLoading
              ? "Uploading…"
              : selectedFile
                ? "Change New Upload"
                : "Upload New Image"}
          </label>

          {showRemove ? (
            <button
              type="button"
              onClick={() => void handleRemoveStoredImage()}
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-red-400 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 transition-colors hover:bg-red-100 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              {removing ? "Removing..." : "Remove Image"}
            </button>
          ) : null}
        </div>

        <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            {variant === "embedded" ? "Back" : "Cancel"}
          </button>
          <LoadingButton
            onClick={handleSave}
            loading={isLoading}
            disabled={removing}
            loadingText="Uploading…"
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {selectedFile ? "Upload & Save" : "Save Changes"}
          </LoadingButton>
        </div>
      </div>
    </>
  );

  if (variant === "embedded") {
    return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{body}</div>;
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-md sm:p-4">
        <button
          type="button"
          className="absolute inset-0 cursor-pointer"
          aria-label="Close"
          onClick={() => {
            if (!busy) onClose();
          }}
        />
        <div
          role="dialog"
          aria-modal="true"
          className="relative z-[161] flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {body}
        </div>
      </div>
    </ModalPortal>
  );
}
