import { StoreProfileClient } from "./StoreProfileClient";

export default async function StoreProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StoreProfileClient storeId={id} />;
}
