import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function PartnersFoodOrdersRedirect({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const params = new URLSearchParams();
  if (searchParams) {
    Object.entries(searchParams).forEach(([k, v]) => {
      if (v == null) return;
      if (Array.isArray(v)) v.forEach((x) => params.append(k, String(x)));
      else params.set(k, String(v));
    });
  }
  const qs = params.toString();
  redirect(`/partners/orders${qs ? `?${qs}` : ""}`);
}

