import { StoreUserInsightsClient } from "./StoreUserInsightsClient";

export default async function StoreUserInsightsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[480px] flex-col overflow-hidden">
      <StoreUserInsightsClient storeId={id} />
    </div>
  );
}
