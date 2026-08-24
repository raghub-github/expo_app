"use client";

import { useEffect, useState } from "react";
import type { MerchantDocRequirement } from "@/lib/merchant-onboarding-docs";
import {
  defaultCuisineListEnabled,
  normalizeStoreTypeCode,
} from "@/lib/onboarding-store-types";

function isRetryableCatalogStatus(status: number, code: unknown): boolean {
  const c = String(code ?? "").toUpperCase();
  if (c === "SESSION_INVALID" || c === "SESSION_EXPIRED") return false;
  return (
    status === 503 ||
    status === 500 ||
    c === "SERVICE_UNAVAILABLE" ||
    c === "SESSION_REQUIRED" ||
    status === 401
  );
}

export function useMerchantStoreDocumentRequirements(storeType?: string | null) {
  const normalized = normalizeStoreTypeCode(storeType || "");
  const [docs, setDocs] = useState<MerchantDocRequirement[] | null>(null);
  const [cuisineListEnabled, setCuisineListEnabled] = useState(() =>
    defaultCuisineListEnabled(normalized)
  );
  const [loaded, setLoaded] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);

  useEffect(() => {
    if (!normalized) {
      setDocs(null);
      setCuisineListEnabled(false);
      setLoaded(true);
      setFetchFailed(false);
      return;
    }
    let cancelled = false;
    setDocs(null);
    setLoaded(false);
    setFetchFailed(false);
    void (async () => {
      const attempts = 3;
      for (let i = 0; i < attempts; i++) {
        try {
          const res = await fetch(
            `/api/onboarding/store-document-requirements?storeType=${encodeURIComponent(normalized)}`,
            { cache: "no-store", credentials: "include" }
          );
          const data = (await res.json().catch(() => ({}))) as {
            success?: boolean;
            docs?: MerchantDocRequirement[];
            cuisineListEnabled?: boolean;
            code?: string;
          };
          if (cancelled) return;
          if (res.ok && data.success !== false) {
            const list = Array.isArray(data.docs)
              ? data.docs
              : Array.isArray((data as { docs?: MerchantDocRequirement[] }).docs)
                ? (data as { docs: MerchantDocRequirement[] }).docs
                : [];
            setDocs(list);
            setCuisineListEnabled(
              typeof data.cuisineListEnabled === "boolean"
                ? data.cuisineListEnabled
                : defaultCuisineListEnabled(normalized)
            );
            setFetchFailed(false);
            setLoaded(true);
            return;
          }
          if (!isRetryableCatalogStatus(res.status, data.code) || i === attempts - 1) {
            setDocs(null);
            setFetchFailed(true);
            setCuisineListEnabled(defaultCuisineListEnabled(normalized));
            setLoaded(true);
            return;
          }
        } catch {
          if (cancelled) return;
          if (i === attempts - 1) {
            setDocs(null);
            setFetchFailed(true);
            setCuisineListEnabled(defaultCuisineListEnabled(normalized));
            setLoaded(true);
            return;
          }
        }
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [normalized]);

  return { docs, cuisineListEnabled, loaded, fetchFailed };
}
