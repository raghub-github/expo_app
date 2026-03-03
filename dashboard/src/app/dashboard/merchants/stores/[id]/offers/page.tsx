import { StoreOffersClient } from "./StoreOffersClient";

export default async function StoreOffersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StoreOffersClient storeId={id} />;
}
