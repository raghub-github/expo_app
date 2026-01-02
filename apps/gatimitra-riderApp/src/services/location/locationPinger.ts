import type { RiderLocationPingResponse, Session } from "@gatimitra/contracts";
import { getRiderAppConfig } from "../../config/env";
import { postJson } from "../http";
import type { RiderLocationFix } from "./types";

export async function pingLocation(args: {
  session: Session;
  deviceId: string;
  fix: RiderLocationFix;
}): Promise<RiderLocationPingResponse> {
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
      provider: args.fix.provider ?? "unknown",
      deviceId: args.deviceId,
    },
    { headers: { authorization: `Bearer ${args.session.accessToken}` } },
  );
}


