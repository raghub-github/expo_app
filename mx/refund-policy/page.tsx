'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { MXLayoutWhite } from '@/components/MXLayoutWhite';
import { RefundPolicyContent } from '@/components/RefundPolicyContent';
import { MobileHamburgerButton } from '@/components/MobileHamburgerButton';
import { ArrowLeft } from 'lucide-react';
import { DEMO_RESTAURANT_ID } from '@/lib/constants';

function RefundPolicyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [storeId, setStoreId] = useState<string | null>(null);

  useEffect(() => {
    const id =
      searchParams?.get('storeId') ??
      (typeof window !== 'undefined' ? localStorage.getItem('selectedStoreId') : null);
    setStoreId(id || DEMO_RESTAURANT_ID);
  }, [searchParams]);

  return (
    <MXLayoutWhite
      restaurantName="Refund Policy"
      restaurantId={storeId || DEMO_RESTAURANT_ID}
    >
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-orange-50/30">
        {/* In-layout header: Back + title — no full-page wrapper so sidebar stays */}
        <div className="sticky top-0 z-[100] border-b border-slate-200/80 bg-white shadow-sm">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center gap-3">
              <MobileHamburgerButton />
              <button
                type="button"
                onClick={() => router.back()}
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-orange-600 transition-colors p-2 rounded-lg hover:bg-slate-100"
              >
                <ArrowLeft size={18} />
                Back
              </button>
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="GatiMitra" className="h-7 w-auto object-contain" />
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500 hidden sm:inline">
                  Refund Policy
                </span>
              </div>
            </div>
          </div>
        </div>

        <main>
          <RefundPolicyContent />
        </main>
      </div>
    </MXLayoutWhite>
  );
}

function RefundPolicyFallback() {
  return (
    <MXLayoutWhite restaurantName="Refund Policy" restaurantId={DEMO_RESTAURANT_ID}>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-orange-50/30">
        <div className="sticky top-0 z-[100] border-b border-slate-200/80 bg-white shadow-sm">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center gap-3">
              <MobileHamburgerButton />
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="GatiMitra" className="h-7 w-auto object-contain" />
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500 hidden sm:inline">
                  Refund Policy
                </span>
              </div>
            </div>
          </div>
        </div>
        <main className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-pulse text-slate-500 text-sm">Loading...</div>
        </main>
      </div>
    </MXLayoutWhite>
  );
}

export default function MXRefundPolicyPage() {
  return (
    <Suspense fallback={<RefundPolicyFallback />}>
      <RefundPolicyPageContent />
    </Suspense>
  );
}
