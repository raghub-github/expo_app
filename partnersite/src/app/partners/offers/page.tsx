'use client';

import nextDynamic from 'next/dynamic';

const OffersPageClient = nextDynamic(() => import('../../mx/offers/page'), {
  loading: () => (
    <div className="min-h-[50vh] flex items-center justify-center bg-white">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-600 border-t-transparent" />
    </div>
  ),
  ssr: false,
});

export default function PartnersOffersPage() {
  return <OffersPageClient />;
}
