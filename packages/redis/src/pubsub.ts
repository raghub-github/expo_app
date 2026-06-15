/**
 * Thin pub/sub wrapper. The ws-gateway service (Stage 3) is the primary
 * consumer; the backend publishes here when an order's state changes so
 * connected clients can receive realtime pushes without polling.
 *
 * Channels follow the pattern `{domain}:{id}` — e.g. `order:GM10000042`,
 * `rider:42`, `store:45`. Subscribers can also use Redis pattern subscribe
 * (`psubscribe`) if they need wildcards.
 */
import { getRedis, getRedisSubscriber } from "./client.js";

export async function publish(channel: string, payload: unknown): Promise<void> {
  try {
    const redis = getRedis();
    await redis.publish(channel, JSON.stringify(payload));
  } catch {
    /* Redis optional — realtime push skipped for this event. */
  }
}

export type Unsubscribe = () => Promise<void>;

export async function subscribe(
  channel: string,
  handler: (payload: unknown) => void,
): Promise<Unsubscribe> {
  const sub = getRedisSubscriber();
  const listener = (ch: string, message: string) => {
    if (ch !== channel) return;
    try {
      handler(JSON.parse(message));
    } catch {
      handler(message);
    }
  };
  sub.on("message", listener);
  await sub.subscribe(channel);
  return async () => {
    await sub.unsubscribe(channel).catch(() => undefined);
    sub.off("message", listener);
  };
}
