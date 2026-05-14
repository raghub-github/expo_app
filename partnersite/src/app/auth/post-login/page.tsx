import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PostLoginRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = searchParams ? await searchParams : undefined;
  const params = new URLSearchParams();
  if (resolved) {
    Object.entries(resolved).forEach(([k, v]) => {
      if (v == null) return;
      if (Array.isArray(v)) v.forEach((x) => params.append(k, String(x)));
      else params.set(k, String(v));
    });
  }
  const qs = params.toString();
  redirect(`/partners/all-stores${qs ? `?${qs}` : ""}`);
}
