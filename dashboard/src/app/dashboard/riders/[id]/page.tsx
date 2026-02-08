"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useDashboardAccessQuery } from '@/hooks/queries/useDashboardAccessQuery';
import { usePermissionsQuery } from '@/hooks/queries/usePermissionsQuery';
import { queryKeys } from '@/lib/queryKeys';
import { CheckCircle, ArrowLeft, User, Car, Wallet, FileText, CreditCard, Receipt } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ONBOARDING_STAGE_LABELS } from '@/types/rider-dashboard';

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

interface RiderAddress {
  id: number;
  fullAddress: string;
  addressType: string;
  isPrimary: boolean;
  state: string | null;
  pincode: string | null;
}

interface DocumentFile {
  id: number;
  fileUrl: string;
  side?: string;
  sortOrder?: number;
}

interface RiderDocument {
  id: number;
  docType: string;
  fileUrl: string;
  docNumber?: string | null;
  verificationMethod?: string;
  verificationStatus?: string;
  expiryDate?: string | null;
  verified: boolean;
  verifiedAt?: string | null;
  verifierName?: string | null;
  rejectedReason?: string | null;
  createdAt: string;
  files?: DocumentFile[];
}

interface RiderVehicle {
  id: number;
  vehicleType: string;
  registrationNumber: string;
  registrationState?: string | null;
  make: string | null;
  model: string | null;
  year?: number | null;
  color?: string | null;
  fuelType: string | null;
  vehicleCategory?: string | null;
  acType?: string | null;
  isCommercial?: boolean;
  permitExpiry?: string | null;
  insuranceExpiry?: string | null;
  vehicleActiveStatus?: string;
  seatingCapacity?: number | null;
  serviceTypes?: string[];
  verified?: boolean;
  verifiedAt?: string | null;
  isActive?: boolean;
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

interface OnboardingPaymentEntry {
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
  documents: RiderDocument[];
  addresses?: RiderAddress[];
  vehicle?: RiderVehicle | null;
  paymentMethods?: PaymentMethod[];
  wallet?: WalletInfo | null;
  recentLedger?: LedgerEntry[];
  recentPenalties?: PenaltyEntry[];
  recentWithdrawals?: WithdrawalEntry[];
  onboardingPayments?: OnboardingPaymentEntry[];
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
  const addresses = riderData.addresses ?? [];
  const vehicle = riderData.vehicle ?? null;
  const primaryAddress = addresses.find((a) => a.isPrimary) || addresses[0];
  const displayAddress = primaryAddress?.fullAddress || rider.address || "—";
  const wallet = riderData.wallet ?? null;

  const isFullyOnboarded =
    rider.status === 'ACTIVE' &&
    rider.kycStatus === 'APPROVED' &&
    rider.onboardingStage === 'ACTIVE';

  // Check if verification is needed
  const needsVerification = !isFullyOnboarded;

  const documentLabels: Record<string, string> = {
    aadhaar: "Aadhaar Card",
    aadhaar_front: "Aadhaar (Front)",
    aadhaar_back: "Aadhaar (Back)",
    pan: "PAN Card",
    dl: "Driving License",
    dl_front: "Driving License (Front)",
    dl_back: "Driving License (Back)",
    rc: "RC (Registration Certificate)",
    selfie: "Selfie",
    rental_proof: "Rental Proof (EV Bikes)",
    ev_proof: "EV Proof",
    insurance: "Insurance",
    bank_proof: "Bank Proof (Passbook/Cheque/Statement)",
    upi_qr_proof: "UPI QR Proof",
    profile_photo: "Profile Photo",
    vehicle_image: "Vehicle Image",
    ev_ownership_proof: "EV Ownership Proof",
    other: "Other Document",
  };

  const verificationStatusLabel: Record<string, string> = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
  };

