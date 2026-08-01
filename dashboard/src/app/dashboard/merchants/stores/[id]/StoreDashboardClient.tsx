"use client";

import { StoreFullDashboard } from "./StoreFullDashboard";

export function StoreDashboardClient({ storeId }: { storeId: string }) {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <StoreFullDashboard storeId={storeId} />
    </div>
  );
}
