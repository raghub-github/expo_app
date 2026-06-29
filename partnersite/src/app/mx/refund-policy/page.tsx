'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { MXLayoutWhite } from '@/components/MXLayoutWhite';
import { PartnerPageHeader } from '@/context/PartnerShellHeaderContext';
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
      restaurantName="Refund & Cancellation Policy"
      restaurantId={storeId || DEMO_RESTAURANT_ID}
    >
      <PartnerPageHeader title="Refund & Cancellation Policy" subtitle="Payments, refunds, and order cancellation terms" />
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-orange-50/30">
        {/* In-layout header: Back + title — no full-page wrapper so sidebar stays */}
        <div className="sticky top-0 z-[100] bg-white shadow-sm mx-shell-header !px-0">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 w-full">
            <div className="flex items-center gap-3 min-w-0">
              <MobileHamburgerButton />
              <button
                type="button"
                onClick={() => router.back()}
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-orange-600 transition-colors p-2 rounded-lg hover:bg-slate-100"
              >
                <ArrowLeft size={18} />
                Back
              </button>
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
    <MXLayoutWhite restaurantName="Refund & Cancellation Policy" restaurantId={DEMO_RESTAURANT_ID}>
      <PartnerPageHeader title="Refund & Cancellation Policy" subtitle="Payments, refunds, and order cancellation terms" />
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-orange-50/30">
        <div className="sticky top-0 z-[100] bg-white shadow-sm mx-shell-header !px-0">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 w-full">
            <div className="flex items-center gap-3 min-w-0">
              <MobileHamburgerButton />
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
