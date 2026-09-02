import OrderPageClient from "./OrderPageClient";
import { OrderNotFoundState } from "@/components/orders/OrderNotFoundState";

export default async function StandaloneOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const publicId = decodeURIComponent(id ?? "").trim().replace(/[-\s]/g, "");

  if (!publicId) {
    return <OrderNotFoundState />;
  }

  return <OrderPageClient orderPublicId={publicId} />;
}
