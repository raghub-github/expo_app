import { headers } from "next/headers";
import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { StoreLayoutWrapper } from "./StoreLayoutWrapper";
import type { StoreInfo } from "./StoreLayoutShell";
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
  const storeId = parseInt(id, 10);
  if (!Number.isFinite(storeId)) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-gray-500">Invalid store ID.</p>
      </div>
    );
  }
  const store = await getStore(storeId);
  return (
    <StoreLayoutWrapper storeId={id} store={store}>
      {children}
    </StoreLayoutWrapper>
  );
}
