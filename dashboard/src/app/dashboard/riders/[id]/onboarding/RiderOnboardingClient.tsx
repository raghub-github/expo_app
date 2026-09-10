"use client";
import { useAppParams } from "@/hooks/useAppSearchParams";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useDashboardAccessQuery } from "@/hooks/queries/useDashboardAccessQuery";
import { usePermissionsQuery } from "@/hooks/queries/usePermissionsQuery";
import { invalidateRiderSummary } from "@/lib/cache-invalidation";
import { useRiderDashboardOptional } from "@/context/RiderDashboardContext";
import { DocumentViewer } from "@/components/riders/DocumentViewer";
import { DocumentEditModal } from "@/components/riders/DocumentEditModal";
import {
  DocumentDetailModalShell,
  DocumentSummaryBlock,
  maskDocNumberForBlock,
} from "@/components/riders/DocumentSummaryBlock";
import { PanSkipInlineControl } from "@/components/riders/PanSkipOverridePanel";
import {
  Edit,
  CheckCircle,
  XCircle,
  Eye,
  Loader2,
  AlertCircle,
  X,
  Upload,
} from "lucide-react";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { CopyTextButton } from "@/components/ui/CopyTextButton";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { ONBOARDING_STAGE_LABELS } from "@/types/rider-dashboard";
import { computeIdentityVerificationProgress } from "@/lib/rider-identity-doc-requirements";
import { documentActionKey } from "@/lib/rider-document-side-verification";
import { ElectronicVerifyPanel } from "@/components/verification/ElectronicVerifyPanel";
import { DocAutoVerificationDetailsView } from "@/components/verification/DocAutoVerificationDetails";
import { getRiderDocAutoVerificationDisplay } from "@/lib/rider-doc-auto-verification";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { RiderEligibilitySummaryCard } from "./RiderEligibilitySummaryCard";
import { RiderVehiclesCard } from "./RiderVehiclesCard";
import {
  ElectronicVerifyReviewModal,
  type ElectronicVerifyPending,
} from "@/components/verification/ElectronicVerifyReviewModal";
import { usePermission } from "@/hooks/usePermission";
import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";

interface Rider {
  id: number;
  name: string | null;
  mobile: string;
  countryCode: string;
  aadhaarNumber: string | null;
  panNumber: string | null;
  dob: string | null;
  selfieUrl?: string | null;
  onboardingStage: string;
  kycStatus: string;
  status: string;
  vehicleChoice?: string | null;
  city: string | null;
  state: string | null;
  createdAt: string;
  updatedAt: string;
  panSkipOverride?: boolean | null;
  panSkipReason?: string | null;
  panSkipEnabledBy?: number | null;
  panSkipEnabledByEmail?: string | null;
  panSkipEnabledByName?: string | null;
  panSkipEnabledAt?: string | Date | null;
}

interface VehicleInfo {
  id: number;
  vehicleType: string;
  registrationNumber: string;
  make: string | null;
  model: string | null;
  fuelType: string | null;
  vehicleCategory: string | null;
  acType: string | null;
}

interface Document {
  id: number;
  docType: string;
  fileUrl: string;
  r2Key: string | null;
  docNumber: string | null;
  verificationMethod: string;
  verified: boolean;
  verifierUserId: number | null;
  verifierName: string | null;
  rejectedReason: string | null;
  extractedName: string | null;
  extractedDob: string | null;
  extractedDataSummary?: Record<string, unknown> | null;
  lastVerificationId?: string | null;
  lastProviderReference?: string | null;
  metadata?: Record<string, unknown> | null;
  verifiedAt?: string | null;
  createdAt: string;
}

function isManualUploadMethod(method: string | null | undefined): boolean {
  return String(method || "MANUAL_UPLOAD").toUpperCase() === "MANUAL_UPLOAD";
}

function isAppVerifiedMethod(method: string | null | undefined): boolean {
  return String(method || "").toUpperCase() === "APP_VERIFIED";
}

function isDashboardElectronicMethod(method: string | null | undefined): boolean {
  const m = String(method || "").toUpperCase();
  return m.startsWith("CASHFREE_") || m === "RAZORPAY_BANK";
}

function isElectronicallyVerifiedMethod(method: string | null | undefined): boolean {
  return isAppVerifiedMethod(method) || isDashboardElectronicMethod(method);
}

function verificationMethodBadge(method: string | null | undefined): {
  label: string;
  className: string;
} {
  if (isAppVerifiedMethod(method)) {
    return { label: "App Verified", className: "bg-blue-100 text-blue-800" };
  }
  if (isDashboardElectronicMethod(method)) {
    return { label: "Dashboard electronic", className: "bg-violet-100 text-violet-800" };
  }
  return { label: "Manual Upload", className: "bg-gray-100 text-gray-800" };
}

function verificationMethodFooter(method: string | null | undefined): string {
  if (isAppVerifiedMethod(method)) return "Already verified through app";
  if (isDashboardElectronicMethod(method)) {
    return "Verified electronically from rider dashboard";
  }
  return "";
}

interface OnboardingPayment {
  id: number;
  riderId: number;
  amount: string;
  provider: string;
  refId: string;
  paymentId: string | null;
  status: string;
  createdAt: string;
}

interface PaymentMethod {
  id: number;
  methodType: string;
  accountHolderName: string;
  bankName?: string | null;
  ifsc?: string | null;
  branch?: string | null;
  accountNumberMasked?: string | null;
  upiId?: string | null;
  verificationStatus: string;
  verificationProofType?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
}

interface RiderData {
  rider: Rider;
  documents: Document[];
  vehicle?: VehicleInfo | null;
  onboardingPayments?: OnboardingPayment[];
  paymentMethods?: PaymentMethod[];
}

const DOCUMENT_LABELS: Record<string, string> = {
  aadhaar_front: "Aadhaar Card (Front)",
  aadhaar_back: "Aadhaar Card (Back)",
  pan: "PAN Card",
  dl_front: "Driving License (Front)",
  dl_back: "Driving License (Back)",
  rc: "RC (Registration Certificate)",
  selfie: "Selfie / Profile Photo",
  rental_proof: "Rental Proof (EV Bikes)",
  ev_proof: "EV Ownership Proof",
  bank_proof: "Bank Proof (Passbook/Statement/Cheque)",
  insurance: "Insurance Certificate",
  vehicle_image: "Vehicle Photo",
  upi_qr_proof: "UPI QR Code Proof",
  other: "Other Document",
};

const NON_IMAGE_FILE_URLS = new Set([
  "pending",
  "digilocker_verified",
  "aadhaar_masking_verified",
  "electronic_verified",
  "cashfree_dl_verified",
  "cashfree_rc_verified",
  "cashfree_pan_verified",
  "pan_number_submitted",
  "n/a",
  "na",
]);

function isNonImageFileRef(raw: string | null | undefined): boolean {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return true;
  if (NON_IMAGE_FILE_URLS.has(value)) return true;
  // Electronic / stub markers stored as fileUrl (no real bytes in R2).
  if (
    value.includes("cashfree_") &&
    (value.includes("_verified") || value.includes("electronic"))
  ) {
    return true;
  }
  if (value.endsWith("_verified") && !value.includes("/") && !value.startsWith("http")) {
    return true;
  }
  for (const placeholder of NON_IMAGE_FILE_URLS) {
    if (
      value.includes(`key=${placeholder}`) ||
      value.includes(`key=${encodeURIComponent(placeholder)}`) ||
      value.endsWith(`/${placeholder}`)
    ) {
      return true;
    }
  }
  return false;
}

/** True when the doc has a real image/file the browser can show (any verify method). */
function hasDocumentPreview(document: Document | null, fallbackUrl?: string | null): boolean {
  return Boolean(resolveDocumentPreviewUrl(document, fallbackUrl));
}

function resolveDocumentPreviewUrl(
  document: Document | null,
  fallbackUrl?: string | null,
): string {
  const candidates = [
    document?.fileUrl,
    document?.r2Key,
    fallbackUrl,
  ];
  for (const raw of candidates) {
    const value = String(raw || "").trim();
    if (!value || isNonImageFileRef(value)) continue;
    const resolved = resolveAttachmentProxyUrl(value);
    if (resolved && !isNonImageFileRef(resolved)) {
      // Only accept browser-loadable absolute/relative image URLs.
      if (
        resolved.startsWith("http://") ||
        resolved.startsWith("https://") ||
        resolved.startsWith("/api/attachments/proxy") ||
        resolved.startsWith("/v1/attachments/proxy") ||
        resolved.startsWith("data:") ||
        resolved.startsWith("blob:")
      ) {
        return resolved;
      }
    }
    if (
      value.startsWith("http://") ||
      value.startsWith("https://") ||
      value.startsWith("/api/attachments/proxy") ||
      value.startsWith("/v1/attachments/proxy")
    ) {
      return value.startsWith("/v1/attachments/proxy")
        ? value.replace("/v1/attachments/proxy", "/api/attachments/proxy")
        : value;
    }
  }
  return "";
}

