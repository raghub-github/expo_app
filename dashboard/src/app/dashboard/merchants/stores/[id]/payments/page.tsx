import { StorePaymentsClient } from "./StorePaymentsClient";

export default async function StorePaymentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StorePaymentsClient storeId={id} />;
}
