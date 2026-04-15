"use client";

import CustomizationForm from '@/components/CustomizationForm';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { MXLayoutWhite } from '@/components/MXLayoutWhite';
import { PartnerPageHeader } from '@/context/PartnerShellHeaderContext';
import { MobileHamburgerButton } from '@/components/MobileHamburgerButton';

function CustomizationsContent() {
  const searchParams = useSearchParams();
  const itemId = searchParams?.get('item_id') || '';
  
  return (
    <MXLayoutWhite>
      <PartnerPageHeader title="Customizations & Add-ons" subtitle="Manage item customizations and add-ons" />
      <div className="mx-shell-header !px-4 lg:!px-6 shadow-sm mb-6">
        <div className="flex items-center gap-3 w-full min-w-0">
          <MobileHamburgerButton />
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
