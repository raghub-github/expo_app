"use client";

import CustomizationForm from '@/components/CustomizationForm';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { MXLayoutWhite } from '@/components/MXLayoutWhite';
import { MobileHamburgerButton } from '@/components/MobileHamburgerButton';

function CustomizationsContent() {
  const searchParams = useSearchParams();
  const itemId = searchParams?.get('item_id') || '';
  
  return (
    <MXLayoutWhite>
      <div className="bg-white border-b border-gray-200 shadow-sm px-4 py-3 mb-6">
        <div className="flex items-center gap-3">
          {/* Hamburger menu on left (mobile) */}
          <MobileHamburgerButton />
          {/* Heading - properly aligned */}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">Customizations & Add-ons</h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-0.5">Manage item customizations and add-ons</p>
          </div>
        </div>
      </div>
      <div className="px-4">
        <CustomizationForm itemId={itemId} onSuccess={() => {
          alert('Customization or Add-on added!');
        }} />
      </div>
    </MXLayoutWhite>
  );
}

export default function CustomizationsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CustomizationsContent />
    </Suspense>
  );
}
