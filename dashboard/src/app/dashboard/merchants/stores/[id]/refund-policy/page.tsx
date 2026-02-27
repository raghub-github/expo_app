import Link from "next/link";

export default async function StoreRefundPolicyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Refund policy</h1>
      <p className="mt-2 text-gray-600">
        Refund policy content for this store can be configured here.
      </p>
      <Link
        href={`/dashboard/merchants/stores/${id}/payments`}
        className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-700"
      >
        ← Back to Payments
      </Link>
    </div>
  );
}
