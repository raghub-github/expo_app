"use client";

import { useEffect, useState } from "react";
import { defaultCuisineListEnabled } from "@/lib/onboarding-store-types";

export function useCuisineListEnabled(storeType?: string | null) {
  const [enabled, setEnabled] = useState(() => defaultCuisineListEnabled(storeType || ""));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const t = (storeType || "").trim();
    if (!t) {
      setEnabled(false);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    void (async () => {
      try {
        const res = await fetch(
          `/api/onboarding/store-document-requirements?storeType=${encodeURIComponent(t)}`,
          { cache: "no-store", credentials: "include" }
        );
        const data = (await res.json()) as { cuisineListEnabled?: boolean };
        if (cancelled) return;
        setEnabled(
          typeof data.cuisineListEnabled === "boolean"
            ? data.cuisineListEnabled
            : defaultCuisineListEnabled(t)
        );
      } catch {
        if (!cancelled) setEnabled(defaultCuisineListEnabled(t));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeType]);

  return loaded ? enabled : defaultCuisineListEnabled(storeType || "");
}
