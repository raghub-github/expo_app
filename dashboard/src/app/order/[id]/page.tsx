import OrderPageClient from "./OrderPageClient";

export default async function StandaloneOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const publicId = decodeURIComponent(id ?? "").trim().replace(/[-\s]/g, "");

  if (!publicId) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#F8FAFC] px-4">
        <p className="text-center text-sm font-medium text-red-600">Invalid order ID.</p>
      </div>
    );
  }

  return <OrderPageClient orderPublicId={publicId} />;
}
