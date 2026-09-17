/**
 * Best-effort fresh GPS ping before accept so GAP-2 can evaluate the rider's
 * real position (not a last-known point from a killed/terminated session).
 * Never blocks accept longer than ACCEPT_LOCATION_REFRESH_MS — backend remains authoritative.
 */
import { getDeviceId } from "@/src/utils/deviceId";
import { useSessionStore } from "@/src/stores/sessionStore";
import { acquireAndCommitRiderLocation } from "@/src/services/location/riderLocationController";
import { pingLocation } from "@/src/services/location/locationPinger";
import { riderDispatchLog, riderDispatchWarn } from "@/src/lib/rider-dispatch-log";

export const ACCEPT_LOCATION_REFRESH_MS = 2_500;

export async function refreshRiderLocationBeforeAccept(): Promise<"ok" | "skipped" | "failed"> {
  const session = useSessionStore.getState().session;
  if (!session?.accessToken) return "skipped";

  try {
    const result = await Promise.race([
      (async (): Promise<"ok" | "failed"> => {
        const acquired = await acquireAndCommitRiderLocation({
          assumeReady: false,
          requireFresh: true,
          preferFast: true,
        });
        if (!acquired.ok) {
          riderDispatchWarn("accept location refresh failed", { reason: acquired.reason });
          return "failed";
        }
        const deviceId = await getDeviceId();
        await pingLocation({
          session,
          deviceId,
          fix: {
            tsMs: Date.now(),
            lat: acquired.coords.latitude,
            lng: acquired.coords.longitude,
            accuracyM: acquired.coords.accuracy ?? null,
            altitudeM: null,
            speedMps: null,
            headingDeg: null,
            mocked: false,
            provider: "fused",
          },
          force: true,
        });
        riderDispatchLog("accept location refreshed");
        return "ok";
      })(),
      new Promise<"skipped">((resolve) =>
        setTimeout(() => resolve("skipped"), ACCEPT_LOCATION_REFRESH_MS)
      ),
    ]);
    return result;
  } catch (err) {
    riderDispatchWarn("accept location refresh error", {
      message: err instanceof Error ? err.message : String(err),
    });
    return "failed";
  }
}
