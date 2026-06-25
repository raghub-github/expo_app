"use client";

import { useParams as useNextParams } from "next/navigation";

/** Next.js may return null before hydration. */
export function useAppParams<T extends Record<string, string | string[] | undefined> = Record<string, string | string[] | undefined>>(): T {
  return (useNextParams() ?? {}) as T;
}
