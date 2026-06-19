import { createReadStream } from "node:fs";
import { join } from "node:path";
import type { FastifyReply } from "fastify";

/** Same bike marker asset used in customer / merchant ride maps. */
export const LIVE_TRACK_MAPBIKE_PATH = join(
  process.cwd(),
  "../apps/customer_app/public/img/mapbike.png"
);

export const LIVE_TRACK_BIKE_ICON_URL = "/trip/assets/mapbike.png";

export function sendLiveTrackMapbike(reply: FastifyReply) {
  return reply
    .type("image/png")
    .header("Cache-Control", "public, max-age=86400")
    .send(createReadStream(LIVE_TRACK_MAPBIKE_PATH));
}
