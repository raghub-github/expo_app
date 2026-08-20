import { headers } from "next/headers";
import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { StoreLayoutWrapper } from "./StoreLayoutWrapper";
import type { StoreInfo } from "./StoreLayoutShell";
import { RecoverStoreIdClient } from "@/components/merchants/RecoverStoreIdClient";
import { parseNumericStoreId } from "@/lib/merchants/effective-store-id";
import {
  getInternalDashboardOrigin,
  readJsonResponse,
} from "@/lib/server/internal-dashboard-origin";

/** Fetch full store (verification=1). Cached 90s so revisits and nav within store are fast. */
async function getStore(storeId: number): Promise<StoreInfo | null> {
  const h = await headers();
  const base = await getInternalDashboardOrigin();
  const res = await fetch(`${base}/api/merchant/stores/${storeId}?verification=1`, {
    next: { revalidate: 90 },
    headers: { cookie: h.get("cookie") ?? "" },
  });
  if (!res.ok) return null;
  const data = await readJsonResponse<{ success?: boolean; store?: StoreInfo }>(res, {});
  return data?.success ? (data.store ?? null) : null;
}

export default async function StoreDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  await requireDashboardAccess("MERCHANT");
  const { id } = await params;
  const numericId = parseNumericStoreId(id);
  if (!numericId) {
    return <RecoverStoreIdClient />;
  }
  const storeId = parseInt(numericId, 10);
  if (!Number.isFinite(storeId)) {
    return <RecoverStoreIdClient />;
  }
  const store = await getStore(storeId);
  return (
    <StoreLayoutWrapper storeId={numericId} store={store}>
      {children}
    </StoreLayoutWrapper>
  );
}
