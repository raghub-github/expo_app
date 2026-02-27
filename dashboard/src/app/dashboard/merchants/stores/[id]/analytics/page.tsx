export default async function StoreAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">User Insights</h2>
      <p className="mt-2 text-sm text-gray-500">Analytics for this store. Coming soon.</p>
    </div>
  );
}