const DOCUMENT_SECTIONS = {
  identity: ["aadhaar_front", "aadhaar_back", "pan", "selfie"],
  vehicle: ["dl_front", "dl_back", "rc"],
  additional: ["rental_proof", "ev_proof", "bank_proof", "insurance", "vehicle_image", "upi_qr_proof"],
};

function readSkippedOnboardingDocs(documents: Document[] | null | undefined): string[] {
  const selection = (documents || []).find((d) => d.docType === "onboarding_vehicle_selection");
  const meta = (selection?.metadata || {}) as Record<string, unknown>;
  if (!Array.isArray(meta.skippedOnboardingDocs)) return [];
  return meta.skippedOnboardingDocs.map((c) => String(c || "").trim()).filter(Boolean);
}

function resolveDocBlockMeta(
  doc: Document | null | undefined,
  docType: string,
  panSkipOverride: boolean,
  skippedOnboardingDocs: string[] = [],
): {
  status: "verified" | "pending" | "rejected" | "skipped" | "missing";
  statusLabel: string;
  subtitle?: string | null;
} {
  if (docType === "pan" && panSkipOverride && !doc?.verified) {
    return {
      status: "skipped",
      statusLabel: "Skipped",
      subtitle: "PAN skip override enabled",
    };
  }
  const skippedSet = new Set(
    skippedOnboardingDocs.map((c) => String(c || "").trim().toLowerCase()).filter(Boolean),
  );
  const isSkippedByRider =
    !doc?.verified &&
    (skippedSet.has(docType.toLowerCase()) ||
      (docType.startsWith("dl") && skippedSet.has("dl")) ||
      (docType === "rc" && skippedSet.has("rc")) ||
      (docType.startsWith("aadhaar") && skippedSet.has("aadhaar")));
  if (isSkippedByRider && (!doc || !doc.fileUrl || doc.fileUrl === "pending" || isNonImageFileRef(doc.fileUrl))) {
    return {
      status: "skipped",
      statusLabel: "Skipped by rider",
      subtitle: "Optional document skipped during onboarding",
    };
  }
  if (doc?.rejectedReason) {
    return { status: "rejected", statusLabel: "Rejected", subtitle: "Needs re-upload" };
  }
  if (doc?.verified) {
    return {
      status: "verified",
      statusLabel: "Verified",
      subtitle: isAppVerifiedMethod(doc.verificationMethod)
        ? "App Verified"
        : isDashboardElectronicMethod(doc.verificationMethod)
          ? "Dashboard electronic"
          : "Manual",
    };
  }
  if (doc) {
    return { status: "pending", statusLabel: "Pending", subtitle: "Awaiting verification" };
  }
  return { status: "missing", statusLabel: "Pending", subtitle: "No document uploaded" };
}

