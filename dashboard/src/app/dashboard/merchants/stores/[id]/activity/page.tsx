import { StoreActivityLogClient } from "./StoreActivityLogClient";

export default async function StoreActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StoreActivityLogClient storeId={id} />;
}