  const proofTypeLabel: Record<string, string> = {
    passbook: "Passbook",
    cancelled_cheque: "Cancelled Cheque",
    statement: "Bank Statement",
    upi_qr_image: "UPI QR Image",
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
      {/* Compact Header - Just back button and verify button */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => router.push('/dashboard/riders')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors py-2 px-3 rounded-lg hover:bg-gray-100 -ml-1"
          aria-label="Back to Riders"
        >
          <ArrowLeft className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">Back to Riders</span>
        </button>
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

      {/* Onboarding Fees Alert for Unverified Riders */}
      {needsVerification && riderData.onboardingPayments && riderData.onboardingPayments.length > 0 && (
        <section className="rounded-2xl border-2 border-purple-300 bg-gradient-to-br from-purple-50 to-pink-50 p-4 sm:p-5 lg:p-6 shadow-md ring-2 ring-purple-200">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-600 text-white shrink-0">
              <Receipt className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-purple-900 mb-2">Registration Fee Paid</h3>
              <p className="text-sm text-gray-700 mb-3">
                This rider has paid the onboarding fee. Please verify their documents to complete onboarding.
              </p>
              <div className="flex items-center gap-6 flex-wrap">
                <div className="bg-white rounded-lg px-4 py-2 shadow-sm border border-purple-200">
                  <p className="text-xs text-gray-500 mb-1">Total Paid</p>
                  <p className="text-xl font-bold text-purple-900 tabular-nums">
                    ₹{riderData.onboardingPayments.filter((p) => p.status === "completed").reduce((sum, p) => sum + Number(p.amount), 0).toFixed(2)}
                  </p>
                </div>
                <div className="bg-white rounded-lg px-4 py-2 shadow-sm border border-purple-200">
                  <p className="text-xs text-gray-500 mb-1">Payment Status</p>
                  <p className="text-sm font-semibold">
                    {riderData.onboardingPayments.filter(p => p.status === "completed").length} completed,{' '}
                    {riderData.onboardingPayments.filter(p => p.status === "failed").length} failed
                  </p>
                </div>
                <button
                  onClick={() => {
                    const feesSection = document.getElementById('onboarding-fees');
                    if (feesSection) {
                      feesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }}
                  className="text-sm text-purple-700 hover:text-purple-900 font-medium underline"
                >
                  View Payment Details →
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Core Information */}
      <section className="rounded-2xl border border-gray-200/90 bg-white p-4 sm:p-5 lg:p-6 shadow-sm ring-1 ring-gray-900/5">
        <div className="flex items-center justify-between mb-4 sm:mb-5">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 shrink-0">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Rider Information</h2>
              <p className="text-xs text-gray-500 font-mono">GMR{rider.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex px-3 py-1.5 text-xs font-semibold rounded-full ${statusBadgeClass(rider.onboardingStage)}`}>
              {ONBOARDING_STAGE_LABELS[rider.onboardingStage] ?? rider.onboardingStage}
            </span>
            <span className={`inline-flex px-3 py-1.5 text-xs font-semibold rounded-full ${statusBadgeClass(rider.kycStatus)}`}>
              {rider.kycStatus}
            </span>
            <span className={`inline-flex px-3 py-1.5 text-xs font-semibold rounded-full ${statusBadgeClass(rider.status)}`}>
              {rider.status}
            </span>
          </div>
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
          <InfoRow label="Address" value={displayAddress} className="col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-4" />
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
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-4 sm:gap-5">
              <InfoRow label="Type" value={vehicle.vehicleType ? String(vehicle.vehicleType).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—"} />
              <InfoRow label="Registration" value={vehicle.registrationNumber || "—"} highlight />
              <InfoRow label="Registration State" value={vehicle.registrationState || "—"} />
              <InfoRow label="Make" value={vehicle.make || "—"} />
              <InfoRow label="Model" value={vehicle.model || "—"} />
              <InfoRow label="Year" value={vehicle.year ? String(vehicle.year) : "—"} />
              <InfoRow label="Color" value={vehicle.color || "—"} />
              <InfoRow label="Fuel" value={vehicle.fuelType || "—"} />
              <InfoRow label="Category" value={vehicle.vehicleCategory ? String(vehicle.vehicleCategory).replace(/_/g, " ") : "—"} />
              {vehicle.acType && <InfoRow label="AC Type" value={vehicle.acType} />}
              <InfoRow label="Seating Capacity" value={vehicle.seatingCapacity != null ? String(vehicle.seatingCapacity) : "—"} />
              <InfoRow label="Commercial" value={vehicle.isCommercial ? "Yes" : "No"} />
              <InfoRow label="Insurance Expiry" value={vehicle.insuranceExpiry ? new Date(vehicle.insuranceExpiry).toLocaleDateString() : "—"} />
              <InfoRow label="Permit Expiry" value={vehicle.permitExpiry ? new Date(vehicle.permitExpiry).toLocaleDateString() : "—"} />
              <InfoRow label="Status" value={vehicle.vehicleActiveStatus ? String(vehicle.vehicleActiveStatus).replace(/_/g, " ") : "—"} />
            </div>
            {vehicle.serviceTypes && Array.isArray(vehicle.serviceTypes) && vehicle.serviceTypes.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Services</span>
                {(vehicle.serviceTypes as string[]).map((s) => (
                  <span key={s} className="inline-flex px-2.5 py-1 text-xs font-medium rounded-full bg-violet-100 text-violet-800">
                    {String(s).replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}
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

      {/* Onboarding Fees (registration fees paid during onboarding) */}
      {riderData.onboardingPayments && riderData.onboardingPayments.length > 0 && (
        <section id="onboarding-fees" className="rounded-2xl border border-gray-200/90 bg-white p-4 sm:p-5 lg:p-6 shadow-sm ring-1 ring-gray-900/5">
          <div className="flex items-center gap-2 mb-4 sm:mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600 shrink-0">
              <Receipt className="h-5 w-5" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Onboarding Fees</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Total paid during registration: <span className="font-semibold text-gray-900 tabular-nums">₹{riderData.onboardingPayments.filter((p) => p.status === "completed").reduce((sum, p) => sum + Number(p.amount), 0).toFixed(2)}</span>
          </p>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-700">Ref ID</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-700">Amount</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-700">Provider</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-700">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-700">Payment ID</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-700">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {riderData.onboardingPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-gray-900 text-sm">{p.refId || "—"}</td>
                    <td className="px-4 py-2.5 font-bold text-gray-900 tabular-nums text-base">₹{Number(p.amount).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-gray-700 text-sm">{p.provider || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        p.status === "completed" ? "bg-emerald-100 text-emerald-800" :
                        p.status === "failed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                      }`}>{p.status}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-gray-700 text-xs">{p.paymentId || "—"}</td>
                    <td className="px-4 py-2.5 text-gray-700 text-sm">{new Date(p.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            {documents.map((doc) => {
              const verStatus = (doc.verificationStatus || (doc.verified ? "approved" : "pending")).toLowerCase();
              const hasMultipleFiles = doc.files && doc.files.length > 0;
              const displayFiles = hasMultipleFiles ? doc.files! : (doc.fileUrl ? [{ id: 0, fileUrl: doc.fileUrl, side: "single" }] : []);
              return (
                <div key={doc.id} className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 hover:border-gray-300 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                      {documentLabels[doc.docType] || doc.docType}
                    </h3>
                    <span className={`shrink-0 px-2 py-1 text-xs font-medium rounded-full ${
                      verStatus === "approved" ? "bg-emerald-100 text-emerald-800" :
                      verStatus === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                    }`}>
                      {verificationStatusLabel[verStatus] || (doc.verified ? "Verified" : "Pending")}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs text-gray-600">
                    <p><span className="font-medium text-gray-700">Method:</span> {doc.verificationMethod || "N/A"}</p>
                    {doc.docNumber && <p><span className="font-medium text-gray-700">Number:</span> {doc.docNumber}</p>}
                    {doc.expiryDate && (
                      <p><span className="font-medium text-gray-700">Expiry:</span> {new Date(doc.expiryDate).toLocaleDateString()}</p>
                    )}
                    {doc.verifierName && <p><span className="font-medium text-gray-700">Verified by:</span> {doc.verifierName}</p>}
                    {doc.rejectedReason && (
                      <p className="text-red-600"><span className="font-medium">Rejected:</span> {doc.rejectedReason}</p>
                    )}
                    <p className="text-gray-500 pt-1">{new Date(doc.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {displayFiles.map((f, i) => (
                      <a
                        key={f.id || i}
                        href={f.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {f.side && f.side !== "single" ? `View ${String(f.side).charAt(0).toUpperCase() + String(f.side).slice(1)} →` : "View Document →"}
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500 py-2">No documents found.</p>
        )}
      </section>

      {/* Payment Methods (Bank / UPI) */}
      {riderData.paymentMethods && riderData.paymentMethods.length > 0 && (
        <section className="rounded-2xl border border-gray-200/90 bg-white p-4 sm:p-5 lg:p-6 shadow-sm ring-1 ring-gray-900/5">
          <div className="flex items-center gap-2 mb-4 sm:mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 shrink-0">
              <CreditCard className="h-5 w-5" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Payment Methods</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {riderData.paymentMethods.map((pm) => (
              <div key={pm.id} className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="font-semibold text-gray-900 text-sm">
                    {pm.methodType === "bank" ? "Bank Account" : "UPI"}
                  </span>
                  <span className={`shrink-0 px-2 py-1 text-xs font-medium rounded-full ${
                    pm.verificationStatus === "verified" ? "bg-emerald-100 text-emerald-800" :
                    pm.verificationStatus === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                  }`}>
                    {verificationStatusLabel[pm.verificationStatus] || pm.verificationStatus}
                  </span>
                </div>
                <div className="space-y-1 text-xs text-gray-600">
                  <p><span className="font-medium text-gray-700">Account holder:</span> {pm.accountHolderName}</p>
                  {pm.methodType === "bank" && (
                    <>
                      {pm.bankName && <p><span className="font-medium text-gray-700">Bank:</span> {pm.bankName}</p>}
                      {pm.ifsc && <p><span className="font-medium text-gray-700">IFSC:</span> {pm.ifsc}</p>}
                      {pm.accountNumberMasked && <p><span className="font-medium text-gray-700">Account:</span> {pm.accountNumberMasked}</p>}
                    </>
                  )}
                  {pm.methodType === "upi" && pm.upiId && <p><span className="font-medium text-gray-700">UPI ID:</span> {pm.upiId}</p>}
                  {pm.verificationProofType && (
                    <p><span className="font-medium text-gray-700">Proof:</span> {proofTypeLabel[pm.verificationProofType] || pm.verificationProofType}</p>
                  )}
                  {pm.verifiedAt && <p className="text-gray-500">Verified {new Date(pm.verifiedAt).toLocaleDateString()}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
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
