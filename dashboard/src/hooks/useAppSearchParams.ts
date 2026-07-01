import {
  useSearchParams,
  usePathname,
  useParams,
  type ReadonlyURLSearchParams,
} from "next/navigation";

const EMPTY_SEARCH_PARAMS = new URLSearchParams() as ReadonlyURLSearchParams;

/** Non-null wrapper for Next.js `useSearchParams()` (nullable during static generation). */
export function useAppSearchParams(): ReadonlyURLSearchParams {
  return useSearchParams() ?? EMPTY_SEARCH_PARAMS;
}

/** Non-null wrapper for Next.js `usePathname()` (nullable during static generation). */
export function useAppPathname(): string {
  return usePathname() ?? "";
}

/** Non-null wrapper for Next.js `useParams()` (nullable during static generation). */
export function useAppParams<
  T extends Record<string, string | string[]> = Record<string, string | string[]>,
>(): T {
  return (useParams() ?? {}) as T;
}
