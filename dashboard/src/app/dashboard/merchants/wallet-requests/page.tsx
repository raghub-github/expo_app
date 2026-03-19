import { WalletRequestsPageClient } from "./WalletRequestsPageClient";

export default async function WalletRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>;
}) {
  const sp = await searchParams;
  const storeId = typeof sp.storeId === "string" && sp.storeId.trim() ? sp.storeId.trim() : null;
  return <WalletRequestsPageClient storeId={storeId} />;
}

