"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useDashboardAccessQuery } from "@/hooks/queries/useDashboardAccessQuery";
import { usePermissionsQuery } from "@/hooks/queries/usePermissionsQuery";
import { invalidateRiderSummary } from "@/lib/cache-invalidation";
import { useRiderDashboardOptional } from "@/context/RiderDashboardContext";
import { DocumentStatusBadge } from "@/components/riders/DocumentStatusBadge";
import { DocumentViewer } from "@/components/riders/DocumentViewer";
import { DocumentEditModal } from "@/components/riders/DocumentEditModal";
import { Edit, CheckCircle, XCircle, Eye, Loader2, AlertCircle, X } from "lucide-react";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { ONBOARDING_STAGE_LABELS } from "@/types/rider-dashboard";

interface Rider {
  id: number;
  name: string | null;
  mobile: string;
  countryCode: string;
  aadhaarNumber: string | null;
  panNumber: string | null;
  dob: string | null;
  onboardingStage: string;
  kycStatus: string;
  status: string;
  vehicleChoice?: string | null;
  city: string | null;
  state: string | null;
  createdAt: string;
  updatedAt: string;
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
  verificationMethod: "APP_VERIFIED" | "MANUAL_UPLOAD";
  verified: boolean;
  verifierUserId: number | null;
  verifierName: string | null;
  rejectedReason: string | null;
  extractedName: string | null;
  extractedDob: string | null;
  createdAt: string;
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

interface RiderData {
  rider: Rider;
  documents: Document[];
  vehicle?: VehicleInfo | null;
  onboardingPayments?: OnboardingPayment[];
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

const DOCUMENT_SECTIONS = {
  identity: ["aadhaar_front", "aadhaar_back", "pan", "selfie"],
  vehicle: ["dl_front", "dl_back", "rc"],
  additional: ["rental_proof", "ev_proof", "bank_proof", "insurance", "vehicle_image", "upi_qr_proof"],
};

export default function RiderOnboardingClient() {
  // ALL HOOKS MUST BE CALLED FIRST - BEFORE ANY CONDITIONAL RETURNS
  const { data: permissionsData, isLoading: permissionsLoading, error: permissionsError } = usePermissionsQuery();
  const { data: dashboardAccessData, isLoading: dashboardAccessLoading, error: dashboardAccessError } = useDashboardAccessQuery();

  const hasCachedPermissions = permissionsData != null;
  const hasCachedDashboardAccess = dashboardAccessData != null;
  const isSuperAdmin = permissionsData?.isSuperAdmin ?? false;
  const exists = permissionsData?.exists ?? false;

  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const riderDashboard = useRiderDashboardOptional();
  const riderId = parseInt(params.id as string);

  const [riderData, setRiderData] = useState<RiderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null); // docId being acted upon
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingDoc, setRejectingDoc] = useState<Document | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  // Force image reload on card when document is updated (fixes stale image after edit)
  const [imageRefreshKeys, setImageRefreshKeys] = useState<Record<number, number>>({});

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
      setError(null);

