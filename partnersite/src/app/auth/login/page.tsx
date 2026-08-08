import { redirect } from "next/navigation";

type AuthLoginAliasProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Legacy /auth/login — canonical sign-in URL is /auth */
export default async function AuthLoginAliasPage({ searchParams }: AuthLoginAliasProps) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") qs.set(key, value);
    else if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
  }
  const query = qs.toString();
  redirect(query ? `/auth?${query}` : "/auth?redirect=/partners/all-stores");
}
