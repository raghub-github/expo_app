"use client";

import { usePathname as useNextPathname } from "next/navigation";

/** Next.js may return null before hydration; always yields a string. */
export function useAppPathname(): string {
  return useNextPathname() ?? "";
}
