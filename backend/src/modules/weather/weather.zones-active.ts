/** In-memory active zone registry — idle zones never trigger Open-Meteo fetches. */

export type ZoneActorType = "customer" | "rider" | "merchant" | "order";

type ActorRef = {
  type: ZoneActorType;
  id: string;
  expiresAt: number;
};

const zoneActors = new Map<string, Map<string, ActorRef>>();

/** Default lease — renewed on WS ticket, weather API, and presence heartbeats. */
export const ZONE_PRESENCE_TTL_MS = 5 * 60 * 1000;
const ORDER_PRESENCE_TTL_MS = 6 * 60 * 60 * 1000;

function actorMapKey(type: ZoneActorType, id: string): string {
  return `${type}:${id}`;
}

function pruneExpired(zoneKey: string): void {
  const map = zoneActors.get(zoneKey);
  if (!map) return;
  const now = Date.now();
  for (const [k, ref] of map) {
    if (ref.expiresAt <= now) map.delete(k);
  }
  if (map.size === 0) zoneActors.delete(zoneKey);
}

export function touchZonePresence(
  zoneKey: string,
  type: ZoneActorType,
  id: string,
  ttlMs?: number
): void {
  const trimmed = zoneKey.trim();
  const actorId = id.trim();
  if (!trimmed || !actorId) return;

  const ttl =
    ttlMs ?? (type === "order" ? ORDER_PRESENCE_TTL_MS : ZONE_PRESENCE_TTL_MS);
  let map = zoneActors.get(trimmed);
  if (!map) {
    map = new Map();
    zoneActors.set(trimmed, map);
  }
  map.set(actorMapKey(type, actorId), {
    type,
    id: actorId,
    expiresAt: Date.now() + ttl,
  });
}

export function leaveZonePresence(
  zoneKey: string,
  type: ZoneActorType,
  id: string
): void {
  const map = zoneActors.get(zoneKey.trim());
  if (!map) return;
  map.delete(actorMapKey(type, id));
  if (map.size === 0) zoneActors.delete(zoneKey.trim());
}

export function isZoneActive(zoneKey: string): boolean {
  pruneExpired(zoneKey);
  return (zoneActors.get(zoneKey)?.size ?? 0) > 0;
}

export type ZoneActivitySummary = {
  zoneKey: string;
  customers: number;
  riders: number;
  merchants: number;
  orders: number;
  total: number;
};

export function getZoneActivitySummary(zoneKey: string): ZoneActivitySummary {
  pruneExpired(zoneKey);
  const map = zoneActors.get(zoneKey);
  const summary: ZoneActivitySummary = {
    zoneKey,
    customers: 0,
    riders: 0,
    merchants: 0,
    orders: 0,
    total: 0,
  };
  if (!map) return summary;
  for (const ref of map.values()) {
    if (ref.type === "customer") summary.customers += 1;
    else if (ref.type === "rider") summary.riders += 1;
    else if (ref.type === "merchant") summary.merchants += 1;
    else summary.orders += 1;
    summary.total += 1;
  }
  return summary;
}

export function listActiveZoneSummaries(): ZoneActivitySummary[] {
  const out: ZoneActivitySummary[] = [];
  for (const zoneKey of zoneActors.keys()) {
    pruneExpired(zoneKey);
    if (!zoneActors.has(zoneKey)) continue;
    out.push(getZoneActivitySummary(zoneKey));
  }
  return out.sort((a, b) => b.total - a.total);
}
