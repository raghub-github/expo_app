import { publishZoneWeatherEvent } from "../realtime/publish.js";
import type { CustomerWeatherContext } from "./weather.types.js";

/** Broadcast weather update to subscribed clients on `zone:{zoneKey}`. */
export async function broadcastWeatherUpdate(args: {
  zoneKey: string;
  event: string;
  reasons: string[];
  weather: CustomerWeatherContext;
}): Promise<void> {
  await publishZoneWeatherEvent(args.zoneKey, {
    type: "weather_changed",
    event: args.event,
    zoneKey: args.zoneKey,
    reasons: args.reasons,
    weather: args.weather,
  });
}
