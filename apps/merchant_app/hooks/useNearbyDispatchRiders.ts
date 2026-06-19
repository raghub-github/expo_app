import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  fetchNearbyDispatchRiders,
  type NearbyDispatchRiderSummary,
} from "@/services/ordersApi";

const POLL_MS = 12_000;

export function useNearbyDispatchRiders(
  ordersFoodId: number | null | undefined,
  enabled: boolean
) {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  const [summary, setSummary] = useState<NearbyDispatchRiderSummary | null>(null);
  const [riderAssigned, setRiderAssigned] = useState(false);
  const inFlightRef = useRef(false);

  const fetchSummary = useCallback(
    async (_opts?: { background?: boolean }) => {
      if (!enabled || !ordersFoodId || !storeId || !token || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const res = await fetchNearbyDispatchRiders(storeId, ordersFoodId, token);
        if (res.riderAssigned) {
          setRiderAssigned(true);
          setSummary(null);
          return;
        }
        setRiderAssigned(false);
        if (res.summary) setSummary(res.summary);
      } catch {
        /* keep last summary */
      } finally {
        inFlightRef.current = false;
      }
    },
    [enabled, ordersFoodId, storeId, token]
  );

  useEffect(() => {
    if (!enabled || !ordersFoodId || !storeId || !token) {
      setSummary(null);
      setRiderAssigned(false);
      return;
    }
    void fetchSummary();
    const timer = setInterval(() => void fetchSummary({ background: true }), POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, ordersFoodId, storeId, token, fetchSummary]);

  return { summary, riderAssigned, refresh: fetchSummary };
}
