"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useDashboardAccessQuery } from "@/hooks/queries/useDashboardAccessQuery";
import { usePermissionsQuery } from "@/hooks/queries/usePermissionsQuery";
import { DocumentStatusBadge } from "@/components/riders/DocumentStatusBadge";
import { DocumentViewer } from "@/components/riders/DocumentViewer";
import { DocumentEditModal } from "@/components/riders/DocumentEditModal";
import { Edit, CheckCircle, XCircle, Eye, Loader2, AlertCircle, X } from "lucide-react";
import { LoadingButton } from "@/components/ui/LoadingButton";

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

interface RiderData {
  rider: Rider;
  documents: Document[];
  vehicle?: VehicleInfo | null;
}

const DOCUMENT_LABELS: Record<string, string> = {
  aadhaar: "Aadhaar Card",
  pan: "PAN Card",
  dl: "Driving License (DL)",
  rc: "RC (Registration Certificate)",
  selfie: "Selfie",
  rental_proof: "Rental Proof (EV Bikes)",
  ev_proof: "EV Proof",
};

const DOCUMENT_SECTIONS = {
  identity: ["aadhaar", "pan", "selfie"],
  vehicle: ["dl", "rc"],
  additional: ["rental_proof", "ev_proof"],
};

export default function RiderOnboardingPage() {
  // ALL HOOKS MUST BE CALLED FIRST - BEFORE ANY CONDITIONAL RETURNS
  const { isSuperAdmin, loading: permissionsLoading, exists, error: permissionsError } = usePermissions();
  const { data: dashboardAccessData, isLoading: dashboardAccessLoading, error: dashboardAccessError } = useDashboardAccessQuery();
  
  const params = useParams();
  const router = useRouter();
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
    } catch (err) {
      console.error("Error fetching rider data:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch rider data");
    } finally {
      setLoading(false);
    }
  }, [riderId]);

  // Silent refetch without full-page loading – use after approve/reject/edit so UI doesn’t flash
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
        setError(null);
      }
    } catch (err) {
      console.error("Error refetching rider data:", err);
      // Don’t set error state on background refetch – user already saw success
    }
  }, [riderId]);

  // Fetch rider data
  useEffect(() => {
    if (isNaN(riderId)) {
      setError("Invalid rider ID");
      setLoading(false);
      return;
    }

    fetchRiderData();
  }, [riderId, fetchRiderData]);

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
  if (!isSuperAdmin && !hasRiderAccess) {
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
      const rawDoc = result.data?.document ?? result.data;
      const raw = rawDoc && typeof rawDoc === "object" ? (rawDoc as Record<string, unknown>) : null;
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
          onClick={() => router.back()}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
      </div>

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
            <p className="text-sm font-medium text-gray-900">{riderData.rider.onboardingStage}</p>
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
                onEdit={() => doc && doc.verificationMethod === "MANUAL_UPLOAD" && handleEditDocument(doc)}
                onApprove={() => doc && doc.verificationMethod === "MANUAL_UPLOAD" && !doc.verified && handleApproveDocument(doc)}
                onReject={() => doc && doc.verificationMethod === "MANUAL_UPLOAD" && !doc.verified && handleRejectDocument(doc)}
                isLoading={actionLoading === doc?.id}
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
                onEdit={() => doc && doc.verificationMethod === "MANUAL_UPLOAD" && handleEditDocument(doc)}
                onApprove={() => doc && doc.verificationMethod === "MANUAL_UPLOAD" && !doc.verified && handleApproveDocument(doc)}
                onReject={() => doc && doc.verificationMethod === "MANUAL_UPLOAD" && !doc.verified && handleRejectDocument(doc)}
                isLoading={actionLoading === doc?.id}
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
                onEdit={() => doc && doc.verificationMethod === "MANUAL_UPLOAD" && handleEditDocument(doc)}
                onApprove={() => doc && doc.verificationMethod === "MANUAL_UPLOAD" && !doc.verified && handleApproveDocument(doc)}
                onReject={() => doc && doc.verificationMethod === "MANUAL_UPLOAD" && !doc.verified && handleRejectDocument(doc)}
                isLoading={actionLoading === doc?.id}
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

// Document Card Component – equal height, aligned, doc number always shown, image cache-bust
interface DocumentCardProps {
  docType: string;
  document: Document | null;
  imageRefreshKey?: number;
  onView: () => void;
  onEdit: () => void;
  onApprove: () => void;
  onReject: () => void;
  isLoading: boolean;
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
  allVersions,
}: DocumentCardProps) {
  const hasMultipleVersions = allVersions.length > 1;
  const showDocNumber = DOC_TYPES_WITH_NUMBER.has(docType);
  const docNumberDisplay = document
    ? showDocNumber
      ? (document.docNumber?.trim() || "—")
      : "N/A"
    : "—";
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

          {/* Document Number - always show for Aadhaar, PAN, DL, RC (show "—" when empty) */}
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
                disabled={isLoading}
                className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 transition-colors disabled:opacity-50"
                title="Edit document number or upload new image"
              >
                <Edit className="h-3.5 w-3.5" />
              </button>
              {!document.verified && (
                <>
                  <button
                    onClick={onApprove}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded hover:bg-green-100 transition-colors disabled:opacity-50"
                    title="Approve this document"
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={onReject}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100 transition-colors disabled:opacity-50"
                    title="Reject this document"
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
            isLoading={isLoading}
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
