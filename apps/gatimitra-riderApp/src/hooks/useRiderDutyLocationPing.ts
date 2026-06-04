import { useEffect, useMemo, useRef } from "react";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useDutyStore } from "@/src/stores/dutyStore";
import { getOrCreateDeviceId } from "@/src/utils/deviceId";
import {
  createForegroundLocationTracker,
  type LocationTrackerState,
} from "@/src/services/location/locationTracker";
import { pingLocation } from "@/src/services/location/locationPinger";

const PING_MIN_INTERVAL_MS = 3000;

/**
 * Keeps rider_live_locations fresh while on duty so dispatch pool / offers work
 * on every screen (not only the Orders map tab).
 */
export function useRiderDutyLocationPing(): void {
  const session = useSessionStore((s) => s.session);
  const isOnDuty = useDutyStore((s) => s.isOnDuty);
  const tracker = useMemo(() => createForegroundLocationTracker(), []);
  const lastPingAtRef = useRef(0);

  useEffect(() => {
    if (!isOnDuty) {
      void tracker.stop();
      return;
    }
    void tracker.start();
    return () => {
      void tracker.stop();
    };
  }, [isOnDuty, tracker]);

  useEffect(() => {
    if (!isOnDuty || !session) return;

    const pingFromState = (state: LocationTrackerState) => {
      if (state.status !== "tracking" || !state.lastFix) return;
      const now = Date.now();
      if (now - lastPingAtRef.current < PING_MIN_INTERVAL_MS) return;
      lastPingAtRef.current = now;
      void (async () => {
        try {
          const deviceId = await getOrCreateDeviceId();
          await pingLocation({ session, deviceId, fix: state.lastFix! });
        } catch {
          // non-blocking — pool poll still runs
        }
      })();
    };

    return tracker.subscribe(pingFromState);
  }, [isOnDuty, session, tracker]);
}
