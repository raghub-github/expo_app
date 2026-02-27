"use client";

import dynamic from "next/dynamic";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Store,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Clock,
  Copy,
  ChevronDown,
  ChevronRight,
  Pencil,
  Save,
  FileText,
  ExternalLink,
} from "lucide-react";
import { VerificationPageSkeleton } from "./VerificationPageSkeleton";

const VerificationLocationMap = dynamic(
  () =>
    import("@/components/verification/VerificationLocationMap").then((m) => ({
      default: m.VerificationLocationMap,
    })),
  { ssr: false, loading: () => <div className="h-48 rounded bg-gray-100 animate-pulse" /> }
);

const ONBOARDING_STEP_LABELS: Record<number, string> = {
  1: "Restaurant information",
  2: "Location details",
  3: "Menu setup",
  4: "Restaurant documents",
  5: "Operational details",
  6: "Commission plan",
  7: "Sign & submit",
};

interface StoreDetail {
  id: number;
  store_id: string;
  name: string;
  city: string | null;
  approval_status: string;
  store_name?: string;
  store_display_name?: string | null;
  full_address?: string | null;
  store_email?: string | null;
  created_at?: string | null;
  current_onboarding_step?: number | null;
  onboarding_completed?: boolean | null;
}

interface VerificationDataStore {
  store_name?: string | null;
  store_display_name?: string | null;
  store_description?: string | null;
  store_email?: string | null;
  store_phones?: string[] | null;
  full_address?: string | null;
  landmark?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  logo_url?: string | null;
  banner_url?: string | null;
  gallery_images?: string[] | null;
  cuisine_types?: string[] | null;
  food_categories?: string[] | null;
  avg_preparation_time_minutes?: number | null;
  min_order_amount?: number | null;
  delivery_radius_km?: number | null;
  is_pure_veg?: boolean | null;
  accepts_online_payment?: boolean | null;
  accepts_cash?: boolean | null;
  store_type?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
}

type StepVerification = {
  verified_at: string | null;
  verified_by: number | null;
  verified_by_name: string | null;
  notes: string | null;
};

type StepEditRecord = {
  field_key: string;
  old_value: string | null;
  new_value: string | null;
  edited_by: number | null;
  edited_by_name: string | null;
  edited_at: string;
};

export type MenuMediaFile = {
  id: number;
  store_id: number;
  media_scope: string;
  original_file_name: string | null;
  r2_key: string;
  public_url: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  verification_status: string;
  created_at: string;
};

const DOC_TYPES = ["pan", "gst", "aadhaar", "fssai", "drug_license"] as const;
const DOC_TYPE_LABELS: Record<(typeof DOC_TYPES)[number], string> = {
  pan: "PAN",
  gst: "GST",
  aadhaar: "Aadhaar",
  fssai: "FSSAI",
  drug_license: "Drug license",
};

function DocVerifyButton({
  storeId,
  docType,
  isVerified,
  onSuccess,
}: {
  storeId: number;
  docType: (typeof DOC_TYPES)[number];
  isVerified: boolean;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/documents/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType, action: "verify" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) onSuccess();
    } finally {
      setLoading(false);
    }
  };

  if (isVerified) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
        <CheckCircle className="h-3 w-3" />
        Verified
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={loading}
      onClick={handleVerify}
      className="inline-flex cursor-pointer items-center gap-1 rounded border border-amber-500 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
      Verify
    </button>
  );
}

