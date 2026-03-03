"use client";

import { StoreFullDashboard } from "./StoreFullDashboard";

export function StoreDashboardClient({ storeId }: { storeId: string }) {
  return <StoreFullDashboard storeId={storeId} />;
}
