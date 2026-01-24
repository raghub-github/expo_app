"use client";
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/rider-dashboard/supabaseClient';
import { useDashboardAccessQuery } from '@/hooks/queries/useDashboardAccessQuery';
import { usePermissions } from '@/hooks/queries/usePermissionsQuery';

type Rider = {
  id: number;
  name: string | null;
  mobile: string;
  country_code: string;
  aadhaar_number: string | null;
  pan_number: string | null;
  dob: string | null;
  selfie_url: string | null;
  onboarding_stage: string;
  kyc_status: string;
  status: string;
  city: string | null;
  state: string | null;
  pincode: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  referral_code: string | null;
  referred_by: number | null;
  default_language: string;
  created_at: string;
  updated_at: string;
};

export default function RidersPage() {
  // ALL HOOKS MUST BE CALLED FIRST - BEFORE ANY CONDITIONAL RETURNS
  const { isSuperAdmin, loading: permissionsLoading, exists, error: permissionsError } = usePermissions();
  const { data: dashboardAccessData, isLoading: dashboardAccessLoading, error: dashboardAccessError } = useDashboardAccessQuery();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // All state hooks
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [showDefault, setShowDefault] = useState<boolean>(true);

  // Check if user has rider access
  const hasRiderAccess = dashboardAccessData?.dashboards.some(
    (d) => d.dashboardType === "RIDER" && d.isActive
  ) ?? false;

  // Single search function - MUST be called before conditional returns
  const runSearch = useCallback(async (searchValue: string) => {
    console.log("Running search for:", searchValue);
    
    if (!searchValue.trim()) {
      setShowDefault(true);
      setHasSearched(false);
      setRiders([]);
      setError(null);
      setLoading(false);
      return;
    }

    setShowDefault(false);
    setHasSearched(true);
    setError(null);
    setRiders([]);
    
    let spinnerTimeout: NodeJS.Timeout | null = null;
    spinnerTimeout = setTimeout(() => {
      setLoading(true);
    }, 300);

    try {
      // Check if supabase is properly initialized
      if (!supabase) {
        setError("Database connection not available. Please check your configuration.");
        return;
      }
      
      let query = supabase.from("riders").select("*");
      // Rider ID: starts with GMR, rest can be any digits/letters
      // Phone: 10 digits, 91+10 digits, or +91+10 digits
      const isRiderId = /^GMR(\d+)$/i.test(searchValue);
      const isNumericId = /^\d+$/.test(searchValue);
      const isPhone = /^\d{10}$/.test(searchValue);
      const isPhoneWith91 = /^(\+91|91)\d{10}$/.test(searchValue);

      if (isRiderId) {
        // Extract numeric part for id
        const idNum = searchValue.replace(/^GMR/i, "");
        if (/^\d+$/.test(idNum)) {
          query = query.eq('id', Number(idNum));
        } else {
          query = query.eq('id', -1); // unlikely to match
        }
      } else if (isNumericId) {
        // Direct numeric id search
        query = query.eq('id', Number(searchValue));
      } else if (isPhone) {
        // Exact match for 10-digit mobile
        query = query.eq('mobile', searchValue);
      } else if (isPhoneWith91) {
        // Remove +91 or 91 prefix and exact match
        let phone = searchValue.replace(/^\+?91/, "");
        query = query.eq('mobile', phone);
      } else {
        // fallback: search mobile as ilike (id is integer, so skip ilike for id)
        query = query.ilike('mobile', `%${searchValue}%`);
      }

      const { data, error: supabaseError } = await query;
      console.log('Supabase result:', data, 'Supabase error:', supabaseError);

      if (supabaseError && supabaseError.message && supabaseError.message.includes('out of range')) {
        setRiders([]);
        setError(null);
        return;
      }
      if (supabaseError) {
        setError(null);
        setRiders([]);
        return;
      }

      if (data && data.length > 0) {
        setRiders(data as Rider[]);
        setError(null);
      } else {
        setRiders([]);
        setError(null);
      }
    } catch (err: any) {
      if (err && err.message && err.message.includes('out of range')) {
        setRiders([]);
        setError(null);
        return;
      }
      setRiders([]);
      setError(null);
    } finally {
      if (spinnerTimeout) clearTimeout(spinnerTimeout);
      setLoading(false);
    }
  }, []);

  // Run search when URL changes - MUST be called before conditional returns
  useEffect(() => {
    const searchValue = searchParams.get('search');
    
    if (searchValue) {
      setHasSearched(true);
      setShowDefault(false);
      runSearch(searchValue);
    } else {
      setHasSearched(false);
      setShowDefault(true);
      setRiders([]);
      setError(null);
      setLoading(false);
    }
  }, [searchParams, runSearch]);

  // Show error state if API calls failed
  if (permissionsError || dashboardAccessError) {
    const errorMessage = permissionsError || dashboardAccessError;
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <p className="text-red-600 font-semibold">Error Loading Permissions</p>
          <p className="text-red-500 text-sm mt-2">
            {errorMessage instanceof Error ? errorMessage.message : "Failed to load access permissions. Please refresh the page."}
          </p>
        </div>
      </div>
    );
  }

  // Show loading state while checking permissions and access
  if (permissionsLoading || dashboardAccessLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            <span className="mt-4 text-base text-gray-500 font-medium">Checking access permissions...</span>
          </div>
        </div>
      </div>
    );
  }

  // Check if user exists in system
  if (!exists) {
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

  // Check access - only show access denied after loading is complete and user exists
  if (!isSuperAdmin && !hasRiderAccess) {
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

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="w-full">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Riders</h1>
        <p className="text-sm sm:text-base text-gray-600">
          Manage riders, documents, orders, penalties, and performance
        </p>
      </div>

      {/* Loading Spinner */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center justify-center">
            <FlowerSpinner />
            <span className="mt-4 text-base text-gray-500 font-medium animate-pulse">Searching...</span>
          </div>
        </div>
      )}

      {/* No Results */}
      {!loading && hasSearched && !error && riders.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="text-lg text-gray-700 font-medium">
            We couldn't locate a delivery partner with the given details.
          </p>
        </div>
      )}

      {/* Default Message */}
      {showDefault && !loading && (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="text-lg text-gray-700 font-medium">
            One search. Complete rider context —{' '}
            <span className="font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
              powered by GatiMitra
            </span>
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Enter a Rider ID (e.g., GMR123) or Phone number to search
          </p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-red-600">Error: {error}</p>
        </div>
      )}

      {/* Rider Information Cards */}
      {hasSearched && !loading && riders.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 md:p-8">
          <h2 className="text-lg font-bold mb-4 text-gray-800 tracking-wide">Core Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            <InfoRow label="Name" value={riders[0].name || "-"} />
            <InfoRow label="Rider Id" value={riders[0].id ? `GMR${riders[0].id}` : "-"} />
            <InfoRow label="Mobile" value={riders[0].mobile} />
            <InfoRow label="Country Code" value={riders[0].country_code} />
            <InfoRow label="Aadhaar Number" value={maskDocumentNumber(riders[0].aadhaar_number)} />
            <InfoRow label="PAN Number" value={maskDocumentNumber(riders[0].pan_number)} />
            <InfoRow label="DOB" value={riders[0].dob || "-"} />
            <InfoRow label="City" value={riders[0].city || "-"} />
            <InfoRow label="State" value={riders[0].state || "-"} />
            <InfoRow label="Pincode" value={riders[0].pincode || "-"} />
            <InfoRow label="Address" value={riders[0].address || "-"} />
            <InfoRow label="Onboarding Stage" value={riders[0].onboarding_stage} />
            <InfoRow label="KYC Status" value={riders[0].kyc_status} />
            <InfoRow label="Status" value={riders[0].status} />
            <InfoRow label="Referral Code" value={riders[0].referral_code || "-"} />
            <InfoRow label="Referred By" value={riders[0].referred_by ? riders[0].referred_by.toString() : "-"} />
            <InfoRow label="Default Language" value={riders[0].default_language} />
            <InfoRow label="Created At" value={riders[0].created_at} />
            <InfoRow label="Updated At" value={riders[0].updated_at} />
          </div>
        </div>
      )}
    </div>
  );
}

// Flower spinner loading animation
function FlowerSpinner() {
  const arrows = Array.from({ length: 12 });
  return (
    <div className="relative w-20 h-20">
      {arrows.map((_, i) => (
        <svg
          key={i}
          className="absolute left-1/2 top-1/2 animate-arrow-spin"
          width="18"
          height="18"
          viewBox="0 0 18 18"
          style={{
            transform: `rotate(${i * 30}deg) translate(0, -36px)`,
            opacity: (i + 1) / arrows.length,
          }}
        >
          <polygon
            points="9,3 13,9 9,7 5,9"
            fill="#60a5fa"
            style={{ filter: 'drop-shadow(0 0 2px #bae6fd)' }}
          />
        </svg>
      ))}
      <style jsx>{`
        @keyframes arrow-spin {
          100% {
            transform: rotate(360deg);
          }
        }
        .animate-arrow-spin {
          animation: arrow-spin 1.1s linear infinite;
        }
      `}</style>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 px-1 py-2">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="text-sm font-semibold text-gray-900 break-words leading-tight">{value}</span>
    </div>
  );
}
