"use client";

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useGetRiderDetailsQuery } from '@/store/api/riderApi';
import { useDashboardAccessQuery } from '@/hooks/queries/useDashboardAccessQuery';
import { usePermissionsQuery } from '@/hooks/queries/usePermissionsQuery';
import { queryKeys } from '@/lib/queryKeys';
import { CheckCircle, ArrowLeft, User, Car, FileText, CreditCard, Receipt, DollarSign, Calendar, MapPin, Phone, Mail, IdCard, Building2, Fuel, Settings, Shield, Clock, AlertCircle } from 'lucide-react';
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

  const {
    data: riderData,
    isLoading: riderLoading,
    isFetching: riderFetching,
    error: riderError,
  } = useGetRiderDetailsQuery(riderId, {
    skip: Number.isNaN(riderId),
  } as any);

  const loading = riderLoading || riderFetching;
  const error = riderError instanceof Error ? riderError.message : riderError ? String(riderError) : null;

  // Check if user has rider access
  const hasRiderAccess = dashboardAccessData?.dashboards.some(
    (d) => d.dashboardType === "RIDER" && d.isActive
  ) ?? false;

  const handleRetryAccess = () => {
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

  const rider = riderData.rider as Rider;
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

      {/* Core Information - Redesigned */}
      <section className="rounded-2xl border border-gray-200/90 bg-gradient-to-br from-white to-blue-50/30 p-4 sm:p-5 lg:p-6 shadow-lg ring-1 ring-gray-900/5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shrink-0">
              <User className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Rider Information</h2>
              <p className="text-sm text-gray-500 font-mono mt-0.5">GMR{rider.id}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full shadow-sm ${statusBadgeClass(rider.onboardingStage)}`}>
              <Clock className="h-3 w-3" />
              {ONBOARDING_STAGE_LABELS[rider.onboardingStage] ?? rider.onboardingStage}
            </span>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full shadow-sm ${statusBadgeClass(rider.kycStatus)}`}>
              <Shield className="h-3 w-3" />
              {rider.kycStatus}
            </span>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full shadow-sm ${statusBadgeClass(rider.status)}`}>
              <CheckCircle className="h-3 w-3" />
              {rider.status}
            </span>
          </div>
        </div>
        
        {/* Personal Details Section */}
        <div className="mb-6 pb-6 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <IdCard className="h-4 w-4" />
            Personal Details
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <InfoCard icon={<User className="h-4 w-4" />} label="Full Name" value={rider.name || "—"} highlight />
            <InfoCard icon={<IdCard className="h-4 w-4" />} label="Rider ID" value={`GMR${rider.id}`} highlight className="font-mono" />
            <InfoCard icon={<Phone className="h-4 w-4" />} label="Mobile" value={`${rider.countryCode ?? ""} ${rider.mobile}`.trim()} />
            <InfoCard icon={<Calendar className="h-4 w-4" />} label="Date of Birth" value={rider.dob ? new Date(rider.dob).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : "—"} />
            <InfoCard icon={<IdCard className="h-4 w-4" />} label="Aadhaar Number" value={maskDocumentNumber(rider.aadhaarNumber)} />
            <InfoCard icon={<IdCard className="h-4 w-4" />} label="PAN Number" value={maskDocumentNumber(rider.panNumber)} />
          </div>
        </div>

        {/* Address Section */}
        <div className="mb-6 pb-6 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Address Information
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <InfoCard icon={<MapPin className="h-4 w-4" />} label="Address" value={displayAddress} className="col-span-1 sm:col-span-2 lg:col-span-4" />
            <InfoCard icon={<Building2 className="h-4 w-4" />} label="City" value={rider.city || "—"} />
            <InfoCard icon={<Building2 className="h-4 w-4" />} label="State" value={rider.state || "—"} />
            <InfoCard icon={<MapPin className="h-4 w-4" />} label="Pincode" value={rider.pincode || "—"} />
          </div>
        </div>

        {/* Additional Information */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Additional Information
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <InfoCard icon={<IdCard className="h-4 w-4" />} label="Referral Code" value={rider.referralCode || "—"} />
            <InfoCard icon={<User className="h-4 w-4" />} label="Referred By" value={rider.referredBy ? `GMR${rider.referredBy}` : "—"} />
            <InfoCard icon={<Settings className="h-4 w-4" />} label="Language" value={(rider.defaultLanguage ?? "—").toUpperCase()} />
            <InfoCard icon={<Calendar className="h-4 w-4" />} label="Created" value={rider.createdAt ? new Date(rider.createdAt).toLocaleDateString('en-IN') : "—"} />
            <InfoCard icon={<Clock className="h-4 w-4" />} label="Last Updated" value={rider.updatedAt ? new Date(rider.updatedAt).toLocaleDateString('en-IN') : "—"} />
          </div>
        </div>
      </section>

      {/* Vehicle - Redesigned */}
      <section className="rounded-2xl border border-gray-200/90 bg-gradient-to-br from-white to-violet-50/30 p-4 sm:p-5 lg:p-6 shadow-lg ring-1 ring-gray-900/5">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-lg shrink-0">
            <Car className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Vehicle Details</h2>
            <p className="text-sm text-gray-500 mt-0.5">Registration & specifications</p>
          </div>
        </div>
        {vehicle ? (
          <div className="space-y-6">
            {/* Basic Vehicle Information */}
            <div className="mb-6 pb-6 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Car className="h-4 w-4" />
                Basic Information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoCard icon={<Car className="h-4 w-4" />} label="Vehicle Type" value={vehicle.vehicleType ? String(vehicle.vehicleType).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—"} highlight />
                <InfoCard icon={<IdCard className="h-4 w-4" />} label="Registration Number" value={vehicle.registrationNumber || "—"} highlight className="font-mono" />
                <InfoCard icon={<MapPin className="h-4 w-4" />} label="Registration State" value={vehicle.registrationState || "—"} />
                <InfoCard icon={<Building2 className="h-4 w-4" />} label="Make" value={vehicle.make || "—"} />
                <InfoCard icon={<Car className="h-4 w-4" />} label="Model" value={vehicle.model || "—"} />
                <InfoCard icon={<Calendar className="h-4 w-4" />} label="Year" value={vehicle.year ? String(vehicle.year) : "—"} />
                <InfoCard icon={<Settings className="h-4 w-4" />} label="Color" value={vehicle.color || "—"} />
                <InfoCard icon={<Fuel className="h-4 w-4" />} label="Fuel Type" value={vehicle.fuelType ? String(vehicle.fuelType).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—"} />
                <InfoCard icon={<Car className="h-4 w-4" />} label="Category" value={vehicle.vehicleCategory ? String(vehicle.vehicleCategory).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—"} />
              </div>
            </div>

            {/* Additional Details */}
            <div className="mb-6 pb-6 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Additional Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {vehicle.acType && <InfoCard icon={<Settings className="h-4 w-4" />} label="AC Type" value={vehicle.acType} />}
                <InfoCard icon={<User className="h-4 w-4" />} label="Seating Capacity" value={vehicle.seatingCapacity != null ? `${vehicle.seatingCapacity} seats` : "—"} />
                <InfoCard icon={<Building2 className="h-4 w-4" />} label="Commercial Vehicle" value={vehicle.isCommercial ? "Yes" : "No"} />
                <InfoCard icon={<Shield className="h-4 w-4" />} label="Vehicle Status" value={vehicle.vehicleActiveStatus ? String(vehicle.vehicleActiveStatus).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—"} />
              </div>
            </div>

            {/* Expiry Dates */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Expiry Dates
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoCard icon={<Shield className="h-4 w-4" />} label="Insurance Expiry" value={vehicle.insuranceExpiry ? new Date(vehicle.insuranceExpiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : "—"} />
                <InfoCard icon={<IdCard className="h-4 w-4" />} label="Permit Expiry" value={vehicle.permitExpiry ? new Date(vehicle.permitExpiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : "—"} />
              </div>
            </div>

            {/* Service Types */}
            {vehicle.serviceTypes && Array.isArray(vehicle.serviceTypes) && vehicle.serviceTypes.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Enabled Services
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(vehicle.serviceTypes as string[]).map((s) => (
                    <span key={s} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-gradient-to-r from-violet-100 to-violet-200 text-violet-800 shadow-sm border border-violet-300/50">
                      <CheckCircle className="h-3.5 w-3.5" />
                      {String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <Car className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No vehicle information available</p>
            <p className="text-sm text-gray-400 mt-1">Vehicle details will appear here once added</p>
          </div>
        )}
      </section>


      {/* Onboarding Fees - Single Line Compact */}
      {riderData.onboardingPayments && riderData.onboardingPayments.length > 0 && (
        <section id="onboarding-fees" className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Receipt className="h-3.5 w-3.5 text-purple-600 shrink-0" />
            <h2 className="text-sm font-semibold text-gray-900">Onboarding Fees</h2>
            <span className="text-xs text-gray-500">
              (Total: ₹{riderData.onboardingPayments.filter((p) => p.status === "completed").reduce((sum, p) => sum + Number(p.amount), 0).toFixed(2)})
            </span>
          </div>
          <div className="space-y-1">
            {riderData.onboardingPayments.map((p) => (
              <div key={p.id} className="flex items-center gap-3 text-xs text-gray-700 py-1 px-2 rounded hover:bg-gray-50">
                <span className="font-semibold text-gray-900 w-20">₹{Number(p.amount).toFixed(2)}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  p.status === "completed" ? "bg-emerald-100 text-emerald-800" :
                  p.status === "failed" ? "bg-red-100 text-red-800" : 
                  "bg-amber-100 text-amber-800"
                }`}>
                  {p.status}
                </span>
                <span className="text-gray-600">{p.provider || "—"}</span>
                <span className="font-mono text-gray-500 text-[10px]">{p.refId || "—"}</span>
                <span className="text-gray-500 ml-auto">{new Date(p.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
              </div>
            ))}
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

function InfoCard({
  icon,
  label,
  value,
  highlight,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div className={`rounded-xl bg-white border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow ${highlight ? 'ring-2 ring-blue-200 bg-blue-50/30' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
          highlight ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
        }`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
          <p className={`text-sm font-semibold text-gray-900 break-words ${className}`}>
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}
