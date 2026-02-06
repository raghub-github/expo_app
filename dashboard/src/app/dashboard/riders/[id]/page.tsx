"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useDashboardAccessQuery } from '@/hooks/queries/useDashboardAccessQuery';
import { usePermissions } from '@/hooks/queries/usePermissionsQuery';
import { queryKeys } from '@/lib/queryKeys';
import { CheckCircle, ArrowLeft, User, Car, Wallet, FileText } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface Rider {
  id: number;
  name: string | null;
  mobile: string;
  countryCode: string;
  aadhaarNumber: string | null;
  panNumber: string | null;
  dob: string | null;
  selfieUrl: string | null;
  onboardingStage: string;
  kycStatus: string;
  status: string;
  city: string | null;
  state: string | null;
  pincode: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  referralCode: string | null;
  referredBy: number | null;
  defaultLanguage: string;
  createdAt: string;
  updatedAt: string;
}

interface WalletInfo {
  totalBalance: string;
  globalWalletBlock?: boolean;
  earningsFood: string;
  earningsParcel: string;
  earningsPersonRide: string;
  penaltiesFood: string;
  penaltiesParcel: string;
  penaltiesPersonRide: string;
  totalWithdrawn: string;
  lastUpdatedAt: string | null;
}

interface LedgerEntry {
  id: number;
  riderId: number;
  entryType: string;
  amount: string;
  balance: string | null;
  serviceType: string | null;
  ref: string | null;
  refType: string | null;
  description: string | null;
  createdAt: string;
}

interface PenaltyEntry {
  id: number;
  orderId: number | null;
  serviceType: string;
  penaltyType: string;
  amount: string;
  reason: string | null;
  status: string;
  imposedAt: string | null;
  resolvedAt: string | null;
}

interface WithdrawalEntry {
  id: number;
  amount: string;
  status: string;
  bankAcc: string;
  ifsc: string;
  accountHolderName: string;
  transactionId: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RiderData {
  rider: Rider;
  documents: any[];
  vehicle?: {
    id: number;
    vehicleType: string;
    registrationNumber: string;
    make: string | null;
    model: string | null;
    fuelType: string | null;
    vehicleCategory: string | null;
    acType: string | null;
  } | null;
  wallet?: WalletInfo | null;
  recentLedger?: LedgerEntry[];
  recentPenalties?: PenaltyEntry[];
  recentWithdrawals?: WithdrawalEntry[];
}

export default function RiderDetailsPage() {
  // ALL HOOKS MUST BE CALLED FIRST - BEFORE ANY CONDITIONAL RETURNS
  const { data: permissionsData, isLoading: permissionsLoading, error: permissionsError } = usePermissionsQuery();
  const { data: dashboardAccessData, isLoading: dashboardAccessLoading, error: dashboardAccessError } = useDashboardAccessQuery();
  const isSuperAdmin = permissionsData?.isSuperAdmin ?? false;
  const exists = permissionsData?.exists ?? false;
  const hasCachedPermissions = permissionsData != null;
  const hasCachedDashboardAccess = dashboardAccessData != null;
  const accessLoading = (permissionsLoading && !hasCachedPermissions) || (dashboardAccessLoading && !hasCachedDashboardAccess);
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const riderId = parseInt(params.id as string);

  const [riderData, setRiderData] = useState<RiderData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Check if user has rider access
  const hasRiderAccess = dashboardAccessData?.dashboards.some(
    (d) => d.dashboardType === "RIDER" && d.isActive
  ) ?? false;

  // Fetch rider data
  useEffect(() => {
    if (isNaN(riderId)) {
      setError("Invalid rider ID");
      setLoading(false);
      return;
    }

    fetchRiderData();
  }, [riderId]);

  const fetchRiderData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/riders/${riderId}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to fetch rider data");
      }

