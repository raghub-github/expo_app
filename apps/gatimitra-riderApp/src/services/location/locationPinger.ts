import type { RiderLocationPingResponse, Session } from "@gatimitra/contracts";
import { getRiderAppConfig } from "../../config/env";
import { postJson } from "../http";
import type { RiderLocationFix } from "./types";

const ALLOWED_PROVIDERS = new Set(["gps", "network", "fused", "unknown"]);

export function normalizeLocationProvider(
  raw?: string | null
): "gps" | "network" | "fused" | "unknown" {
  const v = String(raw ?? "unknown").toLowerCase();
  if (v === "background" || v === "passive") return "unknown";
  if (ALLOWED_PROVIDERS.has(v)) return v as "gps" | "network" | "fused" | "unknown";
  return "unknown";
}

/** Shared across foreground hook + background task so they cannot stampede the API. */
let lastPingSentAtMs = 0;
export const MIN_CLIENT_PING_GAP_MS = 8_000;

export function consumeLocationPingSlot(minGapMs = MIN_CLIENT_PING_GAP_MS): boolean {
  const now = Date.now();
  if (now - lastPingSentAtMs < minGapMs) return false;
  lastPingSentAtMs = now;
  return true;
}

export async function pingLocation(args: {
  session: Session;
  deviceId: string;
  fix: RiderLocationFix;
}): Promise<RiderLocationPingResponse> {
  if (!consumeLocationPingSlot()) {
    return {
      accepted: true,
      serverTsMs: Date.now(),
      fraudSignals: [],
      fraudScore: 0,
      eventPersisted: false,
      recommendedPingIntervalMs: 30_000,
      trackingMode: "idle",
    };
  }

  const cfg = getRiderAppConfig();
  const url = `${cfg.apiBaseUrl}/v1/rider/location/ping`;

  return await postJson<RiderLocationPingResponse>(
    url,
    {
      tsMs: args.fix.tsMs,
      lat: args.fix.lat,
      lng: args.fix.lng,
      accuracyM: args.fix.accuracyM,
      altitudeM: args.fix.altitudeM,
      speedMps: args.fix.speedMps,
      headingDeg: args.fix.headingDeg,
      mocked: args.fix.mocked,
      provider: normalizeLocationProvider(args.fix.provider),
      deviceId: args.deviceId,
    },
    { headers: { authorization: `Bearer ${args.session.accessToken}` } },
  );
}


