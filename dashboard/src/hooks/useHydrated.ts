"use client";

import { useEffect, useState } from "react";

/** True only after mount — avoids SSR vs client mismatch when persisted React Query differs from server. */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