export default function RiderOnboardingClient() {
  // ALL HOOKS MUST BE CALLED FIRST - BEFORE ANY CONDITIONAL RETURNS
  const { data: permissionsData, isLoading: permissionsLoading, error: permissionsError } = usePermissionsQuery();
  const { data: dashboardAccessData, isLoading: dashboardAccessLoading, error: dashboardAccessError } = useDashboardAccessQuery();
  const { canPerformAction, isSuperAdmin: permissionIsSuperAdmin } = usePermission();

  const hasCachedPermissions = permissionsData != null;
  const hasCachedDashboardAccess = dashboardAccessData != null;
  const isSuperAdmin = permissionsData?.isSuperAdmin ?? permissionIsSuperAdmin ?? false;
  const exists = permissionsData?.exists ?? false;
  const canEditPanSkip =
    isSuperAdmin || canPerformAction("RIDER", "UPDATE");

  const params = useAppParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const riderDashboard = useRiderDashboardOptional();
  const riderId = parseInt(params.id as string);

  const [riderData, setRiderData] = useState<RiderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<{
    type: "not_found" | "invalid_id" | "generic";
    message: string;
  } | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingDoc, setRejectingDoc] = useState<Document | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approveDoc, setApproveDoc] = useState<Document | null>(null);
  const [approveBusy, setApproveBusy] = useState(false);
  const [pendingEvByDocId, setPendingEvByDocId] = useState<
    Record<number, ElectronicVerifyPending>
  >({});
  const [evReviewDocId, setEvReviewDocId] = useState<number | null>(null);
  const [evReviewBusy, setEvReviewBusy] = useState(false);
  // Force image reload on card when document is updated (fixes stale image after edit)
  const [imageRefreshKeys, setImageRefreshKeys] = useState<Record<number, number>>({});
  const [detailDocType, setDetailDocType] = useState<string | null>(null);

  // Check if user has rider access
  const hasRiderAccess = dashboardAccessData?.dashboards.some(
    (d) => d.dashboardType === "RIDER" && d.isActive
  ) ?? false;

  // Use ref to store the latest sync function to avoid dependency issues
  const syncDashboardStateFromRiderRef = useRef<((r: Rider | null) => void) | null>(null);  
  const syncDashboardStateFromRider = useCallback(
    (r: Rider | null) => {
      if (!riderDashboard || !r) return;
      if (riderDashboard.riderSummary) {
        riderDashboard.setRiderSummary({
          ...riderDashboard.riderSummary,
          rider: {
            ...riderDashboard.riderSummary.rider,
            onboardingStage: r.onboardingStage,
            kycStatus: r.kycStatus,
            status: r.status,
          },
        });
      }
      if (riderDashboard.riders?.length) {
        riderDashboard.setRiders(
          riderDashboard.riders.map((entry, idx) =>
            idx === 0
              ? {
                  ...entry,
                  onboarding_stage: r.onboardingStage,
                  kyc_status: r.kycStatus,
                  status: r.status,
                }
              : entry
          )
        );
      }
    },
    [riderDashboard]
  );

  // Update ref whenever sync function changes
  useEffect(() => {
    syncDashboardStateFromRiderRef.current = syncDashboardStateFromRider;
  }, [syncDashboardStateFromRider]);

  // Full fetch with loading state (initial load only)
  const fetchRiderData = useCallback(async () => {
    try {
      setLoading(true);
      setPageError(null);

      const response = await fetch(`/api/riders/${riderId}`);
      const text = await response.text();
      let result: { success?: boolean; data?: RiderData; error?: string };
      try {
        result = JSON.parse(text);
      } catch {
        setPageError({
          type: "generic",
          message: "Could not read the server response. Please try again.",
        });
        setRiderData(null);
        return;
      }

      if (!result.success) {
        const apiMessage = result.error || "Failed to fetch rider data";
        if (response.status === 404 || /rider not found/i.test(apiMessage)) {
          setPageError({
            type: "not_found",
            message: `Rider GMR${riderId} does not exist or may have been removed.`,
          });
        } else if (response.status === 400 || /invalid rider id/i.test(apiMessage)) {
          setPageError({
            type: "invalid_id",
            message: "The rider ID in this URL is not valid.",
          });
        } else if (response.status === 401) {
          setPageError({
            type: "generic",
            message: "Not authenticated",
          });
        } else {
          const safe =
            /Failed query:|column .* does not exist|PostgresError/i.test(apiMessage)
              ? "Unable to load this rider right now. Please try again in a moment."
              : apiMessage;
          setPageError({ type: "generic", message: safe });
        }
        setRiderData(null);
        return;
      }

      setRiderData(result.data ?? null);
      if (!result.data) {
        setPageError({
          type: "not_found",
          message: `Rider GMR${riderId} does not exist or may have been removed.`,
        });
        return;
      }
      syncDashboardStateFromRiderRef.current?.(result.data.rider ?? null);
    } catch (err) {
      setPageError({
        type: "generic",
        message: err instanceof Error ? err.message : "Failed to fetch rider data",
      });
      setRiderData(null);
    } finally {
      setLoading(false);
    }
  }, [riderId]);

  // Silent refetch without full-page loading ? use after approve/reject/edit so UI doesn?t flash
  const refetchRiderDataInBackground = useCallback(async () => {
    try {
      const response = await fetch(`/api/riders/${riderId}`);
      const text = await response.text();
      let result: { success?: boolean; data?: RiderData; error?: string };
      try {
        result = JSON.parse(text);
      } catch {
        return;
      }
      if (result.success && result.data) {
        setRiderData(result.data);
        syncDashboardStateFromRiderRef.current?.(result.data?.rider ?? null);
        setPageError(null);
      }
    } catch {
      // Don?t set error state on background refetch ? user already saw success
    }
  }, [riderId]);

  // Fetch rider data - only fetch once when riderId changes
  useEffect(() => {
    if (isNaN(riderId)) {
      setPageError({
        type: "invalid_id",
        message: "The rider ID in this URL is not valid.",
      });
      setLoading(false);
      return;
    }

    fetchRiderData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riderId]); // Only depend on riderId to prevent infinite loops - fetchRiderData is stable now

  if ((permissionsError || dashboardAccessError) && !hasCachedPermissions && !hasCachedDashboardAccess) {
    const msg = permissionsError instanceof Error ? permissionsError.message : dashboardAccessError instanceof Error ? dashboardAccessError.message : "Failed to load access.";
    return (
      <div className="space-y-6 p-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <p className="text-amber-800 font-semibold">Could not load permissions</p>
          <p className="text-amber-700 text-sm mt-2">{msg}</p>
          <button type="button" onClick={() => router.refresh()} className="mt-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Server layout already verified RIDER access; don't block content on client permission load.
  // Only show "User not found" once we have permission data and user isn't in system.
  if (hasCachedPermissions && !exists) {
    return (
      <div className="space-y-6 p-6">
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6">
          <p className="text-yellow-600 font-semibold">User Not Found</p>
          <p className="text-yellow-500 text-sm mt-2">
            Your account is not registered in the system. Please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  // Check access - only show access denied after loading is complete and user exists
  // Don't block on permissions loading since server layout already verified RIDER access
  if (!permissionsLoading && !dashboardAccessLoading && !isSuperAdmin && !hasRiderAccess) {
    return (
      <div className="space-y-6 p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <p className="text-red-600 font-semibold">Access Denied</p>
          <p className="text-red-500 text-sm mt-2">
            You don't have permission to access the Rider Dashboard. Please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  const handleViewDocument = (doc: Document) => {
    setSelectedDocument(doc);
    setViewerOpen(true);
  };

  const handleEditDocument = (doc: Document) => {
    // Only allow editing MANUAL_UPLOAD documents
    if (isManualUploadMethod(doc.verificationMethod)) {
      setEditingDoc(doc);
      setEditModalOpen(true);
    }
  };

  const handleStartUpload = (docType: string) => {
    if (isBlocked) return;
    setEditingDoc({
      id: 0,
      docType,
      fileUrl: "pending",
      r2Key: null,
      docNumber: null,
      verificationMethod: "MANUAL_UPLOAD",
      verified: false,
      verifierUserId: null,
      verifierName: null,
      rejectedReason: null,
      extractedName: null,
      extractedDob: null,
      extractedDataSummary: null,
      lastVerificationId: null,
      lastProviderReference: null,
      metadata: null,
      verifiedAt: null,
      createdAt: new Date().toISOString(),
    });
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (data: { docNumber?: string; file?: File }) => {
    if (!editingDoc) return;

    try {
      setActionLoading(
        editingDoc.id > 0 ? documentActionKey(editingDoc) : `upload:${editingDoc.docType}`,
      );

      const formData = new FormData();
      formData.append("displayDocType", editingDoc.docType);
      if (data.docNumber !== undefined && data.docNumber !== null) {
        formData.append("docNumber", String(data.docNumber).trim() || "");
      } else if (editingDoc.docNumber != null && String(editingDoc.docNumber).trim()) {
        formData.append("docNumber", String(editingDoc.docNumber).trim());
      }
      if (data.file) {
        formData.append("file", data.file);
      }

      const isNew = editingDoc.id <= 0;
      const response = await fetch(
        isNew
          ? `/api/riders/${riderId}/documents`
          : `/api/riders/${riderId}/documents/${editingDoc.id}`,
        {
          method: isNew ? "POST" : "PUT",
          body: formData,
        }
      );

      const text = await response.text();
      let result: { success?: boolean; data?: unknown; error?: string };
      try {
        result = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(response.ok ? "Invalid response from server" : `Update failed (${response.status})`);
      }

      if (!result.success) {
        throw new Error(result.error || "Failed to update document");
      }

      setEditModalOpen(false);
      setEditingDoc(null);
      await fetchRiderData();
    } catch (err) {
      console.error("Error updating document:", err);
      alert(err instanceof Error ? err.message : "Failed to update document");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveEdit = async () => {
    if (!editingDoc) return;
    if (editingDoc.id <= 0) {
      setEditModalOpen(false);
      setEditingDoc(null);
      return;
    }

    try {
      setActionLoading(documentActionKey(editingDoc));

      const formData = new FormData();
      formData.append("displayDocType", editingDoc.docType);
      formData.append("removeImage", "true");
      if (editingDoc.docNumber != null && String(editingDoc.docNumber).trim()) {
        formData.append("docNumber", String(editingDoc.docNumber).trim());
      }

      const response = await fetch(
        `/api/riders/${riderId}/documents/${editingDoc.id}`,
        {
          method: "PUT",
          body: formData,
        }
      );

      const text = await response.text();
      let result: { success?: boolean; error?: string };
      try {
        result = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(response.ok ? "Invalid response from server" : `Remove failed (${response.status})`);
      }

      if (!result.success) {
        throw new Error(result.error || "Failed to remove document image");
      }

      setEditModalOpen(false);
      setEditingDoc(null);
      await fetchRiderData();
    } catch (err) {
      console.error("Error removing document image:", err);
      alert(err instanceof Error ? err.message : "Failed to remove document image");
      throw err;
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveDocument = (doc: Document) => {
    if (!isManualUploadMethod(doc.verificationMethod)) return;
    setApproveDoc(doc);
  };

  const handleConfirmApprove = async () => {
    const doc = approveDoc;
    if (!doc) return;

    try {
      setApproveBusy(true);
      setActionLoading(documentActionKey(doc));

      const pendingEv = pendingEvByDocId[doc.id];
      const response = await fetch(
        `/api/riders/${riderId}/documents/${doc.id}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayDocType: doc.docType,
            ...(pendingEv
              ? {
                  electronicVerify: {
                    verifiedData: {
                      ...pendingEv.data,
                      ...(pendingEv.ifscUsed
                        ? { ifsc: pendingEv.ifscUsed }
                        : {}),
                      ...(doc.docType === "bank_proof" && pendingEv.numberUsed
                        ? {
                            account_number_masked: `•••• ${String(pendingEv.numberUsed).replace(/\D/g, "").slice(-4)}`,
                          }
                        : {}),
                    },
                    docNumber: pendingEv.numberUsed,
                    bankAccount:
                      doc.docType === "bank_proof"
                        ? String(pendingEv.numberUsed).replace(/\D/g, "")
                        : undefined,
                    ifsc: pendingEv.ifscUsed ?? undefined,
                    verificationId: pendingEv.verificationId,
                    providerReference: pendingEv.providerReference,
                    confidence: pendingEv.confidence,
                    provider: "cashfree",
                  },
                }
              : {}),
          }),
        }
      );

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to approve document");
      }

      const { data } = result;
      if (data && riderData) {
        setRiderData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            rider: {
              ...prev.rider,
              ...(data.kycStatus != null && { kycStatus: data.kycStatus }),
              ...(data.onboardingStage != null && { onboardingStage: data.onboardingStage }),
              ...(data.status != null && { status: data.status }),
            },
            documents: prev.documents.map((d) =>
              d.id === doc.id && d.docType === doc.docType
                ? {
                    ...d,
                    verified: true,
                    verificationMethod: pendingEv ? "CASHFREE_AUTO" : d.verificationMethod,
                    docNumber: pendingEv?.numberUsed || d.docNumber,
                    extractedDataSummary: pendingEv
                      ? {
                          verifiedData: pendingEv.data,
                          provider: "cashfree",
                          confidence: pendingEv.confidence ?? null,
                        }
                      : d.extractedDataSummary,
                    verifierUserId: data.document.verifierUserId ?? d.verifierUserId,
                    rejectedReason: null,
                  }
                : d
            ),
          };
        });
        syncDashboardStateFromRiderRef.current?.({
          ...riderData.rider,
          kycStatus: data.kycStatus ?? riderData.rider.kycStatus,
          onboardingStage: data.onboardingStage ?? riderData.rider.onboardingStage,
          status: data.status ?? riderData.rider.status,
        });
        invalidateRiderSummary(queryClient, riderId);
      }
      if (pendingEv) {
        setPendingEvByDocId((prev) => {
          const next = { ...prev };
          delete next[doc.id];
          return next;
        });
        setEvReviewDocId(null);
      }
      setApproveDoc(null);
      // Bank EV also upserts payment methods — refresh so the card shows details.
      if (doc.docType === "bank_proof") {
        void refetchRiderDataInBackground();
      }
    } catch (err) {
      console.error("Error approving document:", err);
      alert(err instanceof Error ? err.message : "Failed to approve document");
    } finally {
      setApproveBusy(false);
      setActionLoading(null);
    }
  };

  /** Provider fetch only — show review modal; do not mark verified / write projection. */
  const handleElectronicVerified = (
    doc: Document,
    data: Record<string, unknown>,
    meta?: {
      numberUsed: string;
      ifscUsed?: string | null;
      verificationId?: string | null;
      providerReference?: string | null;
      confidence?: number | null;
    },
  ) => {
    const pending: ElectronicVerifyPending = {
      docId: doc.id,
      docType: doc.docType,
      docLabel: DOCUMENT_LABELS[doc.docType] || doc.docType,
      numberUsed:
        meta?.numberUsed ||
        String(
          data.pan ||
            data.dl_number ||
            data.reg_no ||
            data.account_number_masked ||
            "",
        ).trim(),
      ifscUsed: meta?.ifscUsed ?? null,
      data,
      verificationId: meta?.verificationId ?? null,
      providerReference: meta?.providerReference ?? null,
      confidence: meta?.confidence ?? null,
    };
    setPendingEvByDocId((prev) => ({ ...prev, [doc.id]: pending }));
    setEvReviewDocId(doc.id);
  };

  /** Empty card: create stub doc, then same review → approve flow as the rider app. */
  const handleElectronicWithoutDoc = async (
    docType: string,
    data: Record<string, unknown>,
    meta?: {
      numberUsed: string;
      ifscUsed?: string | null;
      verificationId?: string | null;
      providerReference?: string | null;
      confidence?: number | null;
    },
  ) => {
    try {
      setActionLoading(`upload:${docType}`);
      const res = await fetch(`/api/riders/${riderId}/documents/ensure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayDocType: docType }),
      });
      const result = await res.json();
      if (!result.success || !result.data) {
        throw new Error(result.error || "Could not prepare document");
      }
      const stub = result.data as Document;
      setRiderData((prev) => {
        if (!prev) return prev;
        const exists = prev.documents.some((d) => d.id === stub.id && d.docType === stub.docType);
        return {
          ...prev,
          documents: exists
            ? prev.documents.map((d) =>
                d.id === stub.id && d.docType === stub.docType ? { ...d, ...stub } : d,
              )
            : [...prev.documents, stub],
        };
      });
      handleElectronicVerified(stub, data, meta);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Electronic verify failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveFromEvReview = () => {
    if (evReviewDocId == null) return;
    const pending = pendingEvByDocId[evReviewDocId];
    const doc = riderData?.documents.find((d) => d.id === evReviewDocId);
    if (!doc || !isManualUploadMethod(doc.verificationMethod)) return;
    // Keep pending details; close review and ask for final confirm.
    setEvReviewDocId(null);
    setApproveDoc({
      ...doc,
      docNumber: pending?.numberUsed || doc.docNumber,
    });
  };

  const handleDiscardEvReview = () => {
    if (evReviewDocId == null) return;
    const id = evReviewDocId;
    setPendingEvByDocId((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setEvReviewDocId(null);
  };

  const handleRejectDocument = (doc: Document) => {
    // Only allow rejecting MANUAL_UPLOAD documents
    if (!isManualUploadMethod(doc.verificationMethod)) {
      return;
    }
    
    setRejectingDoc(doc);
    setRejectReason("");
    setRejectModalOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!rejectingDoc || !rejectReason.trim()) {
      alert("Please provide a rejection reason");
      return;
    }

    try {
      setActionLoading(documentActionKey(rejectingDoc));

      const response = await fetch(
        `/api/riders/${riderId}/documents/${rejectingDoc.id}/reject`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reason: rejectReason.trim(),
            displayDocType: rejectingDoc.docType,
          }),
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to reject document");
      }

      // Optimistic update: mark document as rejected in state
      if (rejectingDoc && riderData) {
        setRiderData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            documents: prev.documents.map((d) =>
              d.id === rejectingDoc.id && d.docType === rejectingDoc.docType
                ? { ...d, verified: false, rejectedReason: rejectReason.trim() }
                : d
            ),
          };
        });
      }
      setRejectModalOpen(false);
      setRejectingDoc(null);
      setRejectReason("");
      refetchRiderDataInBackground();
      invalidateRiderSummary(queryClient, riderId);
    } catch (err) {
      console.error("Error rejecting document:", err);
      alert(err instanceof Error ? err.message : "Failed to reject document");
    } finally {
      setActionLoading(null);
    }
  };

  const getDocumentsByType = (docType: string): Document[] => {
    if (!riderData) return [];
    return riderData.documents.filter((doc) => doc.docType === docType);
  };

  const getLatestDocument = (docType: string): Document | null => {
    const docs = getDocumentsByType(docType);
    if (docs.length > 0) return docs[0];
    // App Cashfree bank verify used to write only rider_payment_methods —
    // surface that as a bank_proof card so agents aren't stuck on "No document".
    if (docType === "bank_proof") {
      const pm = riderData?.paymentMethods?.find((p) => p.methodType === "bank");
      if (!pm) return null;
      const verified = String(pm.verificationStatus).toLowerCase() === "verified";
      // Pending/rejected bank without a real bank_proof row → empty card + EV.
      if (!verified) return null;
      return {
        id: -Math.abs(pm.id),
        docType: "bank_proof",
        fileUrl: "electronic_verified",
        r2Key: null,
        docNumber: pm.accountNumberMasked ?? null,
        verificationMethod: "APP_VERIFIED",
        verified: true,
        verifierUserId: null,
        verifierName: null,
        rejectedReason: null,
        extractedName: pm.accountHolderName,
        extractedDob: null,
        extractedDataSummary: {
          verifiedData: {
            name_at_bank: pm.accountHolderName,
            bank_name: pm.bankName,
            branch_name: pm.branch,
            ifsc: pm.ifsc,
            account_number_masked: pm.accountNumberMasked,
            account_status: "VALID",
          },
          provider: "cashfree",
          method: "APP_VERIFIED",
          source: "rider_payment_methods",
        },
        metadata: {
          ifsc: pm.ifsc,
          bankAccountMasked: pm.accountNumberMasked,
          bankHolderName: pm.accountHolderName,
          bankVerificationOnly: true,
        },
        verifiedAt: pm.verifiedAt ?? null,
        createdAt: pm.createdAt,
      };
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#E8F5EC] p-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#0A2342]" />
          <p className="text-sm font-medium text-[#0A2342]">Loading rider verification…</p>
        </div>
      </div>
    );
  }

  if (pageError) {
    const isNotFound = pageError.type === "not_found";
    const isInvalidId = pageError.type === "invalid_id";
    const isAuth =
      /not authenticated|session/i.test(pageError.message);

    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-[#E8F5EC] px-6 py-12">
        <AlertCircle
          className={`mb-4 h-10 w-10 ${
            isNotFound || isInvalidId ? "text-amber-600" : "text-rose-600"
          }`}
        />
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
          Verification desk
        </p>
        <h1 className="mt-2 text-center text-2xl font-semibold tracking-tight text-[#0A2342]">
          {isAuth
            ? "Session expired"
            : isNotFound
              ? "Rider not found"
              : isInvalidId
                ? "Invalid rider ID"
                : "Could not load rider"}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-center text-sm leading-relaxed text-gray-600">
          {isAuth
            ? "Please sign in again, then open this rider from the list."
            : pageError.message}
        </p>
        {isNotFound && !isNaN(riderId) && (
          <p className="mt-2 font-mono text-xs text-gray-400">GMR{riderId}</p>
        )}
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => router.push(isAuth ? "/login" : "/dashboard/riders")}
            className="w-full rounded-lg bg-[#0A2342] px-5 py-2.5 text-sm font-semibold text-white sm:w-auto"
          >
            {isAuth ? "Go to login" : "Back to riders list"}
          </button>
          {!isInvalidId && !isAuth && (
            <button
              type="button"
              onClick={() => void fetchRiderData()}
              className="w-full rounded-lg border border-gray-300 bg-transparent px-5 py-2.5 text-sm font-semibold text-gray-700 sm:w-auto"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!riderData) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#E8F5EC] p-6">
        <Loader2 className="h-8 w-8 animate-spin text-[#0A2342]" />
      </div>
    );
  }

  const isAlreadyVerified = riderData.rider.onboardingStage === "ACTIVE" && riderData.rider.kycStatus === "APPROVED";
  const isBlocked = riderData.rider.status === "BLOCKED" || riderData.rider.status === "BANNED";
  const riderInitials = (riderData.rider.name || "R")
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#E8F5EC]">
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:space-y-8 sm:p-6 lg:p-8">
      {/* Plain header — no card */}
      <div className="flex flex-col gap-4 border-b border-black/5 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
            Rider KYC · Verification desk
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#0A2342] sm:text-3xl">
            Rider Onboarding Verification
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Review identity, vehicle, and supporting documents. Approve, reject, or verify electronically.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-[#0A2342]">
              GMR{riderData.rider.id}
            </span>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-emerald-800">
              {riderData.rider.kycStatus}
            </span>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-gray-700">
              {ONBOARDING_STAGE_LABELS[riderData.rider.onboardingStage] ?? riderData.rider.onboardingStage}
            </span>
          </div>
        </div>
        <button
          onClick={() => router.push("/dashboard/riders")}
          className="shrink-0 rounded-lg border border-gray-300 bg-white/80 px-4 py-2.5 text-sm font-semibold text-gray-800"
        >
          ← Back to riders
        </button>
      </div>

      {/* Warning Banners */}
      {isAlreadyVerified && (
        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/90 p-4 shadow-sm backdrop-blur">
          <div className="flex items-start gap-3">
            <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
            <div>
              <h3 className="text-sm font-semibold text-emerald-900">Rider already verified</h3>
              <p className="mt-1 text-sm text-emerald-800">
                Onboarding is complete and documents are verified. Re-run verification only when required.
              </p>
            </div>
          </div>
        </div>
      )}

      {isBlocked && (
        <div className="rounded-2xl border border-rose-200/80 bg-rose-50/90 p-4 shadow-sm backdrop-blur">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-600" />
            <div>
              <h3 className="text-sm font-semibold text-rose-900">Rider account blocked</h3>
              <p className="mt-1 text-sm text-rose-800">
                Unblock this rider from the main dashboard before verifying documents. Status:{" "}
                <span className="font-semibold">{riderData.rider.status}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Rider Info Summary */}
      <div className="overflow-hidden rounded-3xl border border-white/80 bg-white/95 shadow-[0_18px_50px_-32px_rgba(10,35,66,0.35)] backdrop-blur">
        <div className="flex flex-col gap-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#0A2342] text-lg font-semibold text-white shadow-lg shadow-[#0A2342]/25">
              {riderInitials}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-[#0A2342]">
                {riderData.rider.name || "Unnamed rider"}
              </h2>
              <p className="mt-0.5 text-sm text-gray-500">
                GMR{riderData.rider.id} · {riderData.rider.mobile}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {riderData.rider.status}
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
              KYC · {riderData.rider.kycStatus}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 sm:p-6 md:grid-cols-3 lg:grid-cols-4">
          {[
            ["Rider ID", `GMR${riderData.rider.id}`],
            ["Name", riderData.rider.name || "—"],
            ["Mobile", riderData.rider.mobile],
            ["Onboarding stage", ONBOARDING_STAGE_LABELS[riderData.rider.onboardingStage] ?? riderData.rider.onboardingStage],
            ["KYC status", riderData.rider.kycStatus],
            ["Account status", riderData.rider.status],
            ["City", riderData.rider.city || "—"],
            ["State", riderData.rider.state || "—"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-2xl border border-gray-100 bg-gradient-to-b from-gray-50/80 to-white px-4 py-3"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
              <p className="mt-1 truncate text-sm font-semibold text-gray-900">{value}</p>
            </div>
          ))}
          {(riderData.vehicle || riderData.rider.vehicleChoice) && (
            <>
              <div className="rounded-2xl border border-gray-100 bg-gradient-to-b from-gray-50/80 to-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Vehicle / Fuel</p>
                <p className="mt-1 truncate text-sm font-semibold text-gray-900">
                  {riderData.vehicle?.fuelType || riderData.rider.vehicleChoice || "—"}
                </p>
              </div>
              {riderData.vehicle && (
                <>
                  <div className="rounded-2xl border border-gray-100 bg-gradient-to-b from-gray-50/80 to-white px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Vehicle type</p>
                    <p className="mt-1 truncate text-sm font-semibold text-gray-900">
                      {String(riderData.vehicle.vehicleType || "—").charAt(0).toUpperCase() +
                        String(riderData.vehicle.vehicleType || "").slice(1).toLowerCase()}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-gradient-to-b from-gray-50/80 to-white px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Make</p>
                    <p className="mt-1 truncate text-sm font-semibold text-gray-900">{riderData.vehicle.make || "—"}</p>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-gradient-to-b from-gray-50/80 to-white px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Model</p>
                    <p className="mt-1 truncate text-sm font-semibold text-gray-900">{riderData.vehicle.model || "—"}</p>
                  </div>
                  {riderData.vehicle.registrationNumber && (
                    <div className="rounded-2xl border border-gray-100 bg-gradient-to-b from-gray-50/80 to-white px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Registration</p>
                      <p className="mt-1 truncate font-mono text-sm font-semibold text-gray-900">
                        {riderData.vehicle.registrationNumber}
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Onboarding Fees Section */}
      {riderData.onboardingPayments && riderData.onboardingPayments.length > 0 && (
        <div className="overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-[0_18px_50px_-32px_rgba(10,35,66,0.3)]">
          <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 to-white px-6 py-5">
            <h2 className="text-lg font-semibold text-[#0A2342]">Onboarding fees</h2>
            <p className="mt-1 text-sm text-gray-500">Registration payments linked to this rider</p>
          </div>
          <div className="p-6">
          <div className="mb-4 rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Total paid</span>
              <span className="text-2xl font-bold tabular-nums text-[#0A2342]">
                ₹{riderData.onboardingPayments.filter((p) => p.status === "completed").reduce((sum, p) => sum + Number(p.amount), 0).toFixed(2)}
              </span>
            </div>
            {riderData.onboardingPayments.some(p => p.status !== "completed") && (
              <div className="mt-2 text-xs text-amber-600">
                Note: Some payments are pending or failed
              </div>
            )}
          </div>
          <div className="overflow-x-auto rounded-2xl border border-gray-100">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Ref ID</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Amount</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Provider</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Status</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Payment ID</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {riderData.onboardingPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-900">{p.refId || "—"}</td>
                    <td className="px-3 py-2.5 font-bold tabular-nums text-gray-900">₹{Number(p.amount).toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{p.provider || "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.status === "completed" ? "bg-emerald-100 text-emerald-800" :
                        p.status === "failed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{p.paymentId || "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{new Date(p.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      )}

      {/* Verification Progress Summary */}
      <div className="overflow-hidden rounded-2xl border border-white/80 bg-white shadow-[0_18px_50px_-32px_rgba(10,35,66,0.3)]">
        <div className="border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white px-4 py-2.5 sm:px-5">
          <h2 className="text-base font-semibold text-[#0A2342]">Verification progress</h2>
          <p className="text-xs text-gray-500">Identity and vehicle document completion</p>
        </div>
        <div className="space-y-2.5 p-3 sm:p-4">
          {(() => {
            const allDocs = riderData.documents || [];
            const panSkipOverride = Boolean(riderData.rider.panSkipOverride);
            const identityProgress = computeIdentityVerificationProgress(
              allDocs,
              (docType) => Boolean(getLatestDocument(docType)?.verified),
              (docType) => getLatestDocument(docType) != null,
              { panSkipOverride },
            );
            const identityVerified = identityProgress.verified;
            const identityUploaded = identityProgress.uploaded;
            const identityTotal = identityProgress.total;
            
            const vehicleDocs = allDocs.filter(d => DOCUMENT_SECTIONS.vehicle.includes(d.docType));
            const vehicleVerified = vehicleDocs.filter(d => d.verified).length;
            const vehicleUploaded = DOCUMENT_SECTIONS.vehicle.filter(
              (docType) => allDocs.some((d) => d.docType === docType)
            ).length;
            const vehicleTotal = DOCUMENT_SECTIONS.vehicle.length;
            
            const additionalDocs = allDocs.filter(d => DOCUMENT_SECTIONS.additional.includes(d.docType));
            const additionalVerified = additionalDocs.filter(d => d.verified).length;
            
            const allRequiredVerified = identityProgress.complete && vehicleVerified === vehicleTotal;
            const paymentCompleted = (riderData.onboardingPayments ?? []).some((p) => p.status === "completed");
            const isActive = riderData.rider.status === "ACTIVE";
            
            return (
              <>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <ProgressBar label="Identity Documents" current={identityVerified} total={identityTotal} uploaded={identityUploaded} />
                  <ProgressBar label="Vehicle Documents" current={vehicleVerified} total={vehicleTotal} uploaded={vehicleUploaded} />
                </div>
                {additionalDocs.length > 0 && (
                  <ProgressBar label="Additional Documents" current={additionalVerified} total={additionalDocs.length} />
                )}
                
                {allRequiredVerified && paymentCompleted && isActive && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900">
                      <CheckCircle className="h-4 w-4 shrink-0" />
                      Rider is active and ready to accept orders.
                    </p>
                  </div>
                )}

                {allRequiredVerified && paymentCompleted && !isActive && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      All documents verified and payment received. Refresh to sync rider status to ACTIVE.
                    </p>
                  </div>
                )}

                {allRequiredVerified && !paymentCompleted && (
                  <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-900">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      Documents verified. Waiting for onboarding payment before activation.
                    </p>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* Backend-authoritative service eligibility (§41) — which services this rider can
          actually receive, and the documents gating the rest. */}
      <RiderEligibilitySummaryCard riderId={riderId} />

      {/* Per-vehicle eligibility + verification history (§46). */}
      <RiderVehiclesCard riderId={riderId} />

      {/* Identity Documents */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3.5 sm:px-5">
          <h2 className="text-base font-semibold text-[#0A2342]">Identity Documents</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Click a block for details. Manual approve and Cashfree verify use the same{" "}
            <span className="font-medium text-slate-700">rider_documents</span> records.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3 xl:items-stretch">
          {DOCUMENT_SECTIONS.identity.map((docType) => {
            const doc = getLatestDocument(docType);
            if (docType === "aadhaar_back") {
              const aadhaarMethod =
                getLatestDocument("aadhaar_front")?.verificationMethod ||
                doc?.verificationMethod;
              if (isElectronicallyVerifiedMethod(aadhaarMethod)) return null;
            }
            const aadhaarFrontLabel =
              docType === "aadhaar_front" &&
              isElectronicallyVerifiedMethod(doc?.verificationMethod)
                ? "Aadhaar Card"
                : undefined;
            const title = aadhaarFrontLabel || DOCUMENT_LABELS[docType] || docType;
            const panSkip = Boolean(riderData.rider.panSkipOverride);
            const skippedDocs = readSkippedOnboardingDocs(riderData.documents);
            const meta = resolveDocBlockMeta(doc, docType, panSkip, skippedDocs);
            const rawNumber =
              doc?.docNumber ||
              (docType === "aadhaar_front" || docType === "aadhaar_back"
                ? riderData.rider.aadhaarNumber
                : docType === "pan"
                  ? riderData.rider.panNumber
                  : null);
            const kind =
              docType.startsWith("aadhaar") ? "aadhaar" : docType === "pan" ? "pan" : undefined;
            const selfiePreview =
              docType === "selfie"
                ? resolveDocumentPreviewUrl(doc, riderData.rider.selfieUrl)
                : null;
            return (
              <DocumentSummaryBlock
                key={docType}
                title={title}
                status={meta.status}
                statusLabel={meta.statusLabel}
                subtitle={meta.subtitle}
                maskedNumber={
                  DOC_TYPES_WITH_NUMBER.has(docType)
                    ? maskDocNumberForBlock(rawNumber, kind)
                    : "—"
                }
                previewImageUrl={selfiePreview || null}
                onClick={() => setDetailDocType(docType)}
              />
            );
          })}
        </div>
        <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
          <PanSkipInlineControl
            riderId={riderId}
            panSkipOverride={Boolean(riderData.rider.panSkipOverride)}
            panSkipReason={riderData.rider.panSkipReason}
            panSkipEnabledByName={riderData.rider.panSkipEnabledByName}
            panSkipEnabledByEmail={riderData.rider.panSkipEnabledByEmail}
            panSkipEnabledAt={riderData.rider.panSkipEnabledAt}
            panVerified={Boolean(getLatestDocument("pan")?.verified)}
            canEdit={canEditPanSkip && !isBlocked}
            onUpdated={() => void fetchRiderData()}
            compact
          />
        </div>
      </div>

      {/* Vehicle Documents */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3.5 sm:px-5">
          <h2 className="text-base font-semibold text-[#0A2342]">Vehicle Documents</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            DL / RC upload and Cashfree electronic verify. Click a block for details.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3 xl:items-stretch">
          {DOCUMENT_SECTIONS.vehicle.map((docType) => {
            const doc = getLatestDocument(docType);
            const meta = resolveDocBlockMeta(
              doc,
              docType,
              false,
              readSkippedOnboardingDocs(riderData.documents),
            );
            return (
              <DocumentSummaryBlock
                key={docType}
                title={DOCUMENT_LABELS[docType] || docType}
                status={meta.status}
                statusLabel={meta.statusLabel}
                subtitle={meta.subtitle}
                maskedNumber={
                  DOC_TYPES_WITH_NUMBER.has(docType)
                    ? maskDocNumberForBlock(doc?.docNumber)
                    : "—"
                }
                onClick={() => setDetailDocType(docType)}
              />
            );
          })}
        </div>
      </div>

      {/* Additional Documents */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3.5 sm:px-5">
          <h2 className="text-base font-semibold text-[#0A2342]">Additional Documents</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Optional proofs (rental, EV, bank, insurance, vehicle photo, UPI). Click a block for details.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3 xl:items-stretch">
          {DOCUMENT_SECTIONS.additional.map((docType) => {
            const doc = getLatestDocument(docType);
            const meta = resolveDocBlockMeta(
              doc,
              docType,
              false,
              readSkippedOnboardingDocs(riderData.documents),
            );
            return (
              <DocumentSummaryBlock
                key={docType}
                title={
                  docType === "bank_proof"
                    ? `${DOCUMENT_LABELS[docType] || docType} (Optional)`
                    : DOCUMENT_LABELS[docType] || docType
                }
                status={meta.status}
                statusLabel={meta.statusLabel}
                subtitle={meta.subtitle}
                maskedNumber={
                  DOC_TYPES_WITH_NUMBER.has(docType)
                    ? maskDocNumberForBlock(doc?.docNumber)
                    : "—"
                }
                onClick={() => setDetailDocType(docType)}
              />
            );
          })}
        </div>
      </div>

      <DocumentDetailModalShell
        open={Boolean(detailDocType)}
        size={
          detailDocType &&
          (detailDocType.startsWith("dl") ||
            detailDocType === "rc" ||
            detailDocType.startsWith("aadhaar") ||
            detailDocType === "pan")
            ? "wide"
            : "default"
        }
        title={
          detailDocType
            ? (() => {
                const doc = getLatestDocument(detailDocType);
                if (
                  detailDocType === "aadhaar_front" &&
                  isElectronicallyVerifiedMethod(doc?.verificationMethod)
                ) {
                  return "Aadhaar Card";
                }
                return DOCUMENT_LABELS[detailDocType] || detailDocType;
              })()
            : "Document details"
        }
        statusLabel={
          detailDocType
            ? resolveDocBlockMeta(
                getLatestDocument(detailDocType),
                detailDocType,
                Boolean(riderData.rider.panSkipOverride),
                readSkippedOnboardingDocs(riderData.documents),
              ).statusLabel
            : null
        }
        onClose={() => setDetailDocType(null)}
      >
        {detailDocType ? (
          (() => {
            const docType = detailDocType;
            const doc = getLatestDocument(docType);
            const isIdentity = DOCUMENT_SECTIONS.identity.includes(docType);
            const isAdditional = DOCUMENT_SECTIONS.additional.includes(docType);
            const aadhaarFrontLabel =
              docType === "aadhaar_front" &&
              isElectronicallyVerifiedMethod(doc?.verificationMethod)
                ? "Aadhaar Card"
                : undefined;
            const isSyntheticBank = docType === "bank_proof" && doc != null && doc.id < 0;
            const realBankDoc =
              docType === "bank_proof"
                ? getDocumentsByType("bank_proof")[0] ?? null
                : doc;
            const actionDoc = isAdditional && docType === "bank_proof" ? realBankDoc : doc;
            return (
              <DocumentCard
                riderId={riderId}
                docType={docType}
                document={doc}
                isOptional={docType === "bank_proof"}
                titleOverride={aadhaarFrontLabel}
                riderDob={riderData?.rider?.dob ?? null}
                riderAadhaarNumber={
                  isIdentity ? riderData?.rider?.aadhaarNumber ?? null : null
                }
                riderPanNumber={
                  isIdentity ? riderData?.rider?.panNumber ?? null : null
                }
                fallbackPreviewUrl={
                  docType === "selfie" ? riderData?.rider?.selfieUrl ?? null : null
                }
                imageRefreshKey={
                  actionDoc && actionDoc.id > 0
                    ? imageRefreshKeys[actionDoc.id]
                    : doc
                      ? imageRefreshKeys[doc.id]
                      : undefined
                }
                onView={() => {
                  if (!doc || (isSyntheticBank && docType === "bank_proof")) return;
                  const previewFallback =
                    docType === "selfie" ? riderData?.rider?.selfieUrl : null;
                  if (!hasDocumentPreview(doc, previewFallback)) return;
                  handleViewDocument({
                    ...doc,
                    fileUrl:
                      resolveDocumentPreviewUrl(doc, previewFallback) || doc.fileUrl,
                  });
                }}
                onEdit={() =>
                  actionDoc &&
                  isManualUploadMethod(actionDoc.verificationMethod) &&
                  !isBlocked &&
                  handleEditDocument(actionDoc)
                }
                onUpload={() => !isBlocked && handleStartUpload(docType)}
                onApprove={() =>
                  actionDoc &&
                  isManualUploadMethod(actionDoc.verificationMethod) &&
                  !actionDoc.verified &&
                  !isBlocked &&
                  handleApproveDocument(actionDoc)
                }
                onReject={() =>
                  actionDoc &&
                  isManualUploadMethod(actionDoc.verificationMethod) &&
                  !actionDoc.verified &&
                  !isBlocked &&
                  handleRejectDocument(actionDoc)
                }
                onElectronicVerified={
                  actionDoc
                    ? (data, meta) => handleElectronicVerified(actionDoc, data, meta)
                    : EV_KIND_BY_DOC_TYPE[docType]
                      ? (data, meta) => handleElectronicWithoutDoc(docType, data, meta)
                      : undefined
                }
                pendingElectronicReview={
                  actionDoc && actionDoc.id > 0
                    ? pendingEvByDocId[actionDoc.id] ?? null
                    : null
                }
                onOpenPendingElectronicReview={
                  actionDoc && actionDoc.id > 0
                    ? () => setEvReviewDocId(actionDoc.id)
                    : undefined
                }
                isLoading={
                  actionDoc
                    ? actionLoading === documentActionKey(actionDoc)
                    : actionLoading === `upload:${docType}`
                }
                isDisabled={isBlocked}
                allVersions={getDocumentsByType(docType)}
                allowEmptyElectronicVerify={Boolean(EV_KIND_BY_DOC_TYPE[docType])}
              />
            );
          })()
        ) : null}
      </DocumentDetailModalShell>

      {/* Document Viewer */}
      {selectedDocument && (
        <DocumentViewer
          isOpen={viewerOpen}
          onClose={() => {
            setViewerOpen(false);
            setSelectedDocument(null);
          }}
          imageUrl={
            resolveDocumentPreviewUrl(
              selectedDocument,
              selectedDocument.docType === "selfie" ? riderData?.rider?.selfieUrl : null,
            ) || selectedDocument.fileUrl || ""
          }
          documentName={DOCUMENT_LABELS[selectedDocument.docType] ?? selectedDocument.docType ?? "Document"}
          documentNumber={selectedDocument.docNumber ?? null}
        />
      )}

      {/* Edit Modal */}
      {editingDoc && (
        <DocumentEditModal
          isOpen={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setEditingDoc(null);
          }}
          onSave={handleSaveEdit}
          onRemove={handleRemoveEdit}
          currentDocNumber={editingDoc.docNumber}
          currentImageUrl={editingDoc.fileUrl}
          currentR2Key={editingDoc.r2Key}
          docType={editingDoc.docType}
          isLoading={actionLoading === documentActionKey(editingDoc)}
        />
      )}

      {/* Reject Modal */}
      {rejectModalOpen && rejectingDoc && (
        <RejectModal
          isOpen={rejectModalOpen}
          onClose={() => {
            setRejectModalOpen(false);
            setRejectingDoc(null);
            setRejectReason("");
          }}
          onConfirm={handleConfirmReject}
          documentName={DOCUMENT_LABELS[rejectingDoc.docType] || rejectingDoc.docType}
          reason={rejectReason}
          onReasonChange={setRejectReason}
          isLoading={actionLoading === documentActionKey(rejectingDoc)}
        />
      )}

      <ConfirmModal
        open={approveDoc != null}
        title="Approve document?"
        closeOnBackdrop={false}
        description={
          approveDoc ? (
            <span>
              Review the provider / document details first. Confirm only if you want to
              approve{" "}
              <span className="font-semibold text-gray-900">
                {DOCUMENT_LABELS[approveDoc.docType] || approveDoc.docType}
              </span>
              {approveDoc.docNumber ? (
                <>
                  {" "}
                  (<span className="font-mono">{approveDoc.docNumber}</span>)
                </>
              ) : null}
              .
            </span>
          ) : null
        }
        confirmLabel="Approve"
        cancelLabel="Cancel"
        confirmBusy={approveBusy}
        onClose={() => {
          if (!approveBusy) setApproveDoc(null);
        }}
        onConfirm={handleConfirmApprove}
      />

      <ElectronicVerifyReviewModal
        open={evReviewDocId != null && !!pendingEvByDocId[evReviewDocId]}
        pending={evReviewDocId != null ? pendingEvByDocId[evReviewDocId] ?? null : null}
        busy={evReviewBusy || approveBusy}
        onClose={() => setEvReviewDocId(null)}
        onApprove={handleApproveFromEvReview}
        onDiscard={handleDiscardEvReview}
      />
      </div>
    </div>
  );
}

// Doc types that have a document number (Aadhaar, PAN, DL, RC)
const DOC_TYPES_WITH_NUMBER = new Set([
  "aadhaar",
  "aadhaar_front",
  "aadhaar_back",
  "pan",
  "dl",
  "dl_front",
  "dl_back",
  "rc",
  "bank_proof",
]);

/** rider docType → verification-engine kind for agent electronic verify. */
const EV_KIND_BY_DOC_TYPE: Record<
  string,
  "pan" | "driving_licence" | "vehicle_rc" | "bank_account" | "aadhaar"
> = {
  aadhaar: "aadhaar",
  aadhaar_front: "aadhaar",
  pan: "pan",
  dl: "driving_licence",
  dl_front: "driving_licence",
  rc: "vehicle_rc",
  bank_proof: "bank_account",
};

// Document Card Component ? equal height, aligned, doc number always shown, image cache-bust
interface DocumentCardProps {
  riderId: number;
  docType: string;
  document: Document | null;
  isOptional?: boolean;
  titleOverride?: string;
  riderDob?: string | null;
  riderAadhaarNumber?: string | null;
  riderPanNumber?: string | null;
  /** Extra image URL (e.g. riders.selfie_url) when doc.fileUrl is missing/placeholder. */
  fallbackPreviewUrl?: string | null;
  imageRefreshKey?: number;
  onView: () => void;
  onEdit: () => void;
  onUpload?: () => void;
  onApprove: () => void;
  onReject: () => void;
  onElectronicVerified?: (
    data: Record<string, unknown>,
    meta?: {
      numberUsed: string;
      ifscUsed?: string | null;
      verificationId?: string | null;
      providerReference?: string | null;
      confidence?: number | null;
    },
  ) => void;
  pendingElectronicReview?: ElectronicVerifyPending | null;
  onOpenPendingElectronicReview?: () => void;
  isLoading: boolean;
  isDisabled?: boolean;
  allVersions: Document[];
  /** Show Cashfree EV even when no upload exists (bank electronic-only path). */
  allowEmptyElectronicVerify?: boolean;
}

function DocumentCard({
  riderId,
  docType,
  document,
  isOptional = false,
  titleOverride,
  riderDob,
  riderAadhaarNumber,
  riderPanNumber,
  fallbackPreviewUrl,
  imageRefreshKey,
  onView,
  onEdit,
  onUpload,
  onApprove,
  onReject,
  onElectronicVerified,
  pendingElectronicReview,
  onOpenPendingElectronicReview,
  isLoading,
  isDisabled = false,
  allVersions,
  allowEmptyElectronicVerify = false,
}: DocumentCardProps) {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [evModalOpen, setEvModalOpen] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);
  const hasMultipleVersions = allVersions.length > 1;
  const showDocNumber = DOC_TYPES_WITH_NUMBER.has(docType);
  const autoVerifyDisplay =
    document && docType !== "aadhaar_back"
      ? getRiderDocAutoVerificationDisplay(document)
      : null;
  const numberFromAuto =
    autoVerifyDisplay?.rows.find((r) =>
      [
        "PAN",
        "Masked Aadhaar",
        "DL number",
        "Registration number",
        "Aadhaar",
        "Account number",
      ].includes(r.label),
    )?.value ?? null;
  const docNumberDisplay = showDocNumber
    ? (
        document?.docNumber?.trim() ||
        numberFromAuto ||
        (docType === "pan" ? riderPanNumber?.trim() : null) ||
        (docType === "aadhaar_front" || docType === "aadhaar"
          ? riderAadhaarNumber?.trim()
          : null) ||
        "?"
      )
    : document
      ? "N/A"
      : "?";
  const imageUrl = resolveDocumentPreviewUrl(document, fallbackPreviewUrl);
  const imageKey = imageUrl ? `${imageUrl}-${imageRefreshKey ?? document?.id ?? ""}` : "no-image";
  const showPreview =
    Boolean(imageUrl) &&
    !previewBroken &&
    hasDocumentPreview(document, fallbackPreviewUrl);

  useEffect(() => {
    setPreviewBroken(false);
  }, [imageUrl, document?.id, imageRefreshKey]);
  const hasRealUpload =
    Boolean(document?.r2Key) ||
    (Boolean(document?.fileUrl) &&
      !isNonImageFileRef(document!.fileUrl) &&
      document!.fileUrl !== "pending" &&
      !String(document!.fileUrl).startsWith("placeholder"));
  const canApproveReject =
    Boolean(document) &&
    hasRealUpload &&
    isManualUploadMethod(document!.verificationMethod) &&
    !document!.verified &&
    !isDisabled;
  const canOfferEmptyActions =
    !isDisabled &&
    (!document || !hasRealUpload) &&
    !isElectronicallyVerifiedMethod(document?.verificationMethod);
  const canEv =
    Boolean(EV_KIND_BY_DOC_TYPE[docType]) &&
    (allowEmptyElectronicVerify || Boolean(document)) &&
    Boolean(onElectronicVerified);

  return (
    <div className="space-y-3">
      {/* Summary rows */}
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-2 border-b border-slate-100 px-3 py-2 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]">
          <p className="text-[11px] font-medium text-slate-500">Document</p>
          <p className="min-w-0 truncate text-[13px] font-semibold text-[#0A2342]">
            {titleOverride || DOCUMENT_LABELS[docType] || docType}
            {isOptional ? (
              <span className="ml-1 text-[11px] font-medium text-slate-400">(Optional)</span>
            ) : null}
            {hasMultipleVersions ? (
              <span className="ml-1.5 text-[11px] font-medium text-slate-400">
                · {allVersions.length} versions
              </span>
            ) : null}
          </p>
        </div>

        {document ? (
          <>
            {showDocNumber ? (
              <div className="grid grid-cols-1 items-start gap-2 border-b border-slate-100 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-slate-500">Method</p>
                  <div className="mt-0.5 min-w-0">
                    {(() => {
                      const badge = verificationMethodBadge(document.verificationMethod);
                      return (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
                        >
                          <CheckCircle className="h-3 w-3" />
                          {badge.label}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-slate-500">Number</p>
                  <div className="mt-0.5 flex min-w-0 items-center gap-2">
                    <p className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold tabular-nums text-slate-900">
                      {docNumberDisplay}
                    </p>
                  </div>
                </div>

                {docNumberDisplay && docNumberDisplay !== "?" && docNumberDisplay !== "N/A" ? (
                  <div className="pt-5 sm:pt-0">
                    <CopyTextButton value={String(docNumberDisplay)} />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-center gap-2 border-b border-slate-100 px-3 py-2 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]">
                <p className="text-[11px] font-medium text-slate-500">Method</p>
                <div className="min-w-0">
                  {(() => {
                    const badge = verificationMethodBadge(document.verificationMethod);
                    return (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
                      >
                        <CheckCircle className="h-3 w-3" />
                        {badge.label}
                      </span>
                    );
                  })()}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="px-3 py-4 text-center">
            <p className="text-sm font-semibold text-slate-700">
              {isOptional ? "Optional — not submitted" : "No document uploaded"}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Upload and verify here if the rider cannot finish this step in the app.
            </p>
          </div>
        )}
      </div>

      {document && showPreview ? (
        <button
          type="button"
          onClick={onView}
          className={
            docType === "selfie"
              ? "group relative mx-auto flex h-52 w-52 items-center justify-center overflow-hidden rounded-full border-2 border-emerald-200 bg-slate-100 shadow-sm"
              : "group relative block h-28 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
          }
        >
          {imageUrl ? (
            <img
              key={imageKey}
              src={imageUrl}
              alt={DOCUMENT_LABELS[docType]}
              className="h-full w-full object-cover object-center"
              onError={() => setPreviewBroken(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
              No image
            </div>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/25">
            <Eye className="h-5 w-5 text-white opacity-0 drop-shadow transition group-hover:opacity-100" />
          </span>
        </button>
      ) : !document && docType === "selfie" && fallbackPreviewUrl ? (
        <button
          type="button"
          onClick={onView}
          className="group relative mx-auto flex h-52 w-52 items-center justify-center overflow-hidden rounded-full border-2 border-emerald-200 bg-slate-100 shadow-sm"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fallbackPreviewUrl} alt="Selfie" className="h-full w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/25">
            <Eye className="h-5 w-5 text-white opacity-0 drop-shadow transition group-hover:opacity-100" />
          </span>
        </button>
      ) : null}

      {document && autoVerifyDisplay ? (
        <DocAutoVerificationDetailsView display={autoVerifyDisplay} variant="premium" />
      ) : document &&
        isElectronicallyVerifiedMethod(document.verificationMethod) &&
        !showPreview ? (
        <p className="rounded-lg border border-dashed border-sky-200 bg-sky-50/70 px-3 py-2 text-center text-[11px] text-sky-900">
          {isDashboardElectronicMethod(document.verificationMethod)
            ? "Verified electronically from dashboard. No structured provider fields were stored."
            : "Verified through the app. No structured provider fields were stored."}
        </p>
      ) : null}

      {(() => {
        const electronicOnly =
          document &&
          hasRealUpload &&
          isElectronicallyVerifiedMethod(document.verificationMethod);
        if (electronicOnly) return null;

        return (
          <div className="rounded-lg border border-slate-200 px-3 py-2.5">
            <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Actions
            </p>

            {canOfferEmptyActions ? (
              <div className="grid grid-cols-2 gap-2">
                {onUpload ? (
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => setUploadModalOpen(true)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload manually
                  </button>
                ) : (
                  <div />
                )}
                {canEv ? (
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => setEvModalOpen(true)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    Verify electronically
                  </button>
                ) : (
                  <div />
                )}
              </div>
            ) : document && hasRealUpload && isManualUploadMethod(document.verificationMethod) ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {document.r2Key ? (
                  <button
                    onClick={onView}
                    className="rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    View
                  </button>
                ) : null}
                <button
                  onClick={onEdit}
                  disabled={isLoading || isDisabled}
                  className="rounded-md bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                  title={isDisabled ? "Cannot edit - rider is blocked" : "Edit document"}
                >
                  <Edit className="h-3.5 w-3.5" />
                </button>
                {canApproveReject ? (
                  <>
                    <button
                      onClick={onApprove}
                      disabled={isLoading || isDisabled}
                      className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Approve"
                    >
                      {isLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={onReject}
                      disabled={isLoading || isDisabled}
                      className="rounded-md bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Reject"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : null}
                {canEv && !document.verified ? (
                  <button
                    type="button"
                    onClick={() => setEvModalOpen(true)}
                    className="rounded-md bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100"
                  >
                    Verify electronically
                  </button>
                ) : null}
              </div>
            ) : document && isElectronicallyVerifiedMethod(document.verificationMethod) ? (
              <p className="text-center text-xs text-slate-500">
                {verificationMethodFooter(document.verificationMethod)}
              </p>
            ) : (
              <p className="text-center text-xs text-slate-500">No actions available.</p>
            )}

            {uploadModalOpen ? (
              <ModalPortal>
                <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
                  <button
                    type="button"
                    className="absolute inset-0 bg-slate-900/35 backdrop-blur-md"
                    aria-label="Close"
                    onClick={() => setUploadModalOpen(false)}
                  />
                  <div className="relative z-[161] w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
                    <h4 className="text-base font-semibold text-[#0A2342]">Upload manually</h4>
                    <p className="mt-1 text-xs text-slate-500">
                      Upload a document file from the dashboard if the rider cannot finish this step
                      in the app.
                    </p>
                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setUploadModalOpen(false)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => {
                          setUploadModalOpen(false);
                          onUpload?.();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#0A2342] px-3 py-1.5 text-sm font-semibold text-white"
                      >
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        Continue to upload
                      </button>
                    </div>
                  </div>
                </div>
              </ModalPortal>
            ) : null}

            {evModalOpen && canEv && EV_KIND_BY_DOC_TYPE[docType] ? (
              <ModalPortal>
                <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
                  <button
                    type="button"
                    className="absolute inset-0 bg-slate-900/35 backdrop-blur-md"
                    aria-label="Close"
                    onClick={() => setEvModalOpen(false)}
                  />
                  <div className="relative z-[161] max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-base font-semibold text-[#0A2342]">
                          Verify electronically
                        </h4>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Same Cashfree check as the rider app. Does not require a photo upload.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEvModalOpen(false)}
                        className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                        aria-label="Close"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <ElectronicVerifyPanel
                      subjectType="rider"
                      subjectId={riderId}
                      docKind={EV_KIND_BY_DOC_TYPE[docType]}
                      verified={Boolean(document?.verified)}
                      hasPendingReview={!!pendingElectronicReview}
                      onOpenPendingReview={onOpenPendingElectronicReview}
                      imageKey={document?.r2Key}
                      prefill={{
                        number:
                          document?.docNumber?.trim() && document.docNumber.trim() !== "?"
                            ? document.docNumber
                            : riderAadhaarNumber ?? null,
                        name: null,
                        dob: document?.extractedDob || riderDob || null,
                        ifsc: null,
                      }}
                      onVerified={(data, meta) => {
                        onElectronicVerified?.(data, meta);
                        setEvModalOpen(false);
                      }}
                    />
                  </div>
                </div>
              </ModalPortal>
            ) : null}
          </div>
        );
      })()}
    </div>
  );
}

// Reject Modal Component
interface RejectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  documentName: string;
  reason: string;
  onReasonChange: (reason: string) => void;
  isLoading: boolean;
}

function RejectModal({
  isOpen,
  onClose,
  onConfirm,
  documentName,
  reason,
  onReasonChange,
  isLoading,
}: RejectModalProps) {
  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-md">
        <div className="relative z-[161] w-full max-w-md rounded-2xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b p-6">
            <h2 className="text-xl font-semibold text-gray-900">Reject Document</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            Rejecting: <span className="font-semibold">{documentName}</span>
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rejection Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="Enter reason for rejection..."
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <LoadingButton
            onClick={onConfirm}
            loading={isLoading}
            disabled={!reason.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Reject Document
          </LoadingButton>
        </div>
      </div>
      </div>
    </ModalPortal>
  );
}

// Step circles connected by lines — one circle per required document step.
function ProgressBar({
  label,
  current,
  total,
  uploaded,
}: {
  label: string;
  current: number;
  total: number;
  uploaded?: number;
}) {
  const steps = Math.max(1, total);
  const done = Math.max(0, Math.min(current, steps));
  const isComplete = done === steps && total > 0;

  return (
    <div className="rounded-xl border border-gray-100 bg-gradient-to-b from-slate-50/80 to-white px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold text-[#0A2342]">{label}</span>
        <span
          className={`shrink-0 text-[11px] font-semibold tabular-nums ${
            isComplete ? "text-emerald-600" : "text-gray-500"
          }`}
        >
          {done}/{steps} verified
          {typeof uploaded === "number" ? ` · ${uploaded}/${steps} uploaded` : ""}
          {isComplete ? " ✓" : ""}
        </span>
      </div>
      <div className="flex w-full items-center" aria-hidden>
        {Array.from({ length: steps }, (_, i) => {
          const filled = i < done;
          const connectorFilled = i < done;
          return (
            <Fragment key={i}>
              <span
                className={`h-3 w-3 shrink-0 rounded-full border-2 transition-colors ${
                  filled
                    ? "border-emerald-500 bg-emerald-500"
                    : "border-gray-300 bg-white"
                }`}
                title={`Step ${i + 1}${filled ? " complete" : ""}`}
              />
              {i < steps - 1 ? (
                <span
                  className={`mx-1.5 h-[2px] min-w-[12px] flex-1 rounded-full ${
                    connectorFilled ? "bg-emerald-500" : "bg-gray-200"
                  }`}
                />
              ) : null}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// Vehicle Info Item Component  
function VehicleInfoItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-white rounded-lg p-3 shadow-sm border border-violet-100">
      <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-semibold truncate ${highlight ? 'text-violet-900 font-bold font-mono' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}

