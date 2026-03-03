import { StoreDashboardClient } from "./StoreDashboardClient";

export default async function StoreDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <StoreDashboardClient storeId={id} />
    </div>
  );
}
