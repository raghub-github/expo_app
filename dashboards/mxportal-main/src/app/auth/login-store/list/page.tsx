"use client";
import { fetchStoresForUser } from '@/lib/store';
import { useEffect, useState } from "react";
import StoreSelectionList from '@/components/StoreSelectionList';

export default function StoreListPage() {
  const [stores, setStores] = useState([]);

  useEffect(() => {
    // Get stores from localStorage (set after login verification)
    const storesJson = localStorage.getItem('storeList');
    if (storesJson) {
      try {
        setStores(JSON.parse(storesJson));
      } catch {
        setStores([]);
      }
    }
  }, []);

  return (
    <div>
      <StoreSelectionList stores={stores} />
    </div>
  );
}
