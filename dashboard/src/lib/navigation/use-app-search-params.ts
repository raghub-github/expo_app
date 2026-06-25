"use client";

import { useSearchParams as useNextSearchParams } from "next/navigation";
import { useMemo } from "react";

/** Next.js may return null before the client hydrates; always yields URLSearchParams. */
export function useAppSearchParams(): URLSearchParams {
  const searchParams = useNextSearchParams();
  return useMemo(
    () => new URLSearchParams(searchParams?.toString() ?? ""),
    [searchParams],
  );
}
