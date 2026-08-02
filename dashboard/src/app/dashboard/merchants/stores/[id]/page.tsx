import { StoreDashboardClient } from "./StoreDashboardClient";

export default async function StoreDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-1 flex-col overflow-hidden">
      <StoreDashboardClient storeId={id} />
    </div>
  );
}
