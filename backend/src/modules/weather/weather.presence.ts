import { getWeatherCache, getZoneCoords, isCacheFresh } from "./weather.cache.js";
import { touchZonePresence, leaveZonePresence, type ZoneActorType } from "./weather.zones-active.js";

function mapRoleToActor(role: string | undefined, explicit?: ZoneActorType): ZoneActorType {
  if (explicit) return explicit;
  if (role === "rider") return "rider";
  if (role === "merchant") return "merchant";
  return "customer";
}

/** WS connect / ticket mint — mark zone active and refresh stale cache once. */
export async function handleZonePresenceJoin(args: {
  zoneKey: string;
  actorId: string;
  actorType?: ZoneActorType;
  role?: string;
}): Promise<void> {
  const actorType = mapRoleToActor(args.role, args.actorType);
  touchZonePresence(args.zoneKey, actorType, args.actorId);

  const coords = await getZoneCoords(args.zoneKey);
  if (!coords) return;

  const cache = await getWeatherCache(args.zoneKey);
  if (isCacheFresh(cache)) return;

  void import("./weather.service.js")
    .then(({ refreshZoneWeatherFromProvider }) =>
      refreshZoneWeatherFromProvider({
        lat: coords.latitude,
        lng: coords.longitude,
        cityHint: coords.city,
        trigger: "ws_connect",
        actorId: args.actorId,
        actorType,
      })
    )
    .catch(() => undefined);
}

/** WS disconnect — decrement active count; zone sleeps when total hits 0. */
export function handleZonePresenceLeave(args: {
  zoneKey: string;
  actorId: string;
  actorType?: ZoneActorType;
  role?: string;
}): void {
  const actorType = mapRoleToActor(args.role, args.actorType);
  leaveZonePresence(args.zoneKey, actorType, args.actorId);
}
