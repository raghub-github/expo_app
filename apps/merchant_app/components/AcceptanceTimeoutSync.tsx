/**
 * On app open / resume / when pending created orders exist, flush expired
 * unaccepted orders via the backend (single cancel authority).
 * Do NOT show an in-app toast — auto-cancel already fans out as a push.
 */
import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useOrdersContext } from "@/context/OrdersContext";
import { isAppForeground } from "@/lib/appForeground";
import { syncAcceptanceTimeout } from "@/services/ordersApi";

const syncedStoreIds = new Set<number>();

export default function AcceptanceTimeoutSync() {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { refetch, orders } = useOrdersContext();
  const storeId = selectedStore?.id ?? null;
  const runningRef = useRef(false);
  const lastSyncAtRef = useRef(0);

  const runSync = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!token || !storeId) return;
      if (runningRef.current) return;
      const now = Date.now();
      if (!opts?.force && syncedStoreIds.has(storeId) && now - lastSyncAtRef.current < 20_000) {
        return;
      }

      runningRef.current = true;
      try {
        const { cancelled } = await syncAcceptanceTimeout(storeId, token);
        syncedStoreIds.add(storeId);
        lastSyncAtRef.current = Date.now();
        if (cancelled > 0) {
          await refetch();
        }
      } catch {
        /* Backend timeout worker owns cancellation; sync is for board reconcile only. */
      } finally {
        runningRef.current = false;
      }
    },
    [token, storeId, refetch]
  );

  useEffect(() => {
    void runSync({ force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / store switch only
  }, [token, storeId]);

  const hasPendingCreated = orders.some(
    (o) => o.status === "created" && !o.id.startsWith("core-")
  );

  useEffect(() => {
    if (!hasPendingCreated) return undefined;
    const id = setInterval(() => {
      if (!isAppForeground()) return;
      void runSync({ force: true });
    }, 15_000);
    return () => clearInterval(id);
  }, [hasPendingCreated, runSync]);

  return null;
}
