import OrderHeader from "./OrderHeader";
import OrderPageClient from "./OrderPageClient";

export const dynamic = "force-dynamic";

export default async function StandaloneOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const publicId = decodeURIComponent(id ?? "");

  if (!publicId) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <OrderHeader />
        <main className="px-3 py-4 sm:px-4 md:px-6 md:py-6">
          <p className="mt-4 text-sm font-medium text-red-600">Invalid order ID.</p>
        </main>
      </div>
    );
  }

  return <OrderPageClient orderPublicId={publicId} />;
}
