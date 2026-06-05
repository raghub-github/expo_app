"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchCancellationCatalogClient } from "@/lib/orders/cancellation-catalog-client-cache";
import type {
  CancellationAttributeRow,
  CancellationReasonCatalogGrouped,
} from "@/lib/db/operations/order-cancellation-reason-catalog";

type Options = {
  /** When false, skips network (use for modals closed / below-the-fold UI). */
  enabled?: boolean;
};

export function useCancellationReasonCatalog(options?: Options) {
  const enabled = options?.enabled !== false;
  const [attributes, setAttributes] = useState<CancellationAttributeRow[]>([]);
  const [grouped, setGrouped] = useState<CancellationReasonCatalogGrouped>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCancellationCatalogClient();
      setAttributes(data.attributes);
      setGrouped(data.grouped);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load cancellation reasons");
      setAttributes([]);
      setGrouped({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  return { attributes, grouped, loading, error, reload: load };
}
