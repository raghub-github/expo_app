import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Next 15+ wraps `searchParams` in a Promise — it must be awaited before
// reading entries, otherwise the generated page-props type fails to compile.
export default async function PartnersFoodOrdersRedirect({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = (await searchParams) ?? {};
  const params = new URLSearchParams();
  Object.entries(resolved).forEach(([k, v]) => {
    if (v == null) return;
    if (Array.isArray(v)) v.forEach((x) => params.append(k, String(x)));
    else params.set(k, String(v));
  });
  const qs = params.toString();
  redirect(`/partners/orders${qs ? `?${qs}` : ""}`);
}
