
"use client";

import StoreForm from '@/components/StoreForm';

export default function AddStorePage({ searchParams }: any) {
  const parentId = Number(searchParams?.parent_id) || 0;
  return (
    <div>
      <h1>Add Store / Restaurant</h1>
      <StoreForm parentId={parentId} onSuccess={(data) => {
        alert('Store added! ID: ' + data.store_id);
      }} />
    </div>
  );
}
