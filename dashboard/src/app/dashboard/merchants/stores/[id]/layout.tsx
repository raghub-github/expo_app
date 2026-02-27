import { headers } from "next/headers";
import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { StoreLayoutWrapper } from "./StoreLayoutWrapper";

/** Fetch full store (verification=1) so profile, sidebar, and cache get Store Details, Location, Banner, Gallery. */
async function getStore(storeId: number) {
  const h = await headers();
  // Server-side fetch: use localhost so NEXT_PUBLIC_APP_URL (e.g. Cloudflare tunnel) is not used from Node (ENOTFOUND). Vercel sets VERCEL_URL.
  const base =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `http://127.0.0.1:${process.env.PORT || 3000}`;
  const res = await fetch(`${base}/api/merchant/stores/${storeId}?verification=1`, {
    cache: "no-store",
    headers: { cookie: h.get("cookie") ?? "" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.success ? data.store : null;
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
