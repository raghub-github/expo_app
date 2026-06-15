import { useEffect, useMemo, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Location from "expo-location";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useDutyStore } from "@/src/stores/dutyStore";
import { getOrCreateDeviceId } from "@/src/utils/deviceId";
import {
  createForegroundLocationTracker,
  type LocationTrackerState,
} from "@/src/services/location/locationTracker";
import { pingLocation } from "@/src/services/location/locationPinger";
import type { RiderLocationFix } from "@/src/services/location/types";
import { riderDispatchLog } from "@/src/lib/rider-dispatch-log";

const PING_MIN_INTERVAL_MS = 3000;
/** Keep dispatch pool fresh even when rider is stationary (backend max ~10 min). */
const STALE_LOCATION_PING_MS = 90_000;

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

  const sendLocationPing = async (fix: RiderLocationFix) => {
    if (!session) return;
    const now = Date.now();
    if (now - lastPingAtRef.current < PING_MIN_INTERVAL_MS) return;
    lastPingAtRef.current = now;
    try {
      const deviceId = await getOrCreateDeviceId();
      await pingLocation({ session, deviceId, fix });
      riderDispatchLog("location ping sent");
    } catch {
      /* non-blocking */
    }
  };

  const resolveFixForPing = async (): Promise<RiderLocationFix | null> => {
    const state = tracker.getState();
    if (state.status === "tracking" && state.lastFix) {
      return state.lastFix;
    }
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") return null;
      const loc =
        (await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }).catch(() => null)) ??
        (await Location.getLastKnownPositionAsync({ maxAge: 300_000 }));
      if (!loc) return null;
      const c = loc.coords;
      return {
        tsMs: loc.timestamp,
        lat: c.latitude,
        lng: c.longitude,
        accuracyM: c.accuracy ?? undefined,
        altitudeM: c.altitude ?? undefined,
        speedMps: c.speed ?? undefined,
        headingDeg: c.heading ?? undefined,
        provider: "unknown",
      };
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!isOnDuty || !session) return;

    const refreshLocation = async (reason: string) => {
      riderDispatchLog(`location refresh (${reason})`);
      const fix = await resolveFixForPing();
      if (fix) await sendLocationPing(fix);
    };

    const stalePingId = setInterval(() => {
      if (AppState.currentState !== "active") return;
      void refreshLocation("periodic");
    }, STALE_LOCATION_PING_MS);

    const appStateSub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next !== "active" || !isOnDuty) return;
      void (async () => {
        await tracker.stop();
        await tracker.start();
        await refreshLocation("app_foreground");
      })();
    });

    return () => {
      clearInterval(stalePingId);
      appStateSub.remove();
    };
  }, [isOnDuty, session, tracker]);
}
