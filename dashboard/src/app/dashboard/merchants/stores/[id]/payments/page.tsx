import { StorePaymentsClient } from "./StorePaymentsClient";

export default async function StorePaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ refundPolicy?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const initialRefundPolicyOpen = sp.refundPolicy === "1";
  return <StorePaymentsClient storeId={id} initialRefundPolicyOpen={initialRefundPolicyOpen} />;
}
