"use client";

import { useState, useRef, useEffect } from "react";
import { X, Upload, Image as ImageIcon, FileText, Loader2 } from "lucide-react";
import { LoadingButton } from "@/components/ui/LoadingButton";

interface DocumentEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { docNumber?: string; file?: File }) => Promise<void>;
  currentDocNumber?: string | null;
  currentImageUrl?: string | null;
  docType: string;
  isLoading?: boolean;
}

export function DocumentEditModal({
  isOpen,
  onClose,
  onSave,
  currentDocNumber,
  currentImageUrl,
  docType,
  isLoading = false,
}: DocumentEditModalProps) {
  const [docNumber, setDocNumber] = useState(currentDocNumber || "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const [errors, setErrors] = useState<{ docNumber?: string; file?: string }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setDocNumber(currentDocNumber || "");
      setSelectedFile(null);
      setPreviewUrl(currentImageUrl || null);
      setErrors({});
    }
  }, [isOpen, currentDocNumber, currentImageUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      setErrors({
        ...errors,
        file: "Invalid file type. Allowed types: JPEG, PNG, WebP, PDF",
      });
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setErrors({
        ...errors,
        file: "File size exceeds 10MB limit",
      });
      return;
    }

    setSelectedFile(file);
    setErrors({ ...errors, file: undefined });

    // Create preview for images
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      // For PDFs, just show a placeholder
      setPreviewUrl(null);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setPreviewUrl(currentImageUrl || null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    // Validate
    const newErrors: { docNumber?: string; file?: string } = {};

    // Document number validation (optional, but if provided should be valid)
    if (docNumber && docNumber.trim().length > 0) {
      if (docNumber.trim().length < 3) {
        newErrors.docNumber = "Document number must be at least 3 characters";
      }
    }

    // At least one field must be changed
    const docNumberChanged = docNumber !== (currentDocNumber || "");
    const fileChanged = selectedFile !== null;

    if (!docNumberChanged && !fileChanged) {
      // No changes, just close
      onClose();
      return;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Call onSave: always send current doc number so it's persisted (and not lost when only image changes)
    await onSave({
      docNumber: docNumber.trim() ? docNumber.trim() : undefined,
      file: fileChanged ? selectedFile || undefined : undefined,
    });
  };

  const getDocTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      aadhaar: "Aadhaar Card",
      pan: "PAN Card",
      dl: "Driving License",
      rc: "RC (Registration Certificate)",
      selfie: "Selfie",
      rental_proof: "Rental Proof",
      ev_proof: "EV Proof",
    };
    return labels[type] || type;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-gray-800/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90dvh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 shrink-0">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 truncate pr-2">
            Edit {getDocTypeLabel(docType)}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
            aria-label="Close modal"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 flex-1 min-h-0">
          {/* Document Number - optional for selfie, profile_photo, bank proof */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Document number {["selfie", "profile_photo", "bank_proof", "vehicle_image", "upi_qr_proof"].includes(docType) ? "(optional — not required)" : "(optional)"}
            </label>
            <input
              type="text"
              value={docNumber}
              onChange={(e) => {
                setDocNumber(e.target.value);
                setErrors({ ...errors, docNumber: undefined });
              }}
              placeholder={["selfie", "profile_photo"].includes(docType) ? "Leave blank for selfie" : `Enter ${getDocTypeLabel(docType)} number`}
              className={`w-full px-4 py-2.5 sm:py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-400 text-base ${
                errors.docNumber ? "border-red-500" : "border-gray-300"
              }`}
            />
            {errors.docNumber && (
              <p className="mt-1 text-sm text-red-600">{errors.docNumber}</p>
            )}
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Document Image
            </label>
            <div className="space-y-3 sm:space-y-4">
              {/* Current/Preview Image */}
              {previewUrl && (
                <div className="relative border-2 border-dashed border-gray-300 rounded-xl p-3 sm:p-4 bg-gray-50/50">
                  <div className="flex items-center justify-center min-h-[120px] sm:min-h-[160px]">
                    {previewUrl && !previewUrl.startsWith("data:") ? (
                      <img
                        src={previewUrl}
                        alt="Current document"
                        className="max-h-48 sm:max-h-64 rounded-lg shadow-sm object-contain"
                      />
                    ) : previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="max-h-48 sm:max-h-64 rounded-lg shadow-sm object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center py-6 sm:py-8 text-gray-400">
                        <FileText className="h-10 w-10 sm:h-12 sm:w-12 mb-2" />
                        <p className="text-sm">PDF Document</p>
                      </div>
                    )}
                  </div>
                  {selectedFile && (
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow"
                      aria-label="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}

              {/* File Input */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  id="document-file-input"
                />
                <label
                  htmlFor="document-file-input"
                  className="flex items-center justify-center gap-2 px-4 py-3 sm:py-3.5 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors text-gray-700"
                >
                  <Upload className="h-5 w-5 text-gray-500 shrink-0" />
                  <span className="text-sm font-medium">
                    {selectedFile ? "Change File" : "Upload New File"}
                  </span>
                </label>
                {selectedFile && (
                  <p className="mt-2 text-sm text-gray-600 break-all">
                    Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
                {errors.file && (
                  <p className="mt-1 text-sm text-red-600">{errors.file}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Allowed: JPEG, PNG, WebP, PDF (Max 10MB)
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 p-4 sm:p-6 border-t border-gray-200 bg-gray-50 shrink-0 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2.5 sm:py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
          <LoadingButton
            onClick={handleSave}
            loading={isLoading}
            loadingText="Updating..."
            className="px-4 py-2.5 sm:py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Save Changes
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}