function DocRejectButton({
  storeId,
  docType,
  isRejected,
  rejectionReason,
  docLabel,
  onSuccess,
}: {
  storeId: number;
  docType: (typeof DOC_TYPES)[number];
  isRejected: boolean;
  rejectionReason: string | null;
  docLabel: string;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState("");

  const handleRejectClick = () => {
    setReason("");
    setModalOpen(true);
  };

  const handleRejectSubmit = async () => {
    const trimmed = reason.trim();
    setLoading(true);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/documents/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docType,
          action: "reject",
          rejection_reason: trimmed || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setModalOpen(false);
        onSuccess();
      }
    } finally {
      setLoading(false);
    }
  };

  if (isRejected) {
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        <span className="inline-flex items-center gap-0.5 rounded bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800">
          <XCircle className="h-3 w-3" />
          Rejected
        </span>
        {rejectionReason && (
          <span className="max-w-[220px] text-[10px] text-red-700" title={rejectionReason}>
            Reason: {rejectionReason}
          </span>
        )}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        disabled={loading}
        onClick={handleRejectClick}
        className="inline-flex cursor-pointer items-center gap-1 rounded border border-red-400 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
        Reject
      </button>
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !loading && setModalOpen(false)}>
          <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <p className="mb-2 text-sm font-medium text-gray-900">Reject {docLabel}</p>
            <p className="mb-2 text-xs text-gray-500">Reason will be saved and shown to the store. (Required so they know why it was rejected.)</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Document unclear, wrong type, expired..."
              className="mb-3 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              rows={3}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !loading && setModalOpen(false)}
                className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading || !reason.trim()}
                onClick={handleRejectSubmit}
                className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DocFileUpload({
  storeId,
  docType,
  currentUrl,
  onSuccess,
}: {
  storeId: number;
  docType: (typeof DOC_TYPES)[number];
  currentUrl: string | null | undefined;
  onSuccess: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("docType", docType);
      const res = await fetch(`/api/merchant/stores/${storeId}/documents/upload`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        onSuccess();
        if (inputRef.current) inputRef.current.value = "";
      } else {
        setError(data?.error || "Upload failed");
      }
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 py-0.5">
      {currentUrl && (
        <a
          href={currentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-indigo-700"
        >
          <ExternalLink className="h-3 w-3" />
          Open
        </a>
      )}
      <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-gray-300 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-100">
        {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
        <span>{currentUrl ? "Replace" : "Upload"} image/PDF</span>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf"
          onChange={handleFile}
          disabled={uploading}
          className="hidden"
        />
      </label>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </div>
  );
}

function MenuFileUpload({
  storeId,
  existingFileCount,
  onSuccess,
}: {
  storeId: number;
  existingFileCount: number;
  onSuccess: () => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const doUpload = async (replace: boolean) => {
    if (!selectedFile) return;
    setUploadError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      if (replace) form.append("replace", "true");
      const res = await fetch(`/api/merchant/stores/${storeId}/media/upload`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setSelectedFile(null);
        setShowReplaceConfirm(false);
        if (inputRef.current) inputRef.current.value = "";
        onSuccess();
      } else {
        setUploadError(data?.error || "Upload failed");
      }
    } catch {
      setUploadError("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setSelectedFile(file || null);
    setUploadError(null);
  };

  const handleSaveClick = () => {
    if (!selectedFile) return;
    if (existingFileCount > 0) {
      setShowReplaceConfirm(true);
    } else {
      doUpload(false);
    }
  };

  const handleReplaceConfirm = () => {
    doUpload(true);
  };

  return (
    <div className="mt-3 border-t border-gray-100 pt-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Upload menu file</p>
      <p className="mb-1 text-[10px] text-gray-500">Images (PNG, JPG), CSV, or XLS — max 15 MB</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,image/*,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={handleFileChange}
          disabled={uploading}
          className="block w-full max-w-xs text-xs file:mr-2 file:rounded file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-indigo-700 file:text-xs"
        />
        {selectedFile && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="max-w-[180px] truncate text-xs text-gray-600" title={selectedFile.name}>
              {selectedFile.name}
            </span>
            <button
              type="button"
              disabled={uploading}
              onClick={handleSaveClick}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </button>
          </div>
        )}
        {uploading && !selectedFile && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
      </div>
      {uploadError && <p className="mt-1 text-xs text-red-600">{uploadError}</p>}

      {/* Replace confirmation modal */}
      {showReplaceConfirm && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="replace-menu-title"
        >
          <div className="relative w-full max-w-sm rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 id="replace-menu-title" className="text-base font-semibold text-gray-900">
                Replace menu file
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Existing menu file(s) will be removed and replaced by the new file. This cannot be undone.
              </p>
              {selectedFile && (
                <p className="mt-1 text-xs text-gray-500">
                  New file: <span className="font-medium text-gray-700">{selectedFile.name}</span>
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3">
              <button
                type="button"
                onClick={() => setShowReplaceConfirm(false)}
                disabled={uploading}
                className="cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={handleReplaceConfirm}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Yes, save & replace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Format time string (HH:MM:SS or HH:MM) to HH:MM */
function formatTime(v: unknown): string {
  if (v == null) return "—";
  const s = String(v).trim();
  if (!s) return "—";
  const part = s.split(":").slice(0, 2).join(":");
  return part || "—";
}

function OperatingHoursBlock({ oh }: { oh: Record<string, unknown> | null }) {
  if (!oh) return <p className="text-xs text-gray-500">No operating hours set.</p>;
  const is24 = !!oh.is_24_hours;
  const sameAll = !!oh.same_for_all_days;
  const closed = (oh.closed_days as string[] | null) ?? [];
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
  const dayLabels: Record<string, string> = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun" };
  if (is24) return <p className="text-xs text-gray-900">Open 24 hours</p>;
  const openDays = days.filter((d) => !closed.includes(d) && !!oh[`${d}_open`]);
  return (
    <div className="space-y-1 text-xs">
      {closed.length > 0 && (
        <p className="text-gray-500">Closed: {closed.map((d) => dayLabels[d] ?? d).join(", ")}</p>
      )}
      {openDays.length === 0 && closed.length === 0 && <p className="text-gray-500">No hours set</p>}
      {openDays.map((day) => {
        const open = !!oh[`${day}_open`];
        if (!open) return null;
        const s1Start = formatTime(oh[`${day}_slot1_start`]);
        const s1End = formatTime(oh[`${day}_slot1_end`]);
        const s2Start = formatTime(oh[`${day}_slot2_start`]);
        const s2End = formatTime(oh[`${day}_slot2_end`]);
        const slot1 = s1Start !== "—" && s1End !== "—" ? `${s1Start} – ${s1End}` : null;
        const slot2 = s2Start !== "—" && s2End !== "—" ? `${s2Start} – ${s2End}` : null;
        const text = [slot1, slot2].filter(Boolean).join(", ");
        return (
          <div key={day} className="flex gap-2">
            <span className="w-12 shrink-0 font-medium text-gray-500">{dayLabels[day]}</span>
            <span className="text-gray-900">{text || "—"}</span>
          </div>
        );
      })}
      {sameAll && <p className="text-[10px] text-gray-500">Same for all days</p>}
    </div>
  );
}

function StepDetailContent({
  stepNum,
  store,
  documents,
  menuFiles,
  operatingHours,
  onboardingPayments,
  agreementAcceptance,
}: {
  stepNum: number;
  store: VerificationDataStore;
  documents: Record<string, unknown> | null;
  menuFiles?: MenuMediaFile[];
  operatingHours?: Record<string, unknown> | null;
  onboardingPayments?: Record<string, unknown>[];
  agreementAcceptance?: Record<string, unknown> | null;
}) {
  const row = (label: string, value: React.ReactNode) => (
    <div key={label} className="flex gap-2 py-0.5 text-xs">
      <span className="w-36 shrink-0 font-medium text-gray-500">{label}</span>
      <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-gray-900">{value ?? "—"}</span>
    </div>
  );

  if (stepNum === 1) {
    const logoUrl = store.logo_url as string | null | undefined;
    const bannerUrl = store.banner_url as string | null | undefined;
    const gallery = (store.gallery_images as string[] | null | undefined) ?? [];
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Restaurant information</p>
        {row("Store name", store.store_name)}
        {row("Display name", store.store_display_name)}
        {row("Description", store.store_description)}
        {row("Store type", store.store_type)}
        {row("Email", store.store_email)}
        {row("Phones", Array.isArray(store.store_phones) ? store.store_phones.join(", ") : null)}
        {(logoUrl || bannerUrl || gallery.length > 0) && (
          <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
            <p className="mb-1 text-[10px] font-semibold uppercase text-gray-500">Logo, banner & gallery</p>
            {logoUrl && (
              <div>
                <p className="mb-0.5 text-[10px] font-medium text-gray-500">Logo</p>
                <img src={logoUrl} alt="Store logo" className="h-20 w-20 rounded-lg border border-gray-200 object-cover" />
              </div>
            )}
            {bannerUrl && (
              <div>
                <p className="mb-0.5 text-[10px] font-medium text-gray-500">Banner</p>
                <img src={bannerUrl} alt="Store banner" className="max-h-32 w-full max-w-sm rounded-lg border border-gray-200 object-cover" />
              </div>
            )}
            {gallery.length > 0 && (
              <div>
                <p className="mb-0.5 text-[10px] font-medium text-gray-500">Gallery images</p>
                <div className="flex flex-wrap gap-2">
                  {gallery.slice(0, 6).map((url, i) => (
                    <img key={i} src={url} alt={`Gallery ${i + 1}`} className="h-16 w-16 rounded border border-gray-200 object-cover" />
                  ))}
                  {gallery.length > 6 && <span className="flex items-center text-[10px] text-gray-500">+{gallery.length - 6} more</span>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
  if (stepNum === 2) {
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Location details</p>
        {row("Full address", store.full_address)}
        {row("Landmark", store.landmark)}
        {row("City", store.city)}
        {row("State", store.state)}
        {row("Postal code", store.postal_code)}
        {row("Country", store.country)}
        {row("Latitude", store.latitude != null ? String(store.latitude) : null)}
        {row("Longitude", store.longitude != null ? String(store.longitude) : null)}
      </div>
    );
  }
  if (stepNum === 3) {
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Menu setup</p>
        {row("Cuisine types", Array.isArray(store.cuisine_types) ? store.cuisine_types.join(", ") : null)}
        {menuFiles && menuFiles.length > 0 && (
          <div className="mt-3 border-t border-gray-100 pt-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Menu files (images, CSV, XLS)</p>
            <ul className="space-y-1.5">
              {menuFiles.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 rounded border border-gray-200 bg-gray-50/50 px-2 py-1.5 text-xs">
                  <span className="min-w-0 truncate font-medium text-gray-700">
                    {f.original_file_name || f.r2_key || `File ${f.id}`}
                  </span>
                  <a
                    href={f.public_url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-700 disabled:pointer-events-none disabled:opacity-50"
                    onClick={(e) => !f.public_url && e.preventDefault()}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-1 text-[10px] text-gray-500">Menu items are managed in the store dashboard.</p>
      </div>
    );
  }
  if (stepNum === 4) {
    const doc = documents || {};
    const entries: Array<{ label: string; numberKey: string; urlKey: string; verifiedKey: string }> = [
      { label: "PAN number", numberKey: "pan_document_number", urlKey: "pan_document_url", verifiedKey: "pan_is_verified" },
      { label: "GST number", numberKey: "gst_document_number", urlKey: "gst_document_url", verifiedKey: "gst_is_verified" },
      { label: "Aadhaar number", numberKey: "aadhaar_document_number", urlKey: "aadhaar_document_url", verifiedKey: "aadhaar_is_verified" },
      { label: "FSSAI number", numberKey: "fssai_document_number", urlKey: "fssai_document_url", verifiedKey: "fssai_is_verified" },
      { label: "Drug license", numberKey: "drug_license_document_number", urlKey: "drug_license_document_url", verifiedKey: "drug_license_is_verified" },
    ];
    const dynamicEntries = entries.filter(
      (e) => (doc[e.numberKey] != null && String(doc[e.numberKey]).trim() !== "") || doc[e.urlKey]
    );
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1 text-[10px] font-semibold uppercase text-gray-500">Restaurant documents</p>
        {dynamicEntries.length === 0 ? (
          <p className="py-1 text-xs text-gray-500">No document records for this store.</p>
        ) : (
          <>
            {dynamicEntries.map((e) => (
              <div key={e.numberKey} className="flex flex-wrap items-center gap-2 py-0.5">
                <div className="flex gap-2 text-xs min-w-0 flex-1">
                  <span className="w-28 shrink-0 font-medium text-gray-500">{e.label}</span>
                  <span className="text-gray-900">{(doc[e.numberKey] as string) ?? "—"}</span>
                  {doc[e.verifiedKey] && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-medium text-emerald-800">
                      Verified
                    </span>
                  )}
                </div>
                {doc[e.urlKey] && (
                  <a
                    href={doc[e.urlKey] as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-0.5 rounded bg-indigo-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-indigo-700"
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                    Open
                  </a>
                )}
              </div>
            ))}
            {doc.fssai_expiry_date && dynamicEntries.some((e) => e.numberKey === "fssai_document_number") && (
              <div className="flex gap-2 py-0.5 text-xs">
                <span className="w-28 shrink-0 font-medium text-gray-500">FSSAI expiry</span>
                <span className="text-gray-900">{new Date(doc.fssai_expiry_date as string).toLocaleDateString()}</span>
              </div>
            )}
          </>
        )}
      </div>
    );
  }
  if (stepNum === 5) {
    return (
      <div className="mt-2 border-t border-gray-200 pt-2 space-y-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Operational details</p>
        {row("Logo", store.logo_url ? "Uploaded" : null)}
        {row("Banner", store.banner_url ? "Uploaded" : null)}
        {row("Min order (₹)", store.min_order_amount != null ? String(store.min_order_amount) : null)}
        {row("Delivery radius (km)", store.delivery_radius_km != null ? String(store.delivery_radius_km) : null)}
        {row("Avg prep (min)", store.avg_preparation_time_minutes != null ? String(store.avg_preparation_time_minutes) : null)}
        {row("Pure veg", store.is_pure_veg != null ? (store.is_pure_veg ? "Yes" : "No") : null)}
        {row("Online payment", store.accepts_online_payment != null ? (store.accepts_online_payment ? "Yes" : "No") : null)}
        {row("Accepts cash", store.accepts_cash != null ? (store.accepts_cash ? "Yes" : "No") : null)}
        <div className="border-t border-gray-100 pt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase text-gray-500">Store timings</p>
          <OperatingHoursBlock oh={operatingHours ?? null} />
        </div>
      </div>
    );
  }
  if (stepNum === 6) {
    const payments = onboardingPayments ?? [];
    const statusBadge = (status: string) => {
      const s = (status || "").toLowerCase();
      const green = s === "captured" || s === "authorized";
      const red = s === "failed" || s === "cancelled" || s === "refunded";
      const cls = green ? "bg-emerald-100 text-emerald-800" : red ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800";
      return <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{status}</span>;
    };
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Commission plan — verify payment</p>
        {payments.length === 0 ? (
          <p className="text-xs text-gray-600">No payment record for this store.</p>
        ) : (
          <div className="space-y-3">
            {payments.map((p, i) => {
              const id = (p.id as number) ?? i;
              const amountPaise = (p.amount_paise as number) ?? 0;
              const planName = (p.plan_name as string) ?? "—";
              const status = (p.status as string) ?? "—";
              const createdAt = (p.created_at as string) ?? "—";
              const capturedAt = (p.captured_at as string) ?? null;
              const failedAt = (p.failed_at as string) ?? null;
              const failureReason = (p.failure_reason as string) ?? null;
              const razorpayOrderId = (p.razorpay_order_id as string) ?? null;
              const razorpayPaymentId = (p.razorpay_payment_id as string) ?? null;
              const payerName = (p.payer_name as string) ?? null;
              const payerEmail = (p.payer_email as string) ?? null;
              const payerPhone = (p.payer_phone as string) ?? null;
              const standardPaise = (p.standard_amount_paise as number) ?? null;
              const promoPaise = (p.promo_amount_paise as number) ?? null;
              const promoLabel = (p.promo_label as string) ?? null;
              return (
                <div key={id} className="rounded border border-gray-200 bg-gray-50/50 p-3 text-xs">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-700">Payment #{id}</span>
                    {statusBadge(status)}
                  </div>
                  {row("Plan", planName)}
                  {row("Amount", `${(amountPaise / 100).toFixed(2)} ${(p.currency as string) ?? "INR"}`)}
                  {standardPaise != null && row("Standard (paise)", String(standardPaise))}
                  {promoPaise != null && row("Promo (paise)", promoLabel ? `${promoPaise} (${promoLabel})` : String(promoPaise))}
                  {row("Created", typeof createdAt === "string" ? createdAt : "—")}
                  {capturedAt && row("Captured at", capturedAt)}
                  {failedAt && row("Failed at", failedAt)}
                  {failureReason && row("Failure reason", failureReason)}
                  {razorpayOrderId && row("Razorpay order ID", razorpayOrderId)}
                  {razorpayPaymentId && row("Razorpay payment ID", razorpayPaymentId)}
                  {(payerName || payerEmail || payerPhone) && (
                    <>
                      {payerName && row("Payer name", payerName)}
                      {payerEmail && row("Payer email", payerEmail)}
                      {payerPhone && row("Payer phone", payerPhone)}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
  if (stepNum === 7) {
    const agg = agreementAcceptance ?? null;
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Sign & submit — verify agreement & signature</p>
        {!agg ? (
          <p className="text-xs text-gray-600">No agreement record for this store.</p>
        ) : (
          <div className="space-y-3 text-xs">
            {(agg.contract_pdf_url as string) && (
              <div className="flex items-center gap-2">
                <a
                  href={agg.contract_pdf_url as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded border border-indigo-600 bg-indigo-50 px-2.5 py-1.5 font-medium text-indigo-700 hover:bg-indigo-100"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open contract PDF
                </a>
              </div>
            )}
            {row("Signer name", agg.signer_name as string)}
            {row("Signer email", agg.signer_email as string)}
            {row("Signer phone", agg.signer_phone as string)}
            {row("Accepted at", typeof agg.accepted_at === "string" ? agg.accepted_at : "—")}
            {row("Terms accepted", agg.terms_accepted === true ? "Yes" : "No")}
            {row("Contract read confirmed", agg.contract_read_confirmed === true ? "Yes" : "No")}
            {agg.commission_first_month_pct != null && row("Commission (1st month %)", String(agg.commission_first_month_pct))}
            {agg.commission_from_second_month_pct != null && row("Commission (from 2nd month %)", String(agg.commission_from_second_month_pct))}
            {agg.agreement_effective_from != null && row("Effective from", typeof agg.agreement_effective_from === "string" ? agg.agreement_effective_from : "—")}
            {agg.agreement_effective_to != null && row("Effective to", typeof agg.agreement_effective_to === "string" ? agg.agreement_effective_to : "—")}
            {(agg.signature_data_url as string) && (
              <div className="pt-1">
                <p className="mb-1 font-medium text-gray-500">Signature</p>
                <img src={agg.signature_data_url as string} alt="Signature" className="max-h-24 rounded border border-gray-200 bg-white object-contain" />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
  return null;
}

/** Single field row: read-only value + Edit button, or (when editing) input + Save button. */
function FieldWithEditSave({
  fieldKey,
  label,
  displayValue,
  isEditing,
  onStartEdit,
  onSave,
  saving,
  editNode,
}: {
  fieldKey: string;
  label: string;
  displayValue: React.ReactNode;
  isEditing: boolean;
  onStartEdit: () => void;
  onSave: () => void | Promise<void>;
  saving: boolean;
  editNode: React.ReactNode;
}) {
  return (
    <div key={fieldKey} className="flex flex-col gap-1 py-1.5 text-xs">
      <label className="font-medium text-gray-500">{label}</label>
      <div className="flex items-center gap-2">
        {isEditing ? (
          <>
            <div className="min-w-0 flex-1">{editNode}</div>
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving}
              className="inline-flex cursor-pointer shrink-0 items-center gap-1 rounded border border-indigo-600 bg-indigo-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 text-gray-900">{displayValue ?? "—"}</span>
            <button
              type="button"
              onClick={onStartEdit}
              className="inline-flex cursor-pointer shrink-0 items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function StepDetailContentEditable({
  stepNum,
  form,
  onChange,
  editingField,
  onStartEdit,
  onSaveField,
  savingField,
  menuFiles,
  storeIdForUpload,
  onMenuUploadComplete,
  storeIdForDocUpload,
  onDocumentsUpdated,
  operatingHours,
  onboardingPayments,
  agreementAcceptance,
}: {
  stepNum: number;
  form: VerificationDataStore & { documents?: Record<string, unknown> | null };
  onChange: (updates: Partial<VerificationDataStore>) => void;
  editingField: string | null;
  onStartEdit: (fieldKey: string) => void;
  onSaveField: (fieldKey: string) => void | Promise<void>;
  savingField: string | null;
  menuFiles?: MenuMediaFile[];
  storeIdForUpload?: number;
  onMenuUploadComplete?: () => void;
  storeIdForDocUpload?: number;
  onDocumentsUpdated?: () => void;
  operatingHours?: Record<string, unknown> | null;
  onboardingPayments?: Record<string, unknown>[];
  agreementAcceptance?: Record<string, unknown> | null;
}) {
  const set = (key: keyof VerificationDataStore, value: unknown) => {
    onChange({ [key]: value });
  };
  const inputCls =
    "w-full rounded border border-gray-300 px-2 py-1.5 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  if (stepNum === 1) {
    const fields: Array<{ key: string; label: string; display: React.ReactNode; editNode: React.ReactNode }> = [
      {
        key: "store_name",
        label: "Store name",
        display: form.store_name ?? "",
        editNode: (
          <input
            type="text"
            value={(form.store_name as string) ?? ""}
            onChange={(e) => set("store_name", e.target.value)}
            className={inputCls}
          />
        ),
      },
      {
        key: "store_display_name",
        label: "Display name",
        display: form.store_display_name ?? "",
        editNode: (
          <input
            type="text"
            value={(form.store_display_name as string) ?? ""}
            onChange={(e) => set("store_display_name", e.target.value)}
            className={inputCls}
          />
        ),
      },
      {
        key: "store_description",
        label: "Description",
        display: (form.store_description as string) ? String(form.store_description).slice(0, 80) + (String(form.store_description).length > 80 ? "…" : "") : "—",
        editNode: (
          <textarea
            rows={2}
            value={(form.store_description as string) ?? ""}
            onChange={(e) => set("store_description", e.target.value)}
            className={inputCls}
          />
        ),
      },
      {
        key: "store_type",
        label: "Store type",
        display: form.store_type ?? "",
        editNode: (
          <input
            type="text"
            value={(form.store_type as string) ?? ""}
            onChange={(e) => set("store_type", e.target.value)}
            placeholder="e.g. RESTAURANT"
            className={inputCls}
          />
        ),
      },
      {
        key: "store_email",
        label: "Email",
        display: form.store_email ?? "",
        editNode: (
          <input
            type="text"
            value={(form.store_email as string) ?? ""}
            onChange={(e) => set("store_email", e.target.value)}
            className={inputCls}
          />
        ),
      },
      {
        key: "store_phones",
        label: "Phones",
        display: Array.isArray(form.store_phones) ? form.store_phones.join(", ") : "—",
        editNode: (
          <input
            type="text"
            value={Array.isArray(form.store_phones) ? form.store_phones.join(", ") : ""}
            onChange={(e) => set("store_phones", e.target.value.split(/[\s,]+/).filter(Boolean))}
            className={inputCls}
          />
        ),
      },
    ];
    const logoUrl = form.logo_url as string | null | undefined;
    const bannerUrl = form.banner_url as string | null | undefined;
    const gallery = (form.gallery_images as string[] | null | undefined) ?? [];
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Restaurant information</p>
        {fields.map((f) => (
          <FieldWithEditSave
            key={f.key}
            fieldKey={f.key}
            label={f.label}
            displayValue={f.display}
            isEditing={editingField === f.key}
            onStartEdit={() => onStartEdit(f.key)}
            onSave={() => onSaveField(f.key)}
            saving={savingField === f.key}
            editNode={f.editNode}
          />
        ))}
        {(logoUrl || bannerUrl || gallery.length > 0) && (
          <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
            <p className="mb-1 text-[10px] font-semibold uppercase text-gray-500">Logo, banner & gallery</p>
            {logoUrl && (
              <div>
                <p className="mb-0.5 text-[10px] font-medium text-gray-500">Logo</p>
                <img src={logoUrl} alt="Store logo" className="h-20 w-20 rounded-lg border border-gray-200 object-cover" />
              </div>
            )}
            {bannerUrl && (
              <div>
                <p className="mb-0.5 text-[10px] font-medium text-gray-500">Banner</p>
                <img src={bannerUrl} alt="Store banner" className="max-h-32 w-full max-w-sm rounded-lg border border-gray-200 object-cover" />
              </div>
            )}
            {gallery.length > 0 && (
              <div>
                <p className="mb-0.5 text-[10px] font-medium text-gray-500">Gallery images</p>
                <div className="flex flex-wrap gap-2">
                  {gallery.slice(0, 6).map((url, i) => (
                    <img key={i} src={url} alt={`Gallery ${i + 1}`} className="h-16 w-16 rounded border border-gray-200 object-cover" />
                  ))}
                  {gallery.length > 6 && <span className="flex items-center text-[10px] text-gray-500">+{gallery.length - 6} more</span>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
  if (stepNum === 2) {
    const fields: Array<{ key: string; label: string; display: React.ReactNode; editNode: React.ReactNode }> = [
      { key: "full_address", label: "Full address", display: form.full_address ?? "—", editNode: <textarea rows={2} value={(form.full_address as string) ?? ""} onChange={(e) => set("full_address", e.target.value)} className={inputCls} /> },
      { key: "landmark", label: "Landmark", display: form.landmark ?? "—", editNode: <input type="text" value={(form.landmark as string) ?? ""} onChange={(e) => set("landmark", e.target.value)} className={inputCls} /> },
      { key: "city", label: "City", display: form.city ?? "—", editNode: <input type="text" value={(form.city as string) ?? ""} onChange={(e) => set("city", e.target.value)} className={inputCls} /> },
      { key: "state", label: "State", display: form.state ?? "—", editNode: <input type="text" value={(form.state as string) ?? ""} onChange={(e) => set("state", e.target.value)} className={inputCls} /> },
      { key: "postal_code", label: "Postal code", display: form.postal_code ?? "—", editNode: <input type="text" value={(form.postal_code as string) ?? ""} onChange={(e) => set("postal_code", e.target.value)} className={inputCls} /> },
      { key: "country", label: "Country", display: form.country ?? "—", editNode: <input type="text" value={(form.country as string) ?? ""} onChange={(e) => set("country", e.target.value)} className={inputCls} /> },
      { key: "latitude", label: "Latitude", display: form.latitude != null ? String(form.latitude) : "—", editNode: <input type="number" value={form.latitude ?? ""} onChange={(e) => set("latitude", e.target.value === "" ? null : Number(e.target.value))} className={inputCls} /> },
      { key: "longitude", label: "Longitude", display: form.longitude != null ? String(form.longitude) : "—", editNode: <input type="number" value={form.longitude ?? ""} onChange={(e) => set("longitude", e.target.value === "" ? null : Number(e.target.value))} className={inputCls} /> },
    ];
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Location details</p>
        {fields.map((f) => (
          <FieldWithEditSave key={f.key} fieldKey={f.key} label={f.label} displayValue={f.display} isEditing={editingField === f.key} onStartEdit={() => onStartEdit(f.key)} onSave={() => onSaveField(f.key)} saving={savingField === f.key} editNode={f.editNode} />
        ))}
        <div className="mt-3">
          <p className="mb-1 text-[10px] font-semibold uppercase text-gray-500">Set location on map (Mapbox)</p>
          <VerificationLocationMap
            latitude={form.latitude ?? null}
            longitude={form.longitude ?? null}
            onCoordinatesChange={(lat, lng) => {
              set("latitude", lat);
              set("longitude", lng);
            }}
            onReverseGeocode={(addr) => {
              if (addr.place_name != null) set("full_address", addr.place_name);
              if (addr.city != null) set("city", addr.city);
              if (addr.state != null) set("state", addr.state);
              if (addr.postal_code != null) set("postal_code", addr.postal_code);
              if (addr.country != null) set("country", addr.country);
            }}
            className="mt-1"
          />
        </div>
      </div>
    );
  }
  if (stepNum === 3) {
    const fields: Array<{ key: string; label: string; display: React.ReactNode; editNode: React.ReactNode }> = [
      { key: "cuisine_types", label: "Cuisine types (comma-separated)", display: Array.isArray(form.cuisine_types) ? form.cuisine_types.join(", ") : "—", editNode: <input type="text" value={Array.isArray(form.cuisine_types) ? form.cuisine_types.join(", ") : ""} onChange={(e) => set("cuisine_types", e.target.value.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean))} className={inputCls} /> },
    ];
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Menu setup</p>
        {fields.map((f) => (
          <FieldWithEditSave key={f.key} fieldKey={f.key} label={f.label} displayValue={f.display} isEditing={editingField === f.key} onStartEdit={() => onStartEdit(f.key)} onSave={() => onSaveField(f.key)} saving={savingField === f.key} editNode={f.editNode} />
        ))}
        {menuFiles && menuFiles.length > 0 && (
          <div className="mt-3 border-t border-gray-100 pt-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Menu files (images, CSV, XLS)</p>
            <ul className="space-y-1.5">
              {menuFiles.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 rounded border border-gray-200 bg-gray-50/50 px-2 py-1.5 text-xs">
                  <span className="min-w-0 truncate font-medium text-gray-700">
                    {f.original_file_name || f.r2_key || `File ${f.id}`}
                  </span>
                  <a
                    href={f.public_url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-700 disabled:pointer-events-none disabled:opacity-50"
                    onClick={(e) => !f.public_url && e.preventDefault()}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {stepNum === 3 && storeIdForUpload != null && onMenuUploadComplete && (
          <MenuFileUpload
            storeId={storeIdForUpload}
            existingFileCount={menuFiles?.length ?? 0}
            onSuccess={onMenuUploadComplete}
          />
        )}
        <p className="mt-1 text-[10px] text-gray-500">Menu items are managed in the store dashboard.</p>
      </div>
    );
  }
  if (stepNum === 4) {
    const doc = form.documents ?? {};
    const updateDoc = (key: string, value: string) => {
      onChange({ documents: { ...doc, [key]: value || null } } as Partial<VerificationDataStore>);
    };
    const docKeys = ["pan_document_number", "gst_document_number", "aadhaar_document_number", "fssai_document_number", "drug_license_document_number"] as const;
    const labels: Record<string, string> = { pan_document_number: "PAN number", gst_document_number: "GST number", aadhaar_document_number: "Aadhaar number", fssai_document_number: "FSSAI number", drug_license_document_number: "Drug license" };
    const numberKeyToDocType: Record<string, (typeof DOC_TYPES)[number]> = {
      pan_document_number: "pan",
      gst_document_number: "gst",
      aadhaar_document_number: "aadhaar",
      fssai_document_number: "fssai",
      drug_license_document_number: "drug_license",
    };
    const docTypeToUrlKey: Record<(typeof DOC_TYPES)[number], string> = {
      pan: "pan_document_url",
      gst: "gst_document_url",
      aadhaar: "aadhaar_document_url",
      fssai: "fssai_document_url",
      drug_license: "drug_license_document_url",
    };
    const docTypeToVerifiedKey: Record<(typeof DOC_TYPES)[number], string> = {
      pan: "pan_is_verified",
      gst: "gst_is_verified",
      aadhaar: "aadhaar_is_verified",
      fssai: "fssai_is_verified",
      drug_license: "drug_license_is_verified",
    };
    const docTypeToRejectionKey: Record<(typeof DOC_TYPES)[number], string> = {
      pan: "pan_rejection_reason",
      gst: "gst_rejection_reason",
      aadhaar: "aadhaar_rejection_reason",
      fssai: "fssai_rejection_reason",
      drug_license: "drug_license_rejection_reason",
    };
    const dynamicEntries = docKeys.filter((key) => {
      const docType = numberKeyToDocType[key];
      const urlKey = docType ? docTypeToUrlKey[docType] : null;
      const hasNumber = doc[key] != null && String(doc[key]).trim() !== "";
      const hasUrl = urlKey && doc[urlKey];
      return hasNumber || hasUrl;
    });
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1 text-[10px] font-semibold uppercase text-gray-500">Restaurant documents (only documents with data for this store)</p>
        {dynamicEntries.length === 0 ? (
          <p className="py-2 text-xs text-gray-500">No document records for this store yet. Add numbers or upload files to verify.</p>
        ) : (
          dynamicEntries.map((key) => {
            const docType = numberKeyToDocType[key];
            const urlKey = docType ? docTypeToUrlKey[docType] : null;
            const verifiedKey = docType ? docTypeToVerifiedKey[docType] : null;
            const rejectionKey = docType ? docTypeToRejectionKey[docType] : null;
            const isVerified = verifiedKey ? !!doc[verifiedKey] : false;
            const isRejected = rejectionKey ? !!doc[rejectionKey] : false;
            return (
              <div key={key} className="border-b border-gray-100 pb-1.5 last:border-0">
                <FieldWithEditSave
                  fieldKey={key}
                  label={labels[key]}
                  displayValue={(doc[key] as string) ?? "—"}
                  isEditing={editingField === key}
                  onStartEdit={() => onStartEdit(key)}
                  onSave={() => onSaveField(key)}
                  saving={savingField === key}
                  editNode={<input type="text" value={(doc[key] as string) ?? ""} onChange={(e) => updateDoc(key, e.target.value)} className={inputCls} />}
                />
                {storeIdForDocUpload != null && onDocumentsUpdated && docType && urlKey && (
                  <div className="ml-[5.5rem] mt-0.5 flex flex-wrap items-center gap-2">
                    <DocFileUpload
                      storeId={storeIdForDocUpload}
                      docType={docType}
                      currentUrl={(doc[urlKey] as string) ?? null}
                      onSuccess={onDocumentsUpdated}
                    />
                    <DocVerifyButton
                      storeId={storeIdForDocUpload}
                      docType={docType}
                      isVerified={isVerified}
                      onSuccess={onDocumentsUpdated}
                    />
                    <DocRejectButton
                      storeId={storeIdForDocUpload}
                      docType={docType}
                      isRejected={isRejected}
                      rejectionReason={rejectionKey ? (doc[rejectionKey] as string) ?? null : null}
                      docLabel={labels[key]}
                      onSuccess={onDocumentsUpdated}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
        {doc.fssai_expiry_date && (doc.fssai_document_number || doc.fssai_document_url) && (
          <div className="flex gap-2 py-0.5 text-xs">
            <span className="w-36 shrink-0 font-medium text-gray-500">FSSAI expiry</span>
            <span className="text-gray-900">{new Date(doc.fssai_expiry_date as string).toLocaleDateString()}</span>
          </div>
        )}
      </div>
    );
  }
  if (stepNum === 5) {
    const fields: Array<{ key: string; label: string; display: React.ReactNode; editNode: React.ReactNode }> = [
      { key: "min_order_amount", label: "Min order amount (₹)", display: form.min_order_amount != null ? String(form.min_order_amount) : "—", editNode: <input type="number" value={form.min_order_amount ?? ""} onChange={(e) => set("min_order_amount", e.target.value === "" ? null : Number(e.target.value))} className={inputCls} /> },
      { key: "delivery_radius_km", label: "Delivery radius (km)", display: form.delivery_radius_km != null ? String(form.delivery_radius_km) : "—", editNode: <input type="number" value={form.delivery_radius_km ?? ""} onChange={(e) => set("delivery_radius_km", e.target.value === "" ? null : Number(e.target.value))} className={inputCls} /> },
      { key: "avg_preparation_time_minutes", label: "Avg prep (minutes)", display: form.avg_preparation_time_minutes != null ? String(form.avg_preparation_time_minutes) : "—", editNode: <input type="number" value={form.avg_preparation_time_minutes ?? ""} onChange={(e) => set("avg_preparation_time_minutes", e.target.value === "" ? null : Number(e.target.value))} className={inputCls} /> },
      { key: "is_pure_veg", label: "Pure veg", display: form.is_pure_veg != null ? (form.is_pure_veg ? "Yes" : "No") : "—", editNode: <input type="checkbox" checked={!!form.is_pure_veg} onChange={(e) => set("is_pure_veg", e.target.checked)} className="h-4 w-4 rounded border-gray-300" /> },
      { key: "accepts_online_payment", label: "Accepts online payment", display: form.accepts_online_payment != null ? (form.accepts_online_payment ? "Yes" : "No") : "—", editNode: <input type="checkbox" checked={!!form.accepts_online_payment} onChange={(e) => set("accepts_online_payment", e.target.checked)} className="h-4 w-4 rounded border-gray-300" /> },
      { key: "accepts_cash", label: "Accepts cash", display: form.accepts_cash != null ? (form.accepts_cash ? "Yes" : "No") : "—", editNode: <input type="checkbox" checked={!!form.accepts_cash} onChange={(e) => set("accepts_cash", e.target.checked)} className="h-4 w-4 rounded border-gray-300" /> },
    ];
    return (
      <div className="mt-2 space-y-4 border-t border-gray-200 pt-2">
        <section>
          <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Order & payment</p>
          <div className="space-y-0.5">
            {fields.map((f) => (
              <FieldWithEditSave key={f.key} fieldKey={f.key} label={f.label} displayValue={f.display} isEditing={editingField === f.key} onStartEdit={() => onStartEdit(f.key)} onSave={() => onSaveField(f.key)} saving={savingField === f.key} editNode={f.editNode} />
            ))}
          </div>
          {(form.logo_url || form.banner_url) && (
            <div className="mt-1.5 flex flex-wrap gap-3 text-[10px] text-gray-500">
              {form.logo_url && <span>Logo: Uploaded</span>}
              {form.banner_url && <span>Banner: Uploaded</span>}
            </div>
          )}
        </section>
        <section className="border-t border-gray-100 pt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Store timings</p>
          <OperatingHoursBlock oh={operatingHours ?? null} />
        </section>
      </div>
    );
  }
  if (stepNum === 6) {
    const payments = onboardingPayments ?? [];
    const rowEd = (label: string, value: React.ReactNode) => (
      <div key={label} className="flex gap-2 py-0.5 text-xs">
        <span className="w-40 shrink-0 font-medium text-gray-500">{label}</span>
        <span className="text-gray-900">{value ?? "—"}</span>
      </div>
    );
    const statusBadge = (status: string) => {
      const s = (status || "").toLowerCase();
      const green = s === "captured" || s === "authorized";
      const red = s === "failed" || s === "cancelled" || s === "refunded";
      const cls = green ? "bg-emerald-100 text-emerald-800" : red ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800";
      return <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{status}</span>;
    };
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Commission plan — verify payment</p>
        {payments.length === 0 ? (
          <p className="text-xs text-gray-600">No payment record for this store.</p>
        ) : (
          <div className="space-y-3">
            {payments.map((p, i) => {
              const id = (p.id as number) ?? i;
              const amountPaise = (p.amount_paise as number) ?? 0;
              const planName = (p.plan_name as string) ?? "—";
              const status = (p.status as string) ?? "—";
              const createdAt = (p.created_at as string) ?? "—";
              const capturedAt = (p.captured_at as string) ?? null;
              const failedAt = (p.failed_at as string) ?? null;
              const failureReason = (p.failure_reason as string) ?? null;
              const razorpayOrderId = (p.razorpay_order_id as string) ?? null;
              const razorpayPaymentId = (p.razorpay_payment_id as string) ?? null;
              const payerName = (p.payer_name as string) ?? null;
              const payerEmail = (p.payer_email as string) ?? null;
              const payerPhone = (p.payer_phone as string) ?? null;
              const standardPaise = (p.standard_amount_paise as number) ?? null;
              const promoPaise = (p.promo_amount_paise as number) ?? null;
              const promoLabel = (p.promo_label as string) ?? null;
              return (
                <div key={id} className="rounded border border-gray-200 bg-gray-50/50 p-3 text-xs">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-700">Payment #{id}</span>
                    {statusBadge(status)}
                  </div>
                  {rowEd("Plan", planName)}
                  {rowEd("Amount", `${(amountPaise / 100).toFixed(2)} ${(p.currency as string) ?? "INR"}`)}
                  {standardPaise != null && rowEd("Standard (paise)", String(standardPaise))}
                  {promoPaise != null && rowEd("Promo (paise)", promoLabel ? `${promoPaise} (${promoLabel})` : String(promoPaise))}
                  {rowEd("Created", typeof createdAt === "string" ? createdAt : "—")}
                  {capturedAt && rowEd("Captured at", capturedAt)}
                  {failedAt && rowEd("Failed at", failedAt)}
                  {failureReason && rowEd("Failure reason", failureReason)}
                  {razorpayOrderId && rowEd("Razorpay order ID", razorpayOrderId)}
                  {razorpayPaymentId && rowEd("Razorpay payment ID", razorpayPaymentId)}
                  {(payerName || payerEmail || payerPhone) && (
                    <>
                      {payerName && rowEd("Payer name", payerName)}
                      {payerEmail && rowEd("Payer email", payerEmail)}
                      {payerPhone && rowEd("Payer phone", payerPhone)}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
  if (stepNum === 7) {
    const agg = agreementAcceptance ?? null;
    const rowEd = (label: string, value: React.ReactNode) => (
      <div key={label} className="flex gap-2 py-0.5 text-xs">
        <span className="w-40 shrink-0 font-medium text-gray-500">{label}</span>
        <span className="text-gray-900">{value ?? "—"}</span>
      </div>
    );
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Sign & submit — verify agreement & signature</p>
        {!agg ? (
          <p className="text-xs text-gray-600">No agreement record for this store.</p>
        ) : (
          <div className="space-y-3 text-xs">
            {(agg.contract_pdf_url as string) && (
              <div className="flex items-center gap-2">
                <a
                  href={agg.contract_pdf_url as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded border border-indigo-600 bg-indigo-50 px-2.5 py-1.5 font-medium text-indigo-700 hover:bg-indigo-100"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open contract PDF
                </a>
              </div>
            )}
            {rowEd("Signer name", agg.signer_name as string)}
            {rowEd("Signer email", agg.signer_email as string)}
            {rowEd("Signer phone", agg.signer_phone as string)}
            {rowEd("Accepted at", typeof agg.accepted_at === "string" ? agg.accepted_at : "—")}
            {rowEd("Terms accepted", agg.terms_accepted === true ? "Yes" : "No")}
            {rowEd("Contract read confirmed", agg.contract_read_confirmed === true ? "Yes" : "No")}
            {agg.commission_first_month_pct != null && rowEd("Commission (1st month %)", String(agg.commission_first_month_pct))}
            {agg.commission_from_second_month_pct != null && rowEd("Commission (from 2nd month %)", String(agg.commission_from_second_month_pct))}
            {agg.agreement_effective_from != null && rowEd("Effective from", typeof agg.agreement_effective_from === "string" ? agg.agreement_effective_from : "—")}
            {agg.agreement_effective_to != null && rowEd("Effective to", typeof agg.agreement_effective_to === "string" ? agg.agreement_effective_to : "—")}
            {(agg.signature_data_url as string) && (
              <div className="pt-1">
                <p className="mb-1 font-medium text-gray-500">Signature</p>
                <img src={agg.signature_data_url as string} alt="Signature" className="max-h-24 rounded border border-gray-200 bg-white object-contain" />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
  return null;
}

export function StoreVerificationInner({
  storeId,
  returnTo,
}: {
  storeId: string;
  returnTo: string | null;
}) {
  const router = useRouter();
  const [store, setStore] = useState<StoreDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<"approve" | "reject" | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [stepVerifications, setStepVerifications] = useState<Record<number, StepVerification>>({});
  const [stepEdits, setStepEdits] = useState<Record<number, StepEditRecord[]>>({});
  const [verifyingStep, setVerifyingStep] = useState<number | null>(null);
  const [verificationData, setVerificationData] = useState<{
    store: VerificationDataStore;
    documents: Record<string, unknown> | null;
    operatingHours: Record<string, unknown> | null;
    onboardingPayments: Record<string, unknown>[];
    agreementAcceptance: Record<string, unknown> | null;
  } | null>(null);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [verifyModalStep, setVerifyModalStep] = useState<number | null>(null);
  const [stepEditForm, setStepEditForm] = useState<(VerificationDataStore & { documents?: Record<string, unknown> | null }) | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [editStartValues, setEditStartValues] = useState<Record<string, string>>({});
  const [historyModalStep, setHistoryModalStep] = useState<number | null>(null);
  const [showFinalDecisionModal, setShowFinalDecisionModal] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [copyPhoneSuccess, setCopyPhoneSuccess] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [actionConfirm, setActionConfirm] = useState<{
    stepNum: number;
    action: "verify" | "pending" | "reject";
  } | null>(null);
  const [unverifyingStep, setUnverifyingStep] = useState<number | null>(null);
  const [saveConfirm, setSaveConfirm] = useState<
    { type: "location" } | { type: "field"; fieldKey: string } | null
  >(null);
  const [editConfirmField, setEditConfirmField] = useState<string | null>(null);
  const [menuMediaFiles, setMenuMediaFiles] = useState<MenuMediaFile[]>([]);

  useEffect(() => {
    if (verifyModalStep != null && verificationData) {
      setStepEditForm({
        ...verificationData.store,
        documents: verificationData.documents ?? null,
      });
      setEditingField(null);
      setSavingField(null);
      setEditStartValues({});
    } else {
      setStepEditForm(null);
      setEditingField(null);
      setSavingField(null);
      setEditStartValues({});
    }
  }, [verifyModalStep, verificationData]);

  const refetchMenuMedia = () => {
    if (!store?.id) return;
    fetch(`/api/merchant/stores/${store.id}/media?scope=MENU_REFERENCE`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success && Array.isArray(data.files)) setMenuMediaFiles(data.files);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!store?.id) return;
    const step3Open = verifyModalStep === 3 || expandedStep === 3;
    if (!step3Open) return;
    fetch(`/api/merchant/stores/${store.id}/media?scope=MENU_REFERENCE`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success && Array.isArray(data.files)) setMenuMediaFiles(data.files);
      })
      .catch(() => {});
  }, [store?.id, verifyModalStep, expandedStep]);

  // When step 4 (documents) modal opens, refetch verification data so modal shows latest doc details for this store
  useEffect(() => {
    if (!store?.id || verifyModalStep !== 4) return;
    refetchVerificationData();
  }, [store?.id, verifyModalStep]);

  const getDocSummaryForStore = (): string[] => {
    const doc = verificationData?.documents;
    if (!doc) return [];
    const out: string[] = [];
    if (doc.pan_document_number || doc.pan_document_url) out.push("PAN");
    if (doc.gst_document_number || doc.gst_document_url) out.push("GST");
    if (doc.aadhaar_document_number || doc.aadhaar_document_url) out.push("Aadhaar");
    if (doc.fssai_document_number || doc.fssai_document_url) out.push("FSSAI");
    if (doc.drug_license_document_number || doc.drug_license_document_url) out.push("Drug license");
    return out;
  };

  /** For step 4: true only when every document that has data is individually verified. */
  const allStep4DocumentsVerified = (documents: Record<string, unknown> | null | undefined): boolean => {
    if (!documents) return false;
    const doc = documents as Record<string, unknown>;
    const checks: Array<{ hasData: boolean; verified: boolean }> = [
      {
        hasData: !!(doc.pan_document_number && String(doc.pan_document_number).trim()) || !!doc.pan_document_url,
        verified: !!doc.pan_is_verified,
      },
      {
        hasData: !!(doc.gst_document_number && String(doc.gst_document_number).trim()) || !!doc.gst_document_url,
        verified: !!doc.gst_is_verified,
      },
      {
        hasData: !!(doc.aadhaar_document_number && String(doc.aadhaar_document_number).trim()) || !!doc.aadhaar_document_url,
        verified: !!doc.aadhaar_is_verified,
      },
      {
        hasData: !!(doc.fssai_document_number && String(doc.fssai_document_number).trim()) || !!doc.fssai_document_url,
        verified: !!doc.fssai_is_verified,
      },
      {
        hasData: !!(doc.drug_license_document_number && String(doc.drug_license_document_number).trim()) || !!doc.drug_license_document_url,
        verified: !!doc.drug_license_is_verified,
      },
    ];
    const withData = checks.filter((c) => c.hasData);
    if (withData.length === 0) return true;
    return withData.every((c) => c.verified);
  };

  const copyEmail = () => {
    const email = store?.store_email || verificationData?.store?.store_email;
    if (email && typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(email).then(
        () => {
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 1500);
        },
        () => {
          // ignore copy failure
        }
      );
    }
  };

  const copyPhone = () => {
    const phones = verificationData?.store?.store_phones;
    const text = Array.isArray(phones) && phones.length > 0 ? phones.join(", ") : null;
    if (text && typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => {
          setCopyPhoneSuccess(true);
          setTimeout(() => setCopyPhoneSuccess(false), 1500);
        },
        () => {
          // ignore copy failure
        }
      );
    }
  };

  const backHref = returnTo || "/dashboard/merchants/verifications";

  useEffect(() => {
    let cancelled = false;
    const id = parseInt(storeId, 10);
    if (!Number.isFinite(id)) {
      setError("Invalid store id");
      setLoading(false);
      return () => {};
    }
    fetch(`/api/merchant/stores/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.success && data.store) {
          setStore({
            id: data.store.id,
            store_id: data.store.store_id,
            name: data.store.name,
            city: data.store.city,
            approval_status: data.store.approval_status,
            store_email: data.store.store_email ?? null,
            full_address: data.store.full_address ?? null,
            created_at: data.store.created_at ?? null,
            current_onboarding_step: data.store.current_onboarding_step ?? null,
            onboarding_completed: data.store.onboarding_completed ?? false,
          });
        } else {
          setError("Store not found");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load store");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  useEffect(() => {
    if (!store?.id) return;
    fetch(`/api/merchant/stores/${store.id}/verification-steps`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success && data.steps) {
          setStepVerifications(data.steps);
          setStepEdits(data.edits ?? {});
        }
      })
      .catch(() => {});
  }, [store?.id]);

  useEffect(() => {
    if (!store?.id) return;
    let cancelled = false;
    fetch(`/api/merchant/stores/${store.id}/verification-data`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.success && data.store) {
          setVerificationData({
            store: data.store,
            documents: data.documents ?? null,
            operatingHours: data.operatingHours ?? null,
            onboardingPayments: Array.isArray(data.onboardingPayments) ? data.onboardingPayments : [],
            agreementAcceptance: data.agreementAcceptance ?? null,
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [store?.id]);

  const refetchVerificationData = (): Promise<void> => {
    if (!store?.id) return Promise.resolve();
    return fetch(`/api/merchant/stores/${store.id}/verification-data`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success && data.store) {
          setVerificationData({
            store: data.store,
            documents: data.documents ?? null,
            operatingHours: data.operatingHours ?? null,
            onboardingPayments: Array.isArray(data.onboardingPayments) ? data.onboardingPayments : [],
            agreementAcceptance: data.agreementAcceptance ?? null,
          });
        }
      })
      .catch(() => {});
  };

  const handleVerifyStep = async (stepNumber: number): Promise<boolean> => {
    if (!store) return false;
    setVerifyingStep(stepNumber);
    try {
      const res = await fetch(`/api/merchant/stores/${store.id}/verification-steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: stepNumber }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.steps) {
        setStepVerifications(data.steps);
        if (data.edits) setStepEdits(data.edits);
        return true;
      }
      setError(data.error || "Failed to verify step");
      return false;
    } catch {
      setError("Failed to verify step");
      return false;
    } finally {
      setVerifyingStep(null);
    }
  };

  const handleSetStepPending = async (stepNumber: number): Promise<void> => {
    if (!store) return;
    setUnverifyingStep(stepNumber);
    try {
      const res = await fetch(`/api/merchant/stores/${store.id}/verification-steps`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: stepNumber }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.steps) {
        setStepVerifications(data.steps);
        if (data.edits) setStepEdits(data.edits);
        setVerifyModalStep((prev) => (prev === stepNumber ? null : prev));
        setActionConfirm(null);
      } else {
        setError(data.error || "Failed to set step to pending");
      }
    } catch {
      setError("Failed to set step to pending");
    } finally {
      setUnverifyingStep(null);
    }
  };

  const buildPatchPayloadForStep = (step: number): Record<string, unknown> | null => {
    if (!stepEditForm) return null;
    const f = stepEditForm;
    switch (step) {
      case 1:
        return {
          store_name: f.store_name ?? undefined,
          store_display_name: f.store_display_name ?? undefined,
          store_description: f.store_description ?? undefined,
          store_type: f.store_type ?? undefined,
          store_email: f.store_email ?? undefined,
          store_phones: Array.isArray(f.store_phones) ? f.store_phones : undefined,
        };
      case 2:
        return {
          full_address: f.full_address ?? undefined,
          landmark: f.landmark ?? undefined,
          city: f.city ?? undefined,
          state: f.state ?? undefined,
          postal_code: f.postal_code ?? undefined,
          country: f.country ?? undefined,
          latitude: f.latitude ?? undefined,
          longitude: f.longitude ?? undefined,
        };
      case 3:
        return {
          cuisine_types: Array.isArray(f.cuisine_types) ? f.cuisine_types : undefined,
        };
      case 4:
        return null; // step 4 uses documents PATCH
      case 5:
        return {
          min_order_amount: f.min_order_amount ?? undefined,
          delivery_radius_km: f.delivery_radius_km ?? undefined,
          avg_preparation_time_minutes: f.avg_preparation_time_minutes ?? undefined,
          is_pure_veg: f.is_pure_veg ?? undefined,
          accepts_online_payment: f.accepts_online_payment ?? undefined,
          accepts_cash: f.accepts_cash ?? undefined,
        };
      default:
        return {};
    }
  };

  /** Saves current step edits (store or documents) only. Returns true if save succeeded or nothing to save. */
  const saveStepEdits = async (step: number): Promise<boolean> => {
    if (!store || !stepEditForm) return false;
    if (step === 4 && stepEditForm.documents) {
      const docPayload: Record<string, string | null> = {};
      const docKeys = [
        "pan_document_number",
        "gst_document_number",
        "aadhaar_document_number",
        "fssai_document_number",
        "drug_license_document_number",
      ] as const;
      for (const k of docKeys) {
        const v = stepEditForm.documents[k];
        docPayload[k] = v == null || v === "" ? null : String(v);
      }
      const docRes = await fetch(`/api/merchant/stores/${store.id}/documents`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(docPayload),
      });
      const docData = await docRes.json().catch(() => ({}));
      if (!docRes.ok || !docData?.success) {
        setError(docData?.error || "Failed to save document changes");
        return false;
      }
      return true;
    }
    const patchPayload = buildPatchPayloadForStep(step);
    if (patchPayload === null && step !== 4) return false;
    if (patchPayload != null && Object.keys(patchPayload).length > 0) {
      const patchRes = await fetch(`/api/merchant/stores/${store.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchPayload),
      });
      const patchData = await patchRes.json().catch(() => ({}));
      if (!patchRes.ok || !patchData?.success) {
        setError(patchData?.error || "Failed to save changes");
        return false;
      }
    }
    return true;
  };

  /** Build payload for a single field (for per-field save). */
  const getFieldValueForEdit = (fieldKey: string): string => {
    if (!stepEditForm) return "";
    if (verifyModalStep === 4) {
      const v = stepEditForm.documents?.[fieldKey];
      return v != null && v !== "" ? String(v) : "";
    }
    const f = stepEditForm as Record<string, unknown>;
    const v = f[fieldKey];
    if (Array.isArray(v)) return v.map((x) => String(x)).join(", ");
    if (v == null || v === "") return "";
    return String(v);
  };

  const buildPayloadForField = (step: number, fieldKey: string): Record<string, unknown> | null => {
    if (!stepEditForm) return null;
    const f = stepEditForm as Record<string, unknown>;
    if (step === 4) {
      const doc = (stepEditForm.documents ?? {}) as Record<string, unknown>;
      const v = doc[fieldKey];
      return { [fieldKey]: v == null || v === "" ? null : String(v) };
    }
    const one: Record<string, unknown> = {};
    if (fieldKey === "store_phones") one.store_phones = Array.isArray(stepEditForm.store_phones) ? stepEditForm.store_phones : undefined;
    else if (fieldKey === "cuisine_types") one.cuisine_types = Array.isArray(stepEditForm.cuisine_types) ? stepEditForm.cuisine_types : undefined;
    else if (f[fieldKey] !== undefined) one[fieldKey] = f[fieldKey];
    return Object.keys(one).length ? one : null;
  };

  const saveFieldEdits = async (fieldKey: string): Promise<boolean> => {
    if (!store || !stepEditForm || verifyModalStep == null) return false;
    const step = verifyModalStep;
    if (step === 4) {
      const payload = buildPayloadForField(step, fieldKey);
      if (!payload) return false;
      const res = await fetch(`/api/merchant/stores/${store.id}/documents`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setError(data?.error || "Failed to save");
        return false;
      }
      return true;
    }
    const payload = buildPayloadForField(step, fieldKey);
    if (!payload || Object.keys(payload).length === 0) return false;
    const res = await fetch(`/api/merchant/stores/${store.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      setError(data?.error || "Failed to save");
      return false;
    }
    return true;
  };

  const handleStartEditField = (fieldKey: string) => {
    setEditConfirmField(fieldKey);
  };
  const handleConfirmEditField = () => {
    if (editConfirmField) {
      setEditStartValues((prev) => ({ ...prev, [editConfirmField]: getFieldValueForEdit(editConfirmField) }));
      setEditingField(editConfirmField);
      setEditConfirmField(null);
    }
  };

  const handleSaveField = async (fieldKey: string) => {
    if (!store || verifyModalStep == null) return;
    setSavingField(fieldKey);
    setError("");
    const oldValue = editStartValues[fieldKey] ?? null;
    try {
      const ok = await saveFieldEdits(fieldKey);
      if (ok) {
        const newValue = getFieldValueForEdit(fieldKey);
        const editRes = await fetch(`/api/merchant/stores/${store.id}/verification-steps/edits`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step: verifyModalStep,
            field_key: fieldKey,
            old_value: oldValue || null,
            new_value: newValue || null,
          }),
        });
        const editData = await editRes.json().catch(() => ({}));
        if (editData?.success && store?.id) {
          fetch(`/api/merchant/stores/${store.id}/verification-steps`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (data?.success && data.edits) setStepEdits(data.edits);
            })
            .catch(() => {});
        }
        setEditStartValues((prev) => {
          const next = { ...prev };
          delete next[fieldKey];
          return next;
        });
        setEditingField(null);
      }
    } finally {
      setSavingField(null);
    }
  };

  const handleModalMarkVerified = async () => {
    if (verifyModalStep == null || !store) return;
    const step = verifyModalStep;
    setVerifyingStep(step);
    setError("");
    try {
      const saved = await saveStepEdits(step);
      if (!saved) {
        setVerifyingStep(null);
        return;
      }
      const success = await handleVerifyStep(step);
      if (success) {
        // Locally bump store approval_status to UNDER_VERIFICATION after first verified step
        setStore((prev) => {
          if (!prev) return prev;
          const status = (prev.approval_status || "").toUpperCase();
          if (status === "UNDER_VERIFICATION" || status === "APPROVED" || status === "REJECTED") {
            return prev;
          }
          return { ...prev, approval_status: "UNDER_VERIFICATION" };
        });
        setVerifyModalStep(null);
        // Do not auto-open next step; agent opens it manually when needed.
      }
    } finally {
      setVerifyingStep(null);
    }
  };

  const handleVerify = async (action: "approve" | "reject") => {
    if (!store) return;
    setActionLoading(action);
    try {
      const res = await fetch(`/api/merchant/stores/${store.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: action === "reject" ? rejectReason : undefined,
          message: rejectReason.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setStore((s) =>
          s ? { ...s, approval_status: action === "approve" ? "APPROVED" : "REJECTED" } : null
        );
        setShowFinalDecisionModal(false);
        if (returnTo) {
          router.push(returnTo);
        }
      } else {
        setError(data.error || "Action failed");
      }
    } catch {
      setError("Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return <VerificationPageSkeleton />;
  }

  if (error && !store) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-gray-500">{error}</p>
        <Link
          href={backHref}
          className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Verifications
        </Link>
      </div>
    );
  }

  if (!store) return null;

  const statusUpper = (store.approval_status || "").toUpperCase();
  const isApproved = statusUpper === "APPROVED";
  const isRejected = statusUpper === "REJECTED";
  const isDelisted = statusUpper === "DELISTED";
  const canVerify = !isApproved && !isRejected && !isDelisted;
  const onboardingStep = store.current_onboarding_step ?? 0;
  const step7Verified = !!(stepVerifications[7]?.verified_at);
  const canVerifyStep = (stepNum: number) =>
    stepNum === 1 ? true : !!(stepVerifications[stepNum - 1]?.verified_at);

  const storeEmail = store.store_email ?? verificationData?.store?.store_email ?? null;
  const createdAt = store.created_at ?? verificationData?.store?.created_at ?? null;
  const storePhones = (verificationData?.store?.store_phones && verificationData.store.store_phones.length > 0)
    ? verificationData.store.store_phones
    : [];
  const fullAddress =
    verificationData?.store?.full_address ||
    store.full_address ||
    null;
  const headerAddress =
    verificationData?.store?.full_address ||
    verificationData?.store?.city ||
    store.city ||
    null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={backHref}
          className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Verifications
        </Link>
        {step7Verified && canVerify && (
          <button
            type="button"
            onClick={() => setShowFinalDecisionModal(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-indigo-600 bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Final decision (Approve / Reject)
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50/50 px-3 py-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
                <Store className="h-3.5 w-3.5 text-indigo-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <h1 className="text-sm font-semibold text-gray-900 line-clamp-2">{store.name}</h1>
                  {isApproved && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                      <CheckCircle className="h-2.5 w-2.5" />
                      Verified
                    </span>
                  )}
                  {isRejected && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
                      <XCircle className="h-2.5 w-2.5" />
                      Rejected
                    </span>
                  )}
                  {isDelisted && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
                      <XCircle className="h-2.5 w-2.5" />
                      Delisted
                    </span>
                  )}
                  {canVerify && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                      <FileText className="h-2.5 w-2.5" />
                      Pending
                    </span>
                  )}
                </div>
                <p className="mt-0.5 overflow-x-auto whitespace-nowrap text-[11px] text-gray-500">
                  {store.store_id}
                  {headerAddress ? ` · ${headerAddress}` : ""}
                </p>
              </div>
            </div>
            {(fullAddress != null || storePhones.length > 0 || (storeEmail != null && storeEmail !== "") || createdAt != null) && (
              <div className="flex shrink-0 flex-col items-end gap-y-0.5 text-[11px] text-gray-600 text-right">
                {createdAt != null && (
                  <span>
                    Created:{" "}
                    <span className="font-medium text-gray-700">
                      {new Date(createdAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </span>
                )}
                {fullAddress != null && fullAddress !== "" && (
                  <span className="block overflow-x-auto whitespace-nowrap">
                    Full address: <span className="font-medium text-gray-700">{fullAddress}</span>
                  </span>
                )}
                {storePhones.length > 0 && (
                  <span className="flex items-center justify-end gap-1 overflow-x-auto whitespace-nowrap">
                    {storePhones.length === 1 ? "Phone:" : "Phones:"}{" "}
                    <span className="font-medium text-gray-700">{storePhones.join(", ")}</span>
                    <button
                      type="button"
                      onClick={copyPhone}
                      className="inline-flex cursor-pointer items-center rounded p-0.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                      title="Copy phone(s)"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    {copyPhoneSuccess && (
                      <span className="text-[10px] font-medium text-emerald-600">Copied</span>
                    )}
                  </span>
                )}
                {storeEmail != null && storeEmail !== "" && (
                  <span className="flex items-center gap-1 overflow-x-auto whitespace-nowrap">
                    Email: <span className="font-medium text-gray-700">{storeEmail}</span>
                    <button
                      type="button"
                      onClick={copyEmail}
                      className="inline-flex cursor-pointer items-center rounded p-0.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                      title="Copy email"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    {copySuccess && (
                      <span className="text-[10px] font-medium text-emerald-600">Copied</span>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-3">
          {canVerify && (
            <>
              <p className="mb-1.5 text-[11px] text-gray-500">
                Verify steps in order; step 7 must be verified before you can approve or reject.
              </p>

              {/* Vertical timeline: 7 steps (6=Commission plan, 7=Sign & submit) */}
              <div className="relative space-y-0">
                {[1, 2, 3, 4, 5, 6, 7].map((stepNum) => {
                  const label = ONBOARDING_STEP_LABELS[stepNum] ?? `Step ${stepNum}`;
                  const agentVerified = stepVerifications[stepNum]?.verified_at ? stepVerifications[stepNum] : null;
                  const merchantCompleted = onboardingStep >= stepNum;
                  const isLast = stepNum === 7;
                  const status =
                    agentVerified ? "verified"
                    : !merchantCompleted ? "pending_merchant"
                    : "pending_agent";
                  const canClickStep = canVerifyStep(stepNum);
                  const showVerifyButton =
                    !agentVerified && status === "pending_agent" && canClickStep;

                  return (
                    <div
                      key={stepNum}
                      className="relative flex gap-2"
                      style={{ minHeight: "36px" }}
                    >
                      {/* Timeline line */}
                      {!isLast && (
                        <div
                          className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-gray-200"
                          aria-hidden
                        />
                      )}
                      {/* Step number circle */}
                      <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 bg-white text-xs font-semibold text-gray-700">
                        {agentVerified ? (
                          <CheckCircle className="h-4 w-4 text-emerald-600" />
                        ) : status === "pending_agent" ? (
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 text-gray-400" />
                        )}
                      </div>
                      {/* Content */}
                      <div className="min-w-0 flex-1 pb-1">
                        <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-1.5">
                          {/* Row 1: Title + badges (left), Action buttons (right) */}
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <div className="flex flex-wrap items-center gap-1 min-w-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedStep((prev) => (prev === stepNum ? null : stepNum))
                                }
                                className="inline-flex cursor-pointer items-center gap-0.5 text-xs font-medium text-gray-900 hover:text-indigo-600"
                              >
                                {expandedStep === stepNum ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                                Step {stepNum}: {label}
                              </button>
                              {merchantCompleted && (
                                <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-600">
                                  Filled by store
                                </span>
                              )}
                              {agentVerified && (
                                <span className="rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-medium text-emerald-800">
                                  Verified
                                </span>
                              )}
                              {!agentVerified && merchantCompleted && (
                                <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800">
                                  Action required
                                </span>
                              )}
                              {status === "pending_merchant" && (
                                <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-500">
                                  Not filled by store
                                </span>
                              )}
                              {status === "pending_agent" && !canClickStep && (
                                <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-500">
                                  Verify previous step first
                                </span>
                              )}
                            </div>
                            {status !== "pending_merchant" && (
                              <div className="flex items-center shrink-0 ml-auto">
                                <button
                                  type="button"
                                  title={agentVerified ? "View" : "View & verify"}
                                  disabled={
                                    verifyingStep !== null ||
                                    unverifyingStep !== null ||
                                    (!agentVerified && !showVerifyButton)
                                  }
                                  onClick={async () => {
                                    if (stepNum === 6 || stepNum === 7) await refetchVerificationData();
                                    setVerifyModalStep(stepNum);
                                  }}
                                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-indigo-600 bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  {agentVerified ? "View" : "View & verify"}
                                </button>
                              </div>
                            )}
                          </div>
                          {/* Row 2: Verified by / contact message; for step 4 show doc summary for this store */}
                          <div className="mt-0.5 text-[11px] text-gray-500">
                            {agentVerified ? (
                              <span>
                                Verified by {agentVerified.verified_by_name ?? "—"} ·{" "}
                                {new Date(agentVerified.verified_at).toLocaleString()}
                              </span>
                            ) : status === "pending_merchant" ? (
                              <span>Contact merchant (call / email) to complete this step.</span>
                            ) : !canClickStep ? (
                              <span>Verify step {stepNum - 1} first</span>
                            ) : null}
                            {stepNum === 4 && (() => {
                              const docSummary = getDocSummaryForStore();
                              return docSummary.length > 0 ? (
                                <span className="block mt-0.5 text-[10px] text-gray-600">
                                  Docs: {docSummary.join(", ")}
                                </span>
                              ) : null;
                            })()}
                          </div>
                          {/* Row 3: Edits — centered */}
                          {stepEdits[stepNum]?.length > 0 && (
                            <div className="mt-0.5 text-center text-[10px] text-gray-500">
                              Edits:{" "}
                              {stepEdits[stepNum].slice(0, 3).map((e) => (
                                <span key={`${e.field_key}-${e.edited_at}`} className="mr-2">
                                  {e.field_key} by {e.edited_by_name ?? "—"} ({new Date(e.edited_at).toLocaleString()})
                                </span>
                              ))}
                              {stepEdits[stepNum].length > 3 && (
                                <button
                                  type="button"
                                  onClick={() => setHistoryModalStep(stepNum)}
                                  className="ml-1 cursor-pointer text-[10px] font-medium text-indigo-600 underline-offset-2 hover:underline"
                                >
                                  View more ({stepEdits[stepNum].length - 3} more)
                                </button>
                              )}
                            </div>
                          )}
                          {expandedStep === stepNum && verificationData?.store && (
                            <StepDetailContent
                              stepNum={stepNum}
                              store={verificationData.store}
                              documents={verificationData.documents}
                              menuFiles={stepNum === 3 ? menuMediaFiles : undefined}
                              operatingHours={verificationData.operatingHours ?? null}
                              onboardingPayments={verificationData.onboardingPayments}
                              agreementAcceptance={verificationData.agreementAcceptance ?? null}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            </>
          )}

          {!canVerify && (
            <p className="text-sm text-gray-500">
              {isDelisted
                ? "This store has been delisted and cannot be re-verified."
                : `This store has already been ${isApproved ? "approved" : "rejected"}.`}
            </p>
          )}
        </div>
      </div>

      {/* Final decision modal — Approve / Reject store */}
      {showFinalDecisionModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="final-decision-modal-title"
        >
          <div className="relative w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 id="final-decision-modal-title" className="text-base font-semibold text-gray-900">
                Final decision
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Approve or reject this store after verifying all steps. Rejection requires a reason.
              </p>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div>
                <label className="mb-0.5 block text-xs font-medium text-gray-500">
                  Message to store owner (sent via email on Approve / Reject). Required when rejecting.
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection or message for approval..."
                  rows={3}
                  wrap="off"
                  className="w-full resize-none overflow-x-auto rounded border border-gray-300 px-2.5 py-1.5 text-sm whitespace-nowrap focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setShowFinalDecisionModal(false)}
                className="cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleVerify("reject")}
                disabled={actionLoading !== null || !rejectReason.trim()}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === "reject" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Reject
              </button>
              <button
                type="button"
                onClick={() => handleVerify("approve")}
                disabled={actionLoading !== null}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {actionLoading === "approve" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Centralized action confirm modal — Verify / Pending / Reject */}
      {actionConfirm != null && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="action-confirm-title"
        >
          <div className="relative w-full max-w-sm rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 id="action-confirm-title" className="text-base font-semibold text-gray-900">
                Step {actionConfirm.stepNum}: {ONBOARDING_STEP_LABELS[actionConfirm.stepNum] ?? `Step ${actionConfirm.stepNum}`}
              </h2>
              <p className="mt-2 text-sm font-medium text-amber-800">
                Proceeding without store authorization will hold you accountable for this action. Once completed, this operation audit will be tracked.
              </p>
              <p className="mt-1 text-sm text-gray-600">
                {actionConfirm.action === "verify" && "Open this step to review and mark as verified."}
                {(actionConfirm.action === "pending" || actionConfirm.action === "reject") &&
                  "This step will be set back to pending. Are you sure?"}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3">
              <button
                type="button"
                onClick={() => setActionConfirm(null)}
                className="cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              {actionConfirm.action === "verify" ? (
                <button
                  type="button"
                  onClick={() => {
                    setVerifyModalStep(actionConfirm!.stepNum);
                    setActionConfirm(null);
                  }}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  <CheckCircle className="h-4 w-4" />
                  Open & verify
                </button>
              ) : (
                <button
                  type="button"
                  disabled={unverifyingStep === actionConfirm.stepNum}
                  onClick={() => handleSetStepPending(actionConfirm.stepNum)}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {unverifyingStep === actionConfirm.stepNum ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : actionConfirm.action === "reject" ? (
                    <XCircle className="h-4 w-4" />
                  ) : (
                    <Clock className="h-4 w-4" />
                  )}
                  {actionConfirm.action === "reject" ? "Reject (set pending)" : "Set to Pending"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Centralized save confirm modal — before any Save (location or field) */}
      {saveConfirm != null && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-confirm-title"
        >
          <div className="relative w-full max-w-sm rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 id="save-confirm-title" className="text-base font-semibold text-gray-900">
                Save changes
              </h2>
              <p className="mt-2 text-sm font-medium text-amber-800">
                Proceeding without store authorization will hold you accountable for this action. Once completed, this operation audit will be tracked.
              </p>
              <p className="mt-1 text-sm text-gray-600">
                Are you sure you want to save these changes?
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3">
              <button
                type="button"
                onClick={() => setSaveConfirm(null)}
                className="cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingField !== null || savingLocation}
                onClick={async () => {
                  if (saveConfirm.type === "location" && store && stepEditForm && verifyModalStep === 2) {
                    setSavingLocation(true);
                    try {
                      const ok = await saveStepEdits(2);
                      if (ok && stepEditForm) {
                        setVerificationData((prev) =>
                          prev
                            ? {
                                ...prev,
                                store: {
                                  ...prev.store,
                                  latitude: stepEditForm.latitude ?? undefined,
                                  longitude: stepEditForm.longitude ?? undefined,
                                },
                              }
                            : null
                        );
                      }
                    } finally {
                      setSavingLocation(false);
                      setSaveConfirm(null);
                    }
                  } else if (saveConfirm.type === "field" && store && verifyModalStep != null) {
                    await handleSaveField(saveConfirm.fieldKey);
                    setSaveConfirm(null);
                  }
                }}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit field confirm — show when user starts editing any field */}
      {editConfirmField != null && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-confirm-title"
        >
          <div className="relative w-full max-w-sm rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 id="edit-confirm-title" className="text-base font-semibold text-gray-900">
                Edit details
              </h2>
              <p className="mt-2 text-sm font-medium text-amber-800">
                Proceeding without store authorization will hold you accountable for this action. Once completed, this operation audit will be tracked.
              </p>
              <p className="mt-1 text-sm text-gray-600">
                Open this field to review and edit. Your change will be recorded.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3">
              <button
                type="button"
                onClick={() => setEditConfirmField(null)}
                className="cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmEditField}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                <CheckCircle className="h-4 w-4" />
                Open & verify
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verify step modal */}
      {verifyModalStep != null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="verify-step-modal-title"
        >
          <div className="relative w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 id="verify-step-modal-title" className="text-base font-semibold text-gray-900">
                Verify step {verifyModalStep}: {ONBOARDING_STEP_LABELS[verifyModalStep] ?? `Step ${verifyModalStep}`}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Review the details below and mark as verified when done.
              </p>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
              {stepEditForm ? (
                <StepDetailContentEditable
                  stepNum={verifyModalStep}
                  form={stepEditForm}
                  onChange={(updates) =>
                    setStepEditForm((prev) => (prev ? { ...prev, ...updates } : null))
                  }
                  editingField={editingField}
                  onStartEdit={handleStartEditField}
                  onSaveField={(fieldKey) => setSaveConfirm({ type: "field", fieldKey })}
                  savingField={savingField}
                  menuFiles={verifyModalStep === 3 ? menuMediaFiles : undefined}
                  storeIdForUpload={store?.id}
                  onMenuUploadComplete={refetchMenuMedia}
                  storeIdForDocUpload={store?.id}
                  onDocumentsUpdated={refetchVerificationData}
                  operatingHours={verificationData?.operatingHours ?? null}
                  onboardingPayments={verificationData?.onboardingPayments}
                  agreementAcceptance={verificationData?.agreementAcceptance ?? null}
                />
              ) : verificationData?.store ? (
                <p className="text-sm text-gray-500">Loading step data...</p>
              ) : (
                <p className="text-sm text-gray-500">Loading step data...</p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
              {verifyModalStep === 2 && (() => {
                const savedLat = verificationData?.store?.latitude ?? null;
                const savedLng = verificationData?.store?.longitude ?? null;
                const formLat = stepEditForm?.latitude ?? null;
                const formLng = stepEditForm?.longitude ?? null;
                const coordsEqual = (a: number | null, b: number | null) =>
                  a === b || (a != null && b != null && Math.abs(a - b) < 1e-9);
                const locationDirty =
                  !coordsEqual(savedLat, formLat) || !coordsEqual(savedLng, formLng);
                return locationDirty ? (
                  <button
                    type="button"
                    disabled={savingLocation || verifyingStep !== null}
                    onClick={() => setSaveConfirm({ type: "location" })}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-indigo-600 bg-white px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                  >
                    {savingLocation ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save location
                  </button>
                ) : null;
              })()}
              <button
                type="button"
                title="Set to Pending"
                disabled={verifyingStep !== null || unverifyingStep !== null}
                onClick={() =>
                  verifyModalStep != null && setActionConfirm({ stepNum: verifyModalStep, action: "pending" })
                }
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-600 bg-amber-50 px-2.5 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              >
                <Clock className="h-4 w-4" />
                Pending
              </button>
              <button
                type="button"
                title="Reject (set to pending)"
                disabled={verifyingStep !== null || unverifyingStep !== null}
                onClick={() =>
                  verifyModalStep != null && setActionConfirm({ stepNum: verifyModalStep, action: "reject" })
                }
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-600 bg-red-50 px-2.5 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </button>
              <button
                type="button"
                onClick={() => setVerifyModalStep(null)}
                className="cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              {(() => {
                const stepVerified = verifyModalStep != null && !!(stepVerifications[verifyModalStep]?.verified_at);
                const hasEditsForStep = (stepEdits[verifyModalStep!]?.length ?? 0) > 0;
                const stepAlreadyVerified = stepVerified && !hasEditsForStep;
                return (
                  <button
                    type="button"
                    disabled={
                      stepAlreadyVerified ||
                      verifyingStep !== null ||
                      (verifyModalStep === 4 && !allStep4DocumentsVerified(stepEditForm?.documents ?? verificationData?.documents))
                    }
                    onClick={stepAlreadyVerified ? undefined : handleModalMarkVerified}
                    className={
                      stepAlreadyVerified
                        ? "inline-flex cursor-default items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white"
                        : "inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    }
                  >
                    {verifyingStep === verifyModalStep ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    {stepAlreadyVerified ? "Verified" : "Mark as verified"}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Edit history modal */}
      {historyModalStep != null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-history-modal-title"
        >
          <div className="relative w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 id="edit-history-modal-title" className="text-base font-semibold text-gray-900">
                Edit history · Step {historyModalStep}: {ONBOARDING_STEP_LABELS[historyModalStep] ?? `Step ${historyModalStep}`}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                This shows all field changes made during verification for this step.
              </p>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
              {stepEdits[historyModalStep]?.length ? (
                <table className="min-w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-[11px] text-gray-500">
                      <th className="px-2 py-1 text-left font-medium">Field</th>
                      <th className="px-2 py-1 text-left font-medium">Old value</th>
                      <th className="px-2 py-1 text-left font-medium">New value</th>
                      <th className="px-2 py-1 text-left font-medium">Edited by</th>
                      <th className="px-2 py-1 text-left font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stepEdits[historyModalStep].map((e) => (
                      <tr key={`${e.field_key}-${e.edited_at}`} className="border-b border-gray-100 align-top">
                        <td className="px-2 py-1 font-medium text-gray-700">{e.field_key}</td>
                        <td className="px-2 py-1 text-gray-500 max-w-xs break-words">{e.old_value ?? "—"}</td>
                        <td className="px-2 py-1 text-gray-800 max-w-xs break-words">{e.new_value ?? "—"}</td>
                        <td className="px-2 py-1 text-gray-500">{e.edited_by_name ?? "—"}</td>
                        <td className="px-2 py-1 text-gray-500 whitespace-nowrap">
                          {new Date(e.edited_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-gray-500">No edit history recorded for this step.</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setHistoryModalStep(null)}
                className="cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
