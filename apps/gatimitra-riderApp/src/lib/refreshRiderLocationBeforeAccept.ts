/**
 * Best-effort fresh GPS ping before accept so GAP-2 can evaluate the rider's
 * real position (not a last-known point from a killed/terminated session).
 * Never blocks accept longer than ACCEPT_LOCATION_REFRESH_MS — backend remains authoritative.
 * Skips entirely when a recent fused fix already exists (instant accept path).
 */
import { getOrCreateDeviceId } from "@/src/utils/deviceId";
import { useSessionStore } from "@/src/stores/sessionStore";
import { acquireAndCommitRiderLocation } from "@/src/services/location/riderLocationController";
import { pingLocation } from "@/src/services/location/locationPinger";
import { readLatestRiderGps } from "@/src/lib/readLatestRiderGps";
import { riderDispatchLog, riderDispatchWarn } from "@/src/lib/rider-dispatch-log";

export const ACCEPT_LOCATION_REFRESH_MS = 1_200;
/** Skip GPS acquire when last fused fix is newer than this. */
const ACCEPT_LOCATION_FRESH_MS = 45_000;

export async function refreshRiderLocationBeforeAccept(): Promise<"ok" | "skipped" | "failed"> {
  const session = useSessionStore.getState().session;
  if (!session?.accessToken) return "skipped";

  try {
    const last = readLatestRiderGps();
    const ageMs = last?.tsMs != null && Number.isFinite(last.tsMs) ? Date.now() - last.tsMs : null;
    if (
      last &&
      ageMs != null &&
      ageMs >= 0 &&
      ageMs <= ACCEPT_LOCATION_FRESH_MS
    ) {
      // Fire-and-forget ping — do not await; accept POST starts immediately.
      void (async () => {
        try {
          const deviceId = await getOrCreateDeviceId();
          await pingLocation({
            session,
            deviceId,
            fix: {
              tsMs: last.tsMs,
              lat: last.lat,
              lng: last.lng,
              accuracyM: last.accuracyM,
              altitudeM: undefined,
              speedMps: last.speedMps,
              headingDeg: last.headingDeg,
              mocked: false,
              provider: "fused",
            },
            force: false,
          });
        } catch {
          /* ignore */
        }
      })();
      riderDispatchLog("accept location skipped (fresh)", { ageMs });
      return "skipped";
    }

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
        const deviceId = await getOrCreateDeviceId();
        await pingLocation({
          session,
          deviceId,
          fix: {
            tsMs: Date.now(),
            lat: acquired.coords.latitude,
            lng: acquired.coords.longitude,
            accuracyM: acquired.coords.accuracy ?? undefined,
            altitudeM: undefined,
            speedMps: undefined,
            headingDeg: undefined,
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
