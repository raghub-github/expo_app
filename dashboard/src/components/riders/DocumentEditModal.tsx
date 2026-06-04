"use client";

import { useState, useRef, useEffect } from "react";
import { X, Upload, FileText, Trash2 } from "lucide-react";
import { LoadingButton } from "@/components/ui/LoadingButton";

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
}

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
}: DocumentEditModalProps) {
  const [docNumber, setDocNumber] = useState(currentDocNumber || "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const [errors, setErrors] = useState<{ docNumber?: string; file?: string }>({});
  const [removing, setRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    }
  }, [isOpen, currentDocNumber, currentImageUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      setErrors({ ...errors, file: "Invalid file type. Allowed types: JPEG, PNG, WebP, PDF" });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrors({ ...errors, file: "File size exceeds 10MB limit" });
      return;
    }

    setSelectedFile(file);
    setErrors({ ...errors, file: undefined });

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => setPreviewUrl(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleRemoveStoredImage = async () => {
    if (!showRemove) return;
    if (
      !confirm(
        "Remove this image? It will be deleted from R2 storage and the database. You can upload a new file after."
      )
    ) {
      return;
    }

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
    if (docNumber && docNumber.trim().length > 0 && docNumber.trim().length < 3) {
      newErrors.docNumber = "Document number must be at least 3 characters";
    }

    const docNumberChanged = docNumber !== (currentDocNumber || "");
    const fileChanged = selectedFile !== null;

    if (!docNumberChanged && !fileChanged) {
      onClose();
      return;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    await onSave({
      docNumber: docNumber.trim() ? docNumber.trim() : undefined,
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
      ev_proof: "EV Proof",
    };
    return labels[type] || type;
  };

  const busy = isLoading || removing;
  const inputId = `document-file-input-${docType}`;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-gray-800/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 shrink-0">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 truncate pr-2">
            Edit {getDocTypeLabel(docType)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0 disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Document number{" "}
              {["selfie", "profile_photo", "bank_proof", "vehicle_image", "upi_qr_proof"].includes(docType)
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
              className={`w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 ${
                errors.docNumber ? "border-red-500" : "border-gray-300"
              }`}
            />
            {errors.docNumber && <p className="mt-1 text-sm text-red-600">{errors.docNumber}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Document Image</label>
            {previewUrl ? (
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-3 bg-gray-50/50 flex justify-center">
                {previewUrl.startsWith("data:") ||
                previewUrl.includes("/attachments/proxy") ||
                previewUrl.startsWith("http") ? (
                  <img
                    src={previewUrl}
                    alt="Document preview"
                    className="max-h-52 rounded-lg object-contain"
                  />
                ) : (
                  <div className="py-8 text-gray-400 flex flex-col items-center">
                    <FileText className="h-10 w-10 mb-2" />
                    <span className="text-sm">PDF Document</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500 bg-gray-50">
                No image uploaded yet.
              </div>
            )}
            {selectedFile && (
              <p className="mt-2 text-sm text-blue-700">
                New file ready: {selectedFile.name} — click Save Changes to upload.
              </p>
            )}
            {errors.file && <p className="mt-1 text-sm text-red-600">{errors.file}</p>}
          </div>
        </div>

        {/* Sticky footer — always visible */}
        <div className="shrink-0 border-t border-gray-200 bg-gray-50 p-4 sm:p-5 space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
            onChange={handleFileChange}
            className="hidden"
            id={inputId}
          />

          <div className="flex flex-col sm:flex-row gap-2">
            <label
              htmlFor={inputId}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-blue-400 bg-blue-50 text-blue-800 text-sm font-semibold cursor-pointer hover:bg-blue-100 transition-colors ${
                busy ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              <Upload className="h-4 w-4 shrink-0" />
              {selectedFile ? "Change New Upload" : "Upload New Image"}
            </label>

            {showRemove && (
              <button
                type="button"
                onClick={handleRemoveStoredImage}
                disabled={busy}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-red-400 bg-red-50 text-red-800 text-sm font-semibold hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4 shrink-0" />
                {removing ? "Removing..." : "Remove Image"}
              </button>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <LoadingButton
              onClick={handleSave}
              loading={isLoading}
              disabled={removing}
              loadingText="Saving..."
              className="px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50"
            >
              Save Changes
            </LoadingButton>
          </div>
        </div>
      </div>
    </div>
  );
}