      setRiderData(result.data);
    } catch (err) {
      console.error("Error fetching rider data:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch rider data");
    } finally {
      setLoading(false);
    }
  };

  const handleRetryAccess = () => {
    setSlowPermissionCheck(false);
    queryClient.invalidateQueries({ queryKey: queryKeys.permissions() });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboardAccess() });
  };

  // Only show error when we have no cached data
  if ((permissionsError || dashboardAccessError) && !hasCachedPermissions && !hasCachedDashboardAccess) {
    const msg = permissionsError instanceof Error ? permissionsError.message : dashboardAccessError instanceof Error ? dashboardAccessError.message : "Failed to load access.";
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <p className="text-amber-800 font-semibold">Could not load permissions</p>
          <p className="text-amber-700 text-sm mt-2">{msg}</p>
          <button type="button" onClick={handleRetryAccess} className="mt-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Server layout already verified RIDER access; don't block on client permission load.
  // Only show "User not found" when we have permission data and user isn't in system.
  if (hasCachedPermissions && !exists) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6">
          <p className="text-yellow-600 font-semibold">User Not Found</p>
          <p className="text-yellow-500 text-sm mt-2">
            Your account is not registered in the system. Please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  // Safety net: server already enforces RIDER access
  if (hasCachedDashboardAccess && !isSuperAdmin && !hasRiderAccess) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <p className="text-red-600 font-semibold">Access Denied</p>
          <p className="text-red-500 text-sm mt-2">
            You don't have permission to access the Rider Dashboard. Please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  // Utility to mask document numbers
  function maskDocumentNumber(doc?: string | null): string {
    if (!doc || doc.length < 5) return doc || "-";
    const start = doc.slice(0, 4);
    const end = doc.slice(-2);
    const masked = doc.length > 6 ? ' •••• '.padEnd(doc.length - 6 + 5, '•') : '•••';
    return `${start}${masked}${end}`;
  }

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner
            size="lg"
            variant="default"
            text="Loading rider details..."
            className="text-blue-600"
          />
        </div>
      </div>
    );
  }

  // Error state
  if (error || !riderData) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => router.push('/dashboard/riders')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Riders</span>
        </button>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <p className="text-red-600 font-semibold">Error</p>
          <p className="text-red-500 text-sm mt-2">
            {error || "Rider not found"}
          </p>
        </div>
      </div>
    );
  }

  const rider = riderData.rider;
  const documents = riderData.documents || [];
  const vehicle = riderData.vehicle ?? null;
  const wallet = riderData.wallet ?? null;

  const isFullyOnboarded =
    rider.status === 'ACTIVE' &&
    rider.kycStatus === 'APPROVED' &&
    rider.onboardingStage === 'ACTIVE';

  // Check if verification is needed
  const needsVerification = !isFullyOnboarded;

  const documentLabels: Record<string, string> = {
    aadhaar: "Aadhaar Card",
    pan: "PAN Card",
    dl: "Driving License",
    rc: "RC (Registration Certificate)",
    selfie: "Selfie",
    rental_proof: "Rental Proof (EV Bikes)",
    ev_proof: "EV Proof",
  };

  const statusBadgeClass = (status: string) => {
    const s = status?.toLowerCase() || '';
    if (s === 'active' || s === 'approved') return 'bg-emerald-100 text-emerald-800';
    if (s === 'pending' || s === 'in_progress') return 'bg-amber-100 text-amber-800';
    if (s === 'rejected' || s === 'failed') return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6 w-full max-w-full overflow-x-hidden px-1 sm:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <button
            onClick={() => router.push('/dashboard/riders')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors shrink-0 py-1 -ml-1 rounded-lg hover:bg-gray-100 px-2"
            aria-label="Back to Riders"
          >
            <ArrowLeft className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium hidden sm:inline">Back to Riders</span>
          </button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 truncate">
              Rider Details
            </h1>
            <p className="text-sm text-gray-500 font-mono mt-0.5">GMR{rider.id}</p>
          </div>
        </div>
        {needsVerification && (
          <button
            onClick={() => router.push(`/dashboard/riders/${rider.id}/onboarding`)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-sm shadow-sm shrink-0"
          >
            <CheckCircle className="h-4 w-4" />
            Verify Onboarding Documents
          </button>
        )}
      </div>

      {/* Core Information */}
      <section className="rounded-2xl border border-gray-200/90 bg-white p-4 sm:p-5 lg:p-6 shadow-sm ring-1 ring-gray-900/5">
        <div className="flex items-center gap-2 mb-4 sm:mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 shrink-0">
            <User className="h-5 w-5" />
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">Core Information</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-4 sm:gap-5">
          <InfoRow label="Name" value={rider.name || "—"} />
          <InfoRow label="Rider ID" value={`GMR${rider.id}`} highlight />
          <InfoRow label="Mobile" value={rider.mobile} />
          <InfoRow label="Country Code" value={rider.countryCode} />
          <InfoRow label="Aadhaar Number" value={maskDocumentNumber(rider.aadhaarNumber)} />
          <InfoRow label="PAN Number" value={maskDocumentNumber(rider.panNumber)} />
          <InfoRow label="DOB" value={rider.dob ? new Date(rider.dob).toLocaleDateString() : "—"} />
          <InfoRow label="City" value={rider.city || "—"} />
          <InfoRow label="State" value={rider.state || "—"} />
          <InfoRow label="Pincode" value={rider.pincode || "—"} />
          <InfoRow label="Address" value={rider.address || "—"} className="col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-4" />
          <div className="col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-4 flex flex-wrap gap-2">
            <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${statusBadgeClass(rider.onboardingStage)}`}>Onboarding: {rider.onboardingStage}</span>
            <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${statusBadgeClass(rider.kycStatus)}`}>KYC: {rider.kycStatus}</span>
            <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${statusBadgeClass(rider.status)}`}>Status: {rider.status}</span>
          </div>
          <InfoRow label="Referral Code" value={rider.referralCode || "—"} />
          <InfoRow label="Referred By" value={rider.referredBy ? `GMR${rider.referredBy}` : "—"} />
          <InfoRow label="Default Language" value={rider.defaultLanguage} />
          <InfoRow label="Created At" value={rider.createdAt ? new Date(rider.createdAt).toLocaleString() : "—"} />
          <InfoRow label="Updated At" value={rider.updatedAt ? new Date(rider.updatedAt).toLocaleString() : "—"} />
        </div>
      </section>

      {/* Vehicle */}
      <section className="rounded-2xl border border-gray-200/90 bg-white p-4 sm:p-5 lg:p-6 shadow-sm ring-1 ring-gray-900/5">
        <div className="flex items-center gap-2 mb-4 sm:mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600 shrink-0">
            <Car className="h-5 w-5" />
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">Vehicle</h2>
        </div>
        {vehicle ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-4 sm:gap-5">
            <InfoRow label="Type" value={vehicle.vehicleType ? String(vehicle.vehicleType).charAt(0).toUpperCase() + String(vehicle.vehicleType).slice(1) : "—"} />
            <InfoRow label="Registration" value={vehicle.registrationNumber || "—"} highlight />
            <InfoRow label="Make" value={vehicle.make || "—"} />
            <InfoRow label="Model" value={vehicle.model || "—"} />
            <InfoRow label="Fuel" value={vehicle.fuelType || "—"} />
            <InfoRow label="Category" value={vehicle.vehicleCategory ? String(vehicle.vehicleCategory).replace(/_/g, " ") : "—"} />
            {vehicle.acType && <InfoRow label="AC Type" value={vehicle.acType} />}
          </div>
        ) : (
          <p className="text-sm text-gray-500 py-2">No vehicle on file.</p>
        )}
      </section>

      {/* Current Wallet */}
      {wallet && (
        <section className="rounded-2xl border border-gray-200/90 bg-white p-4 sm:p-5 lg:p-6 shadow-sm ring-1 ring-gray-900/5">
          <div className="flex items-center gap-2 mb-4 sm:mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 shrink-0">
              <Wallet className="h-5 w-5" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Current Wallet</h2>
          </div>
          {wallet.globalWalletBlock && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-sm font-medium text-amber-900">All services blocked (wallet ≤ -200). Unlock when balance ≥ 0.</p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-4 sm:gap-5">
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 col-span-1 sm:col-span-2">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Balance</span>
              <p className={`text-2xl sm:text-3xl font-bold mt-1 ${Number(wallet.totalBalance) < 0 ? "text-red-600" : "text-gray-900"}`}>
                ₹{Number(wallet.totalBalance).toFixed(2)}
              </p>
            </div>
            <InfoRow label="Earnings (Food)" value={`₹${Number(wallet.earningsFood).toFixed(2)}`} />
            <InfoRow label="Earnings (Parcel)" value={`₹${Number(wallet.earningsParcel).toFixed(2)}`} />
            <InfoRow label="Earnings (Person Ride)" value={`₹${Number(wallet.earningsPersonRide).toFixed(2)}`} />
            <InfoRow label="Penalties (Food)" value={`₹${Number(wallet.penaltiesFood).toFixed(2)}`} valueClassName="text-red-600" />
            <InfoRow label="Penalties (Parcel)" value={`₹${Number(wallet.penaltiesParcel).toFixed(2)}`} valueClassName="text-red-600" />
            <InfoRow label="Penalties (Person Ride)" value={`₹${Number(wallet.penaltiesPersonRide).toFixed(2)}`} valueClassName="text-red-600" />
            <InfoRow label="Total Withdrawn" value={`₹${Number(wallet.totalWithdrawn).toFixed(2)}`} />
            {wallet.lastUpdatedAt && (
              <InfoRow label="Last Updated" value={new Date(wallet.lastUpdatedAt).toLocaleString()} valueClassName="text-gray-500" />
            )}
          </div>
        </section>
      )}

      {/* Documents */}
      <section className="rounded-2xl border border-gray-200/90 bg-white p-4 sm:p-5 lg:p-6 shadow-sm ring-1 ring-gray-900/5">
        <div className="flex items-center gap-2 mb-4 sm:mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600 shrink-0">
            <FileText className="h-5 w-5" />
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">Documents</h2>
        </div>
        {documents.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {documents.map((doc) => (
              <div key={doc.id} className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 hover:border-gray-300 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                    {documentLabels[doc.docType] || doc.docType}
                  </h3>
                  <span className={`shrink-0 px-2 py-1 text-xs font-medium rounded-full ${
                    doc.verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                  }`}>
                    {doc.verified ? "Verified" : "Pending"}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-gray-600">
                  <p><span className="font-medium text-gray-700">Method:</span> {doc.verificationMethod || "N/A"}</p>
                  {doc.docNumber && <p><span className="font-medium text-gray-700">Number:</span> {doc.docNumber}</p>}
                  {doc.verifierName && <p><span className="font-medium text-gray-700">Verified by:</span> {doc.verifierName}</p>}
                  {doc.rejectedReason && (
                    <p className="text-red-600"><span className="font-medium">Rejected:</span> {doc.rejectedReason}</p>
                  )}
                  <p className="text-gray-500 pt-1">{new Date(doc.createdAt).toLocaleDateString()}</p>
                </div>
                {doc.fileUrl && (
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    View Document →
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 py-2">No documents found.</p>
        )}
      </section>
    </div>
  );
}

function InfoRow({
  label,
  value,
  highlight,
  className = "",
  valueClassName = "",
}: {
  label: string;
  value: string;
  highlight?: boolean;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${className}`}>
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <span
        className={`text-sm font-semibold break-words leading-tight ${
          highlight ? "text-gray-900 font-mono" : "text-gray-900"
        } ${valueClassName || ""}`}
      >
        {value}
      </span>
    </div>
  );
}
