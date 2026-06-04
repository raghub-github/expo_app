import { redirect } from "next/navigation";

export default async function StoreRefundPolicyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const q = new URLSearchParams({ refundPolicy: "1" });
  const portal = sp.portal;
  if (typeof portal === "string" && portal) {
    q.set("portal", portal);
  }
  redirect(`/dashboard/merchants/stores/${id}/payments?${q.toString()}`);
}
