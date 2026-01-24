"use client";
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/rider-dashboard/supabaseClient';

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

export default function RiderDashboardPage() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [showDefault, setShowDefault] = useState<boolean>(true);
  
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Initial load from URL
  const initialSearch = searchParams.get('search') || "";
  const [filter, setFilter] = useState<string>(initialSearch);

  // 🔧 FIXED: Single search function
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

  // 🔧 FIXED: Run search when URL changes
  useEffect(() => {
    const searchValue = searchParams.get('search');
    
    if (searchValue) {
      setFilter(searchValue);
      setHasSearched(true);
      setShowDefault(false);
      runSearch(searchValue);
    } else {
      setFilter("");
      setHasSearched(false);
      setShowDefault(true);
      setRiders([]);
      setError(null);
      setLoading(false);
    }
  }, [searchParams, runSearch]);

  // 🔧 FIXED: Single search handler
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    const searchValue = filter.trim();
    
    if (!searchValue) {
      alert('Please enter Rider ID or Phone number to search.');
      return;
    }
    
    // Update URL and let useEffect handle the search
    router.push(`/rider-dashboard?search=${encodeURIComponent(searchValue)}`);
  };

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    let value = e.target.value;
    // If starts with 'g' or 'G', force uppercase (for GMR... IDs)
    if (/^g/i.test(value)) {
      value = value.toUpperCase();
    }
    setFilter(value);
    if (value.trim() === "") {
      // Remove ?search from URL and reset state
      router.push("/rider-dashboard");
    }
  }

  // 🔧 FIXED: Handle Enter key
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSearch();
    }
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
    <section className="w-full min-h-screen flex flex-col items-center justify-center bg-gray-50 p-0" style={{overflow: 'hidden'}}>
      {/* Search bar is now globally rendered in the header via layout.tsx */}

      {/* Rider Information heading - Top right, respect sidebar */}
      {hasSearched && !loading && !error && riders.length > 0 && (
        <div className="fixed top-4 right-4 z-40">
          <h1
            className="text-xl md:text-2xl font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent"
            style={{ WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          >
            Rider Information
          </h1>
        </div>
      )}

      {/* Centered message or loading spinner or no data */}
      {loading ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/70">
          <div className="flex flex-col items-center justify-center">
            <FlowerSpinner />
            <span className="mt-4 text-base text-gray-500 font-medium animate-pulse">Searching...</span>
          </div>
        </div>
      ) : !loading && hasSearched && !error && riders.length === 0 ? (
        <div className="fixed inset-0 flex items-center justify-center z-0">
          <div className="text-lg text-gray-700 font-medium text-center px-4 flex items-center justify-center h-32 w-full">
            We couldn't locate a delivery partner with the given details..
          </div>
        </div>
      ) : showDefault ? (
        <div className="fixed inset-0 flex flex-col items-center justify-center z-0 pointer-events-none select-none px-4">
          <div className="text-lg text-gray-700 font-medium text-center">
            One search. Complete rider context —{' '}
            <span
              className="font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent"
              style={{ WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
            >
              powered by GatiMitra
            </span>
          </div>
        </div>
      ) : null}

      {/* Error message */}
      {error && <div className="fixed top-20 left-1/2 transform -translate-x-1/2 text-red-500 z-40 px-4">Error: {error}</div>}

      {/* Rider cards - Respect sidebar boundaries, no overflow */}
      {hasSearched && !loading && riders.length > 0 && (
        <div 
          className="fixed top-20 md:top-24 left-[280px] right-4 bottom-4"
          style={{ 
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          <style jsx global>{`
            /* Hide all scrollbars */
            * {
              scrollbar-width: none !important;
              -ms-overflow-style: none !important;
            }
            *::-webkit-scrollbar {
              display: none !important;
            }
            body {
              overflow: hidden !important;
            }
          `}</style>
          
          {/* Container - No red border, clean design */}
          <div className="w-full h-full bg-white p-6 md:p-8 overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', boxShadow: 'none', borderRadius: 0 }}>
            <h2 className="text-lg font-bold mb-4 text-gray-800 tracking-wide">Core Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              <InfoRow label="Name" value={riders[0].name || "-"} />
              <InfoRow label="Rider Id" value={riders[0].id ? riders[0].id.toString().replace(/^GMR/i, "") : "-"} />
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
        </div>
      )}
    </section>
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

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-[var(--card-bg)] border border-[var(--border-color)] shadow-sm p-4 flex flex-col gap-2">
      <span className="text-base font-semibold text-gray-700 mb-2">{title}</span>
      <div className="flex flex-col gap-1">{children}</div>
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
