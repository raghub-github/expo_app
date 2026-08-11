/**
 * Merchant live rider location — shared session store (one WS/poll per order).
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { MerchantRiderTrackingPayload } from "@/services/riderTrackingApi";
import {
  acquireRiderTrackingSession,
  buildRiderTrackingKey,
  getRiderTrackingSnapshot,
  releaseRiderTrackingSubscriber,
  subscribeRiderTrackingSnapshot,
  updateRiderTrackingSubscriber,
} from "@/lib/merchantRiderTrackingStore";

type Props = {
  enabled: boolean;
  storeId: number | null;
  ordersFoodId: number | null;
  wsOrderIds: string[];
  token: string | null;
  onLocationPatch?: (payload: MerchantRiderTrackingPayload) => void;
  onEtaUpdated?: (payload: Record<string, unknown>) => void;
};

export function useMerchantRiderLiveTracking({
  enabled,
  storeId,
  ordersFoodId,
  wsOrderIds,
  token,
  onLocationPatch,
  onEtaUpdated,
}: Props): {
  data: MerchantRiderTrackingPayload | null;
  loading: boolean;
  error: string | null;
  wsConnected: boolean;
  reload: (silent?: boolean) => Promise<void>;
} {
  const trackingKey = buildRiderTrackingKey(storeId, ordersFoodId);
  const canRun = enabled && storeId != null && ordersFoodId != null && !!token;

  const subRef = useRef<{ key: string; id: number; reload: (silent?: boolean) => Promise<void> } | null>(
    null
  );
  const onPatchRef = useRef(onLocationPatch);
  const onEtaRef = useRef(onEtaUpdated);
  onPatchRef.current = onLocationPatch;
  onEtaRef.current = onEtaUpdated;

  const wsOrderIdsKey = useMemo(() => wsOrderIds.join("|"), [wsOrderIds]);

  useEffect(() => {
    if (!canRun || !trackingKey || !token || ordersFoodId == null || storeId == null) {
      if (subRef.current) {
        releaseRiderTrackingSubscriber(subRef.current.key, subRef.current.id);
        subRef.current = null;
      }
      return;
    }

    const handle = acquireRiderTrackingSession(
      {
        storeId,
        ordersFoodId,
        wsOrderIds,
        token,
      },
      {
        enabled: canRun,
        onLocationPatch: (p) => onPatchRef.current?.(p),
        onEtaUpdated: (p) => onEtaRef.current?.(p),
      }
    );
    subRef.current = handle;

    return () => {
      releaseRiderTrackingSubscriber(handle.key, handle.id);
      if (subRef.current?.id === handle.id) subRef.current = null;
    };
  }, [canRun, trackingKey, storeId, ordersFoodId, token, wsOrderIdsKey]);

  useEffect(() => {
    if (!subRef.current || !trackingKey) return;
    updateRiderTrackingSubscriber(subRef.current.key, {
      id: subRef.current.id,
      enabled: canRun,
      onLocationPatch: (p) => onPatchRef.current?.(p),
      onEtaUpdated: (p) => onEtaRef.current?.(p),
    });
  }, [canRun, trackingKey, onLocationPatch, onEtaUpdated]);

  const snapshot = useSyncExternalStore(
    (onStoreChange) => {
      if (!trackingKey) return () => {};
      return subscribeRiderTrackingSnapshot(trackingKey, onStoreChange);
    },
    () => getRiderTrackingSnapshot(trackingKey),
    () => getRiderTrackingSnapshot(trackingKey)
  );

  const reload = subRef.current?.reload ?? (async () => {});

  if (!canRun) {
    return {
      data: null,
      loading: false,
      error: null,
      wsConnected: false,
      reload,
    };
  }

  return {
    data: snapshot.data,
    loading: snapshot.loading,
    error: snapshot.error,
    wsConnected: snapshot.wsConnected,
    reload,
  };
}
