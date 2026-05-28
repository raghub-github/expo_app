"use client";

import { usePathname } from "next/navigation";

/** True when the current pathname matches a route prefix (or exact path). */
export function useIsActiveRoute(prefix: string, exact = false): boolean {
  const pathname = usePathname() ?? "";
  const clean = pathname.split("?")[0].split("#")[0];
  if (exact) return clean === prefix;
  return clean === prefix || clean.startsWith(`${prefix}/`);
}
