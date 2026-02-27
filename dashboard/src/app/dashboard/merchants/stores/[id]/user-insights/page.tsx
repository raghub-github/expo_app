import { StoreUserInsightsClient } from "./StoreUserInsightsClient";

export default async function StoreUserInsightsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StoreUserInsightsClient storeId={id} />;
}
