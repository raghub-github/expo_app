import { useCallback, useEffect, useState } from "react";
import {
  readDeviceOrderAlertsAsync,
  writeDeviceOrderAlerts,
  type DeviceOrderAlerts,
} from "@/lib/deviceOrderAlerts";

export function useDeviceOrderAlerts(storeId: number | null | undefined) {
  const [state, setState] = useState<DeviceOrderAlerts | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (storeId == null || !Number.isFinite(storeId)) {
      setState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await readDeviceOrderAlertsAsync(storeId);
      setState(next);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const update = useCallback(
    async (partial: Partial<DeviceOrderAlerts>) => {
      if (storeId == null || !Number.isFinite(storeId)) return;
      const next = await writeDeviceOrderAlerts(storeId, partial);
      setState(next);
      return next;
    },
    [storeId]
  );

  return { deviceAlerts: state, loading, refresh, update };
}
