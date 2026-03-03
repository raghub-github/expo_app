import { StoreMenuClient } from "./StoreMenuClient";

export default async function StoreMenuPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StoreMenuClient storeId={id} />;
}
