'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  PARTNER_DEVICE_ORDER_ALERTS_EVENT,
  readPartnerDeviceOrderAlerts,
  writePartnerDeviceOrderAlerts,
  type PartnerDeviceOrderAlerts,
} from '@/lib/partner-device-order-alerts';

export function usePartnerDeviceOrderAlerts(storeId: string | null | undefined) {
  const [state, setState] = useState<PartnerDeviceOrderAlerts>(() => readPartnerDeviceOrderAlerts(storeId));

  useEffect(() => {
    setState(readPartnerDeviceOrderAlerts(storeId));
  }, [storeId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const refresh = () => setState(readPartnerDeviceOrderAlerts(storeId));

    const onCustom = (e: Event) => {
      const sid = (e as CustomEvent<{ storeId?: string }>).detail?.storeId;
      if (!sid || sid === storeId) refresh();
    };

    const onStorage = (e: StorageEvent) => {
      if (!storeId || !e.key) return;
      if (e.key.includes(storeId)) refresh();
    };

    window.addEventListener(PARTNER_DEVICE_ORDER_ALERTS_EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PARTNER_DEVICE_ORDER_ALERTS_EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, [storeId]);

  const update = useCallback(
    (partial: Partial<PartnerDeviceOrderAlerts>) => {
      if (!storeId) return;
      writePartnerDeviceOrderAlerts(storeId, partial);
      setState(readPartnerDeviceOrderAlerts(storeId));
    },
    [storeId]
  );

  return [state, update] as const;
}
