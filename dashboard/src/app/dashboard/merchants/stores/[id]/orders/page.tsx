import { StoreOrdersClient } from "./StoreOrdersClient";

export default async function StoreOrdersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StoreOrdersClient storeId={id} />;
}