      const response = await fetch(`/api/riders/${riderId}`);
      const text = await response.text();
      let result: { success?: boolean; data?: RiderData; error?: string };
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error("Invalid response from server");
      }

      if (!result.success) {
        throw new Error(result.error || "Failed to fetch rider data");
      }

      setRiderData(result.data ?? null);
      // Use ref to avoid dependency issues
      syncDashboardStateFromRiderRef.current?.(result.data?.rider ?? null);
    } catch (err) {
      console.error("Error fetching rider data:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch rider data");
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
        // Use ref to avoid dependency issues
        syncDashboardStateFromRiderRef.current?.(result.data?.rider ?? null);
        setError(null);
      }
    } catch (err) {
      console.error("Error refetching rider data:", err);
      // Don?t set error state on background refetch ? user already saw success
    }
  }, [riderId]);

  // Fetch rider data - only fetch once when riderId changes
  useEffect(() => {
    if (isNaN(riderId)) {
      setError("Invalid rider ID");
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
    if (doc.verificationMethod === "MANUAL_UPLOAD") {
      setEditingDoc(doc);
      setEditModalOpen(true);
    }
  };

  const handleSaveEdit = async (data: { docNumber?: string; file?: File }) => {
    if (!editingDoc) return;

    try {
      setActionLoading(editingDoc.id);

      const formData = new FormData();
      // Always send current doc number when provided so DB persists it (avoids losing it on image-only update)
      if (data.docNumber !== undefined && data.docNumber !== null) {
        formData.append("docNumber", String(data.docNumber).trim() || "");
      } else if (editingDoc.docNumber != null && String(editingDoc.docNumber).trim()) {
        formData.append("docNumber", String(editingDoc.docNumber).trim());
      }
      if (data.file) {
        formData.append("file", data.file);
      }

      const response = await fetch(
        `/api/riders/${riderId}/documents/${editingDoc.id}`,
        {
          method: "PUT",
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

      // Apply updated document from API so new image and doc number show immediately (normalize camelCase/snake_case)
      const payload = result.data;
      const rawDoc =
        payload != null && typeof payload === "object" && "document" in payload
          ? (payload as { document?: unknown }).document ?? payload
          : payload;      const raw = rawDoc && typeof rawDoc === "object" ? (rawDoc as Record<string, unknown>) : null;
      const updatedDoc =
        raw
          ? {
              ...raw,
              fileUrl: (raw.fileUrl as string) ?? (raw.file_url as string),
              r2Key: (raw.r2Key as string) ?? (raw.r2_key as string),
              docNumber: (raw.docNumber as string | null) ?? (raw.doc_number as string | null) ?? null,
            }
          : null;

      if (updatedDoc && riderData) {
        const docId = editingDoc.id;
        const refreshTs = Date.now();
        setRiderData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            documents: prev.documents.map((d) => {
              if (d.id !== docId) return d;
              const merged = { ...d, ...updatedDoc };
              return {
                ...merged,
                fileUrl: (merged.fileUrl as string) ?? d.fileUrl,
                r2Key: (merged.r2Key as string) ?? d.r2Key,
                docNumber: (merged.docNumber as string | null) ?? d.docNumber ?? null,
              };
            }),
          };
        });
        setImageRefreshKeys((prev) => ({ ...prev, [docId]: refreshTs }));
      }
      setEditModalOpen(false);
      setEditingDoc(null);
      refetchRiderDataInBackground();
    } catch (err) {
      console.error("Error updating document:", err);
      alert(err instanceof Error ? err.message : "Failed to update document");
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveDocument = async (doc: Document) => {
    if (doc.verificationMethod !== "MANUAL_UPLOAD") return;
    if (!confirm(`Are you sure you want to approve this ${DOCUMENT_LABELS[doc.docType] || doc.docType}?`)) return;

    try {
      setActionLoading(doc.id);

      const response = await fetch(
        `/api/riders/${riderId}/documents/${doc.id}/approve`,
        { method: "POST" }
      );

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to approve document");
      }

      // Apply API result immediately so UI updates in one paint (no refetch needed; backend returns final state)
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
              d.id === doc.id && data.document
                ? { ...d, verified: true, verifierUserId: data.document.verifierUserId ?? d.verifierUserId, rejectedReason: null }
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
      // No refetch after approve: response already has final kycStatus, onboardingStage, status
    } catch (err) {
      console.error("Error approving document:", err);
      alert(err instanceof Error ? err.message : "Failed to approve document");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectDocument = (doc: Document) => {
    // Only allow rejecting MANUAL_UPLOAD documents
    if (doc.verificationMethod !== "MANUAL_UPLOAD") {
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
      setActionLoading(rejectingDoc.id);

      const response = await fetch(
        `/api/riders/${riderId}/documents/${rejectingDoc.id}/reject`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reason: rejectReason.trim() }),
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
              d.id === rejectingDoc.id
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
    if (docs.length === 0) return null;
    // Return the most recent one (already sorted by createdAt desc from API)
    return docs[0];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-red-600 font-semibold">Error</p>
          </div>
          <p className="text-red-500 text-sm mt-2">{error}</p>
        </div>
      </div>
    );
  }

  if (!riderData) {
    return (
      <div className="space-y-6 p-6">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-gray-500">Rider not found</p>
        </div>
      </div>
    );
  }

  const isAlreadyVerified = riderData.rider.onboardingStage === "ACTIVE" && riderData.rider.kycStatus === "APPROVED";
  const isBlocked = riderData.rider.status === "BLOCKED" || riderData.rider.status === "BANNED";

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rider Onboarding Verification</h1>
          <p className="text-sm text-gray-600 mt-1">
            Verify and approve rider documents for onboarding
          </p>
        </div>
        <button
          onClick={() => router.push("/dashboard/riders")}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
      </div>

      {/* Warning Banners */}
      {isAlreadyVerified && (
        <div className="rounded-xl border-2 border-green-200 bg-green-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-green-900">Rider Already Verified</h3>
              <p className="text-sm text-green-800 mt-1">
                This rider has completed onboarding and all documents have been verified. 
                The verification process should not be repeated unless re-verification is required.
              </p>
            </div>
          </div>
        </div>
      )}

      {isBlocked && (
        <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-red-900">Rider Account Blocked</h3>
              <p className="text-sm text-red-800 mt-1">
                This rider's account is currently blocked. Please unblock the rider from the main dashboard 
                before attempting to verify documents. Status: <span className="font-semibold">{riderData.rider.status}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Rider Info Summary */}
      <div className="rounded-xl border border-gray-200/90 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">Rider Information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Rider ID</p>
            <p className="text-sm font-medium text-gray-900">GMR{riderData.rider.id}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Name</p>
            <p className="text-sm font-medium text-gray-900">{riderData.rider.name || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Mobile</p>
            <p className="text-sm font-medium text-gray-900">{riderData.rider.mobile}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Onboarding Stage</p>
            <p className="text-sm font-medium text-gray-900">{ONBOARDING_STAGE_LABELS[riderData.rider.onboardingStage] ?? riderData.rider.onboardingStage}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">KYC Status</p>
            <p className="text-sm font-medium text-gray-900">{riderData.rider.kycStatus}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Status</p>
            <p className="text-sm font-medium text-gray-900">{riderData.rider.status}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">City</p>
            <p className="text-sm font-medium text-gray-900">{riderData.rider.city || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">State</p>
            <p className="text-sm font-medium text-gray-900">{riderData.rider.state || "-"}</p>
          </div>
          {/* Vehicle details: show when rider has vehicle or vehicleChoice */}
          {(riderData.vehicle || riderData.rider.vehicleChoice) && (
            <>
              <div>
                <p className="text-xs text-gray-500 mb-1">Vehicle / Fuel type</p>
                <p className="text-sm font-medium text-gray-900">
                  {riderData.vehicle?.fuelType || riderData.rider.vehicleChoice || "-"}
                </p>
              </div>
              {riderData.vehicle && (
                <>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Vehicle type</p>
                    <p className="text-sm font-medium text-gray-900">
                      {String(riderData.vehicle.vehicleType || "-").charAt(0).toUpperCase() +
                        String(riderData.vehicle.vehicleType || "").slice(1).toLowerCase()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Make</p>
                    <p className="text-sm font-medium text-gray-900">{riderData.vehicle.make || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Model</p>
                    <p className="text-sm font-medium text-gray-900">{riderData.vehicle.model || "-"}</p>
                  </div>
                  {riderData.vehicle.registrationNumber && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Registration</p>
                      <p className="text-sm font-medium text-gray-900">{riderData.vehicle.registrationNumber}</p>
                    </div>
                  )}
                  {(riderData.vehicle.vehicleCategory || riderData.vehicle.acType) && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Category / AC</p>
                      <p className="text-sm font-medium text-gray-900">
                        {[riderData.vehicle.vehicleCategory, riderData.vehicle.acType].filter(Boolean).join(" / ") || "-"}
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
        <div className="rounded-xl border-2 border-purple-200/80 bg-gradient-to-br from-purple-50 to-pink-50 p-6 shadow-md">
          <h2 className="text-lg font-bold mb-4 text-purple-900 flex items-center gap-2">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Onboarding Fees / Registration Payment
          </h2>
          <div className="mb-4 p-4 bg-white rounded-lg shadow-sm border border-purple-100">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Total Paid:</span>
              <span className="text-2xl font-bold text-purple-900 tabular-nums">
                ?{riderData.onboardingPayments.filter((p) => p.status === "completed").reduce((sum, p) => sum + Number(p.amount), 0).toFixed(2)}
              </span>
            </div>
            {riderData.onboardingPayments.some(p => p.status !== "completed") && (
              <div className="mt-2 text-xs text-amber-600">
                Note: Some payments are pending or failed
              </div>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-purple-100">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-purple-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Ref ID</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Amount</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Provider</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Payment ID</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {riderData.onboardingPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-gray-900 text-xs">{p.refId || "?"}</td>
                    <td className="px-3 py-2 font-bold text-gray-900 tabular-nums">?{Number(p.amount).toFixed(2)}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs">{p.provider || "?"}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.status === "completed" ? "bg-emerald-100 text-emerald-800" :
                        p.status === "failed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-600 text-xs">{p.paymentId || "?"}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs">{new Date(p.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Verification Progress Summary */}
      <div className="rounded-xl border-2 border-blue-200/80 bg-gradient-to-br from-blue-50 to-indigo-50 p-6 shadow-md">
        <h2 className="text-lg font-bold mb-4 text-blue-900">Verification Progress</h2>
        <div className="space-y-3">
          {(() => {
            const allDocs = riderData.documents || [];
            const identityDocs = allDocs.filter(d => DOCUMENT_SECTIONS.identity.includes(d.docType));
            const identityVerified = identityDocs.filter(d => d.verified).length;
            const identityTotal = DOCUMENT_SECTIONS.identity.length;
            
            const vehicleDocs = allDocs.filter(d => DOCUMENT_SECTIONS.vehicle.includes(d.docType));
            const vehicleVerified = vehicleDocs.filter(d => d.verified).length;
            const vehicleTotal = DOCUMENT_SECTIONS.vehicle.length;
            
            const additionalDocs = allDocs.filter(d => DOCUMENT_SECTIONS.additional.includes(d.docType));
            const additionalVerified = additionalDocs.filter(d => d.verified).length;
            
            const allRequiredVerified = identityVerified === identityTotal && vehicleVerified === vehicleTotal;
            
            return (
              <>
                <ProgressBar label="Identity Documents" current={identityVerified} total={identityTotal} />
                <ProgressBar label="Vehicle Documents" current={vehicleVerified} total={vehicleTotal} />
                {additionalDocs.length > 0 && (
                  <ProgressBar label="Additional Documents" current={additionalVerified} total={additionalDocs.length} />
                )}
                
                {allRequiredVerified && (
                  <div className="mt-4 p-4 bg-green-100 border-2 border-green-300 rounded-lg shadow-sm">
                    <p className="text-sm font-semibold text-green-900 flex items-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      All required documents verified! Rider ready for activation.
                    </p>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* Identity Documents */}
      <div className="rounded-xl border border-gray-200/90 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">Identity Documents</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {DOCUMENT_SECTIONS.identity.map((docType) => {
            const doc = getLatestDocument(docType);
            return (
              <DocumentCard
                key={docType}
                docType={docType}
                document={doc}
                imageRefreshKey={doc ? imageRefreshKeys[doc.id] : undefined}
                onView={() => doc && doc.verificationMethod === "MANUAL_UPLOAD" && doc.r2Key && handleViewDocument(doc)}
                onEdit={() => doc && doc.verificationMethod === "MANUAL_UPLOAD" && !isBlocked && handleEditDocument(doc)}
                onApprove={() => doc && doc.verificationMethod === "MANUAL_UPLOAD" && !doc.verified && !isBlocked && handleApproveDocument(doc)}
                onReject={() => doc && doc.verificationMethod === "MANUAL_UPLOAD" && !doc.verified && !isBlocked && handleRejectDocument(doc)}
                isLoading={actionLoading === doc?.id}
                isDisabled={isBlocked}
                allVersions={getDocumentsByType(docType)}
              />
            );
          })}
        </div>
      </div>

      {/* Vehicle Documents */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">Vehicle Documents</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
          {DOCUMENT_SECTIONS.vehicle.map((docType) => {
            const doc = getLatestDocument(docType);
            return (
              <DocumentCard
                key={docType}
                docType={docType}
                document={doc}
                imageRefreshKey={doc ? imageRefreshKeys[doc.id] : undefined}
                onView={() => doc && doc.verificationMethod === "MANUAL_UPLOAD" && doc.r2Key && handleViewDocument(doc)}
                onEdit={() => doc && doc.verificationMethod === "MANUAL_UPLOAD" && !isBlocked && handleEditDocument(doc)}
                onApprove={() => doc && doc.verificationMethod === "MANUAL_UPLOAD" && !doc.verified && !isBlocked && handleApproveDocument(doc)}
                onReject={() => doc && doc.verificationMethod === "MANUAL_UPLOAD" && !doc.verified && !isBlocked && handleRejectDocument(doc)}
                isLoading={actionLoading === doc?.id}
                isDisabled={isBlocked}
                allVersions={getDocumentsByType(docType)}
              />
            );
          })}
        </div>
      </div>

      {/* Additional Documents */}
      <div className="rounded-xl border border-gray-200/90 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">Additional Documents</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
          {DOCUMENT_SECTIONS.additional.map((docType) => {
            const doc = getLatestDocument(docType);
            return (
              <DocumentCard
                key={docType}
                docType={docType}
                document={doc}
                imageRefreshKey={doc ? imageRefreshKeys[doc.id] : undefined}
                onView={() => doc && doc.verificationMethod === "MANUAL_UPLOAD" && doc.r2Key && handleViewDocument(doc)}
                onEdit={() => doc && doc.verificationMethod === "MANUAL_UPLOAD" && !isBlocked && handleEditDocument(doc)}
                onApprove={() => doc && doc.verificationMethod === "MANUAL_UPLOAD" && !doc.verified && !isBlocked && handleApproveDocument(doc)}
                onReject={() => doc && doc.verificationMethod === "MANUAL_UPLOAD" && !doc.verified && !isBlocked && handleRejectDocument(doc)}
                isLoading={actionLoading === doc?.id}
                isDisabled={isBlocked}
                allVersions={getDocumentsByType(docType)}
              />
            );
          })}
        </div>
      </div>

      {/* Document Viewer */}
      {selectedDocument && (
        <DocumentViewer
          isOpen={viewerOpen}
          onClose={() => {
            setViewerOpen(false);
            setSelectedDocument(null);
          }}
          imageUrl={selectedDocument.fileUrl ?? ""}
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
          currentDocNumber={editingDoc.docNumber}
          currentImageUrl={editingDoc.fileUrl}
          docType={editingDoc.docType}
          isLoading={actionLoading === editingDoc.id}
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
          isLoading={actionLoading === rejectingDoc.id}
        />
      )}
    </div>
  );
}

// Doc types that have a document number (Aadhaar, PAN, DL, RC)
const DOC_TYPES_WITH_NUMBER = new Set(["aadhaar", "pan", "dl", "rc"]);

// Document Card Component ? equal height, aligned, doc number always shown, image cache-bust
interface DocumentCardProps {
  docType: string;
  document: Document | null;
  imageRefreshKey?: number;
  onView: () => void;
  onEdit: () => void;
  onApprove: () => void;
  onReject: () => void;
  isLoading: boolean;
  isDisabled?: boolean;
  allVersions: Document[];
}

function DocumentCard({
  docType,
  document,
  imageRefreshKey,
  onView,
  onEdit,
  onApprove,
  onReject,
  isLoading,
  isDisabled = false,
  allVersions,
}: DocumentCardProps) {
  const hasMultipleVersions = allVersions.length > 1;
  const showDocNumber = DOC_TYPES_WITH_NUMBER.has(docType);
  const docNumberDisplay = document
    ? showDocNumber
      ? (document.docNumber?.trim() || "?")
      : "N/A"
    : "?";
  // Use fileUrl as-is: presigned URLs break if we append query params (signature is over exact URL)
  const imageUrl = document?.fileUrl ? document.fileUrl : "";
  const imageKey = imageUrl ? `${imageUrl}-${imageRefreshKey ?? document?.id ?? ""}` : "no-image";

  return (
    <div className="border border-gray-200/90 rounded-xl p-5 bg-white shadow-sm hover:shadow-lg transition-all duration-200 h-full flex flex-col min-h-[340px]">
      <div className="flex items-start justify-between gap-2 mb-3 min-h-[52px]">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">
            {DOCUMENT_LABELS[docType] || docType}
          </h3>
          {hasMultipleVersions && (
            <p className="text-xs text-gray-500 mt-0.5">
              {allVersions.length} version{allVersions.length > 1 ? "s" : ""}
            </p>
          )}
        </div>
        {document && (
          <div className="flex-shrink-0 max-w-[55%] min-w-0 text-right line-clamp-2">
            <DocumentStatusBadge
              verified={document.verified}
              rejectedReason={document.rejectedReason}
              verifierName={document.verifierName}
              verifiedAt={document.createdAt}
            />
          </div>
        )}
      </div>

      {document ? (
        <>
          {/* Verification Method Badge */}
          <div className="mb-2">
            {document.verificationMethod === "APP_VERIFIED" ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
                <CheckCircle className="h-3 w-3" />
                App Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-800 text-xs font-medium">
                Manual Upload
              </span>
            )}
          </div>

          {/* Document Number - always show for Aadhaar, PAN, DL, RC (show "?" when empty) */}
          {showDocNumber && (
            <div className="mb-3 min-h-[40px] flex flex-col justify-center">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-0.5">Document Number</p>
              <p className="text-sm font-semibold text-gray-900 tabular-nums">{docNumberDisplay}</p>
            </div>
          )}

          {/* Document Preview - Only show for MANUAL_UPLOAD; fixed height for alignment */}
          {document.verificationMethod === "MANUAL_UPLOAD" && document.r2Key && (
            <div className="mb-3 relative flex-shrink-0">
              <button
                type="button"
                onClick={onView}
                className="w-full h-36 bg-gray-100 rounded-xl overflow-hidden border border-gray-200/80 shadow-inner hover:border-blue-400 hover:shadow-md transition-all duration-200 group block"
              >
                {imageUrl ? (
                  <img
                    key={imageKey}
                    src={imageUrl}
                    alt={DOCUMENT_LABELS[docType]}
                    className="w-full h-full object-cover object-center group-hover:scale-[1.02] transition-transform duration-200"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150'%3E%3Crect fill='%23f3f4f6' width='200' height='150'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='12' fill='%236b7280'%3EImage%3C/text%3E%3C/svg%3E";
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                    No image
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors duration-200">
                  <Eye className="h-7 w-7 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                </div>
              </button>
            </div>
          )}

          {/* For APP_VERIFIED: Show info message (same height as image area for alignment) */}
          {document.verificationMethod === "APP_VERIFIED" && (
            <div className="mb-3 h-36 flex-shrink-0 flex items-center justify-center p-3 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200/80 rounded-xl">
              <p className="text-xs text-blue-800 text-center">
                Verified through the app. No image stored.
              </p>
            </div>
          )}

          {/* Actions - Different for APP_VERIFIED vs MANUAL_UPLOAD */}
          {document.verificationMethod === "APP_VERIFIED" ? (
            // APP_VERIFIED: Already verified, no actions needed
            <div className="text-center py-2">
              <p className="text-xs text-gray-500">Already verified through app</p>
            </div>
          ) : (
            // MANUAL_UPLOAD: Show edit/approve/reject actions
            <div className="flex items-center gap-2">
              {document.r2Key && (
                <button
                  onClick={onView}
                  className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                >
                  View
                </button>
              )}
              <button
                onClick={onEdit}
                disabled={isLoading || isDisabled}
                className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={isDisabled ? "Cannot edit - rider is blocked" : "Edit document number or upload new image"}
              >
                <Edit className="h-3.5 w-3.5" />
              </button>
              {!document.verified && (
                <>
                  <button
                    onClick={onApprove}
                    disabled={isLoading || isDisabled}
                    className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={isDisabled ? "Cannot approve - rider is blocked" : "Approve this document"}
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
                    className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={isDisabled ? "Cannot reject - rider is blocked" : "Reject this document"}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-8 text-gray-400">
          <p className="text-sm">No document uploaded</p>
        </div>
      )}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
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
  );
}

// Progress Bar Component for Verification Progress
function ProgressBar({ label, current, total }: { label: string; current: number; total: number }) {
  const percentage = total > 0 ? (current / total) * 100 : 0;
  const isComplete = current === total && total > 0;
  
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className={`text-sm font-bold ${isComplete ? 'text-green-600' : 'text-gray-900'}`}>
          {current}/{total}
          {isComplete && ' ?'}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden shadow-inner">
        <div
          className={`h-3 rounded-full transition-all duration-500 ${
            isComplete ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
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
