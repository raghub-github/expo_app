import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import FoodOrderDetailClient from "./FoodOrderDetailClient";

export default async function FoodOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (!Number.isFinite(orderId)) {
    return (
      <div className="p-4">
        <Link
          href="/dashboard/orders/food"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Food Orders
        </Link>
        <p className="mt-2 text-red-600">Invalid order ID.</p>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl">
      <Link
        href="/dashboard/orders/food"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Food Orders
      </Link>
      <FoodOrderDetailClient orderId={orderId} />
    </div>
  );
}
