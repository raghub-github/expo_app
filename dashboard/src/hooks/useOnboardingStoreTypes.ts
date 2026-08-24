"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildOnboardingStoreTypeOptions,
  FALLBACK_ONBOARDING_STORE_TYPES,
  type OnboardingStoreTypeOption,
} from "@/lib/onboarding-store-types";

export function useOnboardingStoreTypes(otherValue: "OTHER" | "OTHERS" = "OTHERS") {
  const [codes, setCodes] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let fetched: string[] | null = null;
      for (let i = 0; i < 3; i++) {
        try {
          const res = await fetch("/api/onboarding/store-types", {
            cache: "no-store",
            credentials: "include",
          });
          const data = (await res.json().catch(() => ({}))) as {
            success?: boolean;
            storeTypes?: string[];
            code?: string;
          };
          const retryable =
            res.status === 503 ||
            String(data.code ?? "").toUpperCase() === "SERVICE_UNAVAILABLE" ||
            String(data.code ?? "").toUpperCase() === "SESSION_REQUIRED";
          if (res.ok && Array.isArray(data.storeTypes) && data.storeTypes.length > 0) {
            fetched = data.storeTypes;
            break;
          }
          if (!retryable || i === 2) {
            fetched = Array.isArray(data.storeTypes) ? data.storeTypes : [];
            break;
          }
          await new Promise((r) => setTimeout(r, 400 * (i + 1)));
        } catch {
          if (i === 2) fetched = [];
        }
      }
      if (!cancelled) setCodes(fetched ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const options: OnboardingStoreTypeOption[] = useMemo(() => {
    const source =
      codes == null
        ? FALLBACK_ONBOARDING_STORE_TYPES.map((o) => o.value)
        : codes;
    return buildOnboardingStoreTypeOptions(source, otherValue);
  }, [codes, otherValue]);

  return {
    options,
    loaded: codes !== null,
  };
}
