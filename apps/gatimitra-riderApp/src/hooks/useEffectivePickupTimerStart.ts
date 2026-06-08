import { useEffect, useMemo, useState } from "react";
import {
  type PickupSheetTimerMode,
  type PickupTimerOrderFields,
  resolveEffectivePickupTimerStartedAt,
} from "@/src/lib/food-pickup-wait";
import {
  persistPickupTimerStart,
  readPersistedPickupTimerStart,
  readPersistedPickupTimerStartSync,
} from "@/src/lib/food-pickup-timer-store";

function pickEarlierIso(a: string, b: string): string {
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

/**
 * Stable pickup-window start — server fields, then local persistence (no reset on sheet close / app restart).
 */
export function useEffectivePickupTimerStart(
  orderKey: string,
  order: PickupTimerOrderFields & { preparedAt?: string | null },
  merchantReady: boolean,
  timerMode: PickupSheetTimerMode
): string | null {
  const serverIso = order.pickupTimerStartedAt ?? null;
  const derivedIso = useMemo(
    () => resolveEffectivePickupTimerStartedAt(order, merchantReady),
    [order, merchantReady]
  );

  const [persistedIso, setPersistedIso] = useState<string | null>(() =>
    readPersistedPickupTimerStartSync(orderKey)
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await readPersistedPickupTimerStart(orderKey);
      if (cancelled) return;

      const candidates = [serverIso, derivedIso, stored].filter(
        (v): v is string => !!v && Number.isFinite(new Date(v).getTime())
      );

      if (candidates.length === 0) {
        if (timerMode === "pickup") {
          const now = new Date().toISOString();
          await persistPickupTimerStart(orderKey, now);
          if (!cancelled) setPersistedIso(now);
        } else if (!cancelled) {
          setPersistedIso(stored);
        }
        return;
      }

      const best = candidates.reduce((a, b) => pickEarlierIso(a, b));
      await persistPickupTimerStart(orderKey, best);
      if (!cancelled) setPersistedIso(best);
    })();

    return () => {
      cancelled = true;
    };
  }, [orderKey, serverIso, derivedIso, timerMode]);

  const effective = useMemo(() => {
    const candidates = [serverIso, derivedIso, persistedIso].filter(
      (v): v is string => !!v && Number.isFinite(new Date(v).getTime())
    );
    if (candidates.length === 0) return null;
    return candidates.reduce((a, b) => pickEarlierIso(a, b));
  }, [serverIso, derivedIso, persistedIso]);

  return effective;
}
