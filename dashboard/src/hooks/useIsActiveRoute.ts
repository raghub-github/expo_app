"use client";
import { useAppPathname } from "@/hooks/useAppSearchParams";



/** True when the current pathname matches a route prefix (or exact path). */
export function useIsActiveRoute(prefix: string, exact = false): boolean {
  const pathname = useAppPathname() ?? "";
  const clean = pathname.split("?")[0].split("#")[0];
  if (exact) return clean === prefix;
  return clean === prefix || clean.startsWith(`${prefix}/`);
}

