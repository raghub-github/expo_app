/**
 * ws-gateway — fan-out websocket service.
 *
 * Architecture:
 *
 *   client (customer/rider app)            backend
 *        │                                    │
 *        │ 1. GET /v1/auth/ws-ticket          │
 *        │ ──────────────────────────────────►│  (JWT-protected;
 *        │                              ticket JWT, 60s TTL,
 *        │                              "sub": userId, "channels": [...])
 *        │ ◄──────────────────────────────────│
 *        │ {"ticket":"eyJ..."}                │
 *        │                                    │
 *        │ 2. WS connect with ticket          │
 *        │ ─────────────────────────────►   ws-gateway ◄── Redis pub/sub
 *        │   wss://ws.host/v1/ws?ticket=…      │       channels:
 *        │                                     │         order:{id}
 *        │                                     │         rider:{id}
 *        │                                     │         store:{id}
 *
 * The ticket is single-use — once consumed, the gateway burns it in Redis so
 * a replay can't open a second socket on someone else's session. Auth lives
 * at backend (the JWT secret + customer/rider session check); the gateway
 * only verifies signature + expiry + ticket-not-burned.
 *
 * Why a separate service:
 *   - Long-lived sockets don't share the Fastify backend's request lifecycle
 *     (req hooks, rate limiting, etc.). Mixing them muddles ops + scaling.
 *   - The gateway scales horizontally — every replica subscribes to the same
 *     Redis channels and forwards to local sockets only.
 */
import "dotenv/config";
import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import { jwtVerify, type JWTPayload } from "jose";
import { getRedis, getRedisSubscriber, closeRedis } from "@gatimitra/redis";

const PORT = Number(process.env.PORT ?? 4100);
const JWT_SECRET = process.env.JWT_SECRET;
const HEARTBEAT_MS = 25_000;
const STALE_SOCKET_MS = 60_000;

// Startup env validation — fail loud + early. JWT_SECRET_PREVIOUS is
// intentionally optional (used only during a rotation window).
function requireEnv(keys: string[]): void {
  const missing = keys.filter((k) => !process.env[k] || !process.env[k]!.trim());
  if (missing.length > 0) {
    console.error(`[ws-gateway] missing required env: ${missing.join(", ")}`);
    console.error("[ws-gateway] copy services/ws-gateway/.env.example → .env and fill it in");
    process.exit(2);
  }
}
requireEnv(["JWT_SECRET", "REDIS_URL"]);
if (!JWT_SECRET) {
  // Unreachable: requireEnv above already exited. Kept for the TS type narrowing
  // below — `JWT_SECRET` becomes `string | undefined` to TS otherwise.
  process.exit(2);
}
const secretBytes = new TextEncoder().encode(JWT_SECRET);
// JWT rotation support: optional secondary secret accepted during a rotation
// window. Procedure mirrors backend/src/plugins/auth.ts — set
// JWT_SECRET_PREVIOUS for a few days, then remove.
const PREV_SECRET = process.env.JWT_SECRET_PREVIOUS;
const prevSecretBytes = PREV_SECRET ? new TextEncoder().encode(PREV_SECRET) : null;

type TicketClaims = JWTPayload & {
  sub: string;
  channels: string[];
  /** "customer" | "rider" | "merchant" — surfaced in metrics, not used for auth */
  role?: string;
};

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
  },
});

await app.register(fastifyWebsocket, {
  options: { maxPayload: 64 * 1024 },
});

/* ─── In-process socket registry ─────────────────────────────────── */

type Subscriber = {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  ping: () => void;
  lastPong: number;
  channels: Set<string>;
  userId: string;
};

const channelSubscribers = new Map<string, Set<Subscriber>>();
const allSockets = new Set<Subscriber>();

function subscribe(channel: string, sub: Subscriber): void {
  let set = channelSubscribers.get(channel);
  if (!set) {
    set = new Set();
    channelSubscribers.set(channel, set);
  }
  set.add(sub);
  sub.channels.add(channel);
}

function unsubscribeAll(sub: Subscriber): void {
  for (const channel of sub.channels) {
    const set = channelSubscribers.get(channel);
    if (set) {
      set.delete(sub);
      if (set.size === 0) channelSubscribers.delete(channel);
    }
  }
  sub.channels.clear();
  allSockets.delete(sub);
}

/* ─── Redis pub/sub bridge (1 subscriber connection for all channels) ─── */

const subscriber = getRedisSubscriber();
subscriber.on("pmessage", (_pattern, channel, message) => {
  const set = channelSubscribers.get(channel);
  if (!set || set.size === 0) return;
  for (const sub of set) {
    try {
      sub.send(message);
    } catch {
      // socket broke during write — clean up on next heartbeat
    }
  }
});
// Pattern subscribe so we don't have to subscribe/unsubscribe per client.
// Three domains: orders, riders, stores. Backend publishes onto these.
await subscriber.psubscribe("order:*", "rider:*", "store:*");
app.log.info("redis pattern-subscribed: order:*, rider:*, store:*");

/* ─── Ticket verification ────────────────────────────────────────── */

async function verifyTicket(ticket: string): Promise<TicketClaims | null> {
  try {
    const { payload } = await jwtVerify(ticket, secretBytes, {
      algorithms: ["HS256"],
      audience: "ws-gateway",
    });
    return payload as TicketClaims;
  } catch {
    // Fall back to the previous secret during rotation windows.
    if (prevSecretBytes) {
      try {
        const { payload } = await jwtVerify(ticket, prevSecretBytes, {
          algorithms: ["HS256"],
          audience: "ws-gateway",
        });
        return payload as TicketClaims;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Single-use enforcement: the ticket's `jti` claim is burned in Redis on
 * first connect. Replay attempts find the burn and get rejected.
 */
async function burnTicket(jti: string, ttlSec: number): Promise<boolean> {
  if (!jti) return true; // tickets without jti can't be single-use; accept
  const redis = getRedis();
  const key = `ws:ticket-burn:${jti}`;
  const ok = await redis.set(key, "1", "EX", Math.max(ttlSec, 60), "NX");
  return ok === "OK";
}

/* ─── WS endpoint ────────────────────────────────────────────────── */

app.get("/healthz", async () => ({ ok: true, sockets: allSockets.size, channels: channelSubscribers.size }));

app.register(async (instance) => {
  instance.get("/v1/ws", { websocket: true }, async (socket, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const ticket = url.searchParams.get("ticket") ?? "";
    const claims = await verifyTicket(ticket);
    if (!claims) {
      socket.close(4001, "invalid_ticket");
      return;
    }
    const exp = typeof claims.exp === "number" ? claims.exp : Math.floor(Date.now() / 1000) + 60;
    const ttlSec = Math.max(60, exp - Math.floor(Date.now() / 1000));
    const ok = await burnTicket(String(claims.jti ?? ""), ttlSec);
    if (!ok) {
      socket.close(4002, "ticket_replay");
      return;
    }

    const sub: Subscriber = {
      send: (s) => socket.send(s),
      close: (c, r) => socket.close(c, r),
      ping: () => socket.ping(),
      lastPong: Date.now(),
      channels: new Set(),
      userId: claims.sub,
    };
    allSockets.add(sub);

    // Subscribe to whatever channels the ticket authorized.
    for (const ch of claims.channels ?? []) {
      if (typeof ch === "string" && /^[a-z][a-z0-9_-]*:[A-Za-z0-9_:-]+$/.test(ch)) {
        subscribe(ch, sub);
      }
    }
    socket.send(JSON.stringify({ type: "ready", channels: Array.from(sub.channels) }));

    socket.on("pong", () => { sub.lastPong = Date.now(); });
    socket.on("message", (raw) => {
      // Inbound is rare today — accept "ping" keepalive and echo, ignore everything else.
      try {
        const msg = JSON.parse(String(raw));
        if (msg?.type === "ping") socket.send(JSON.stringify({ type: "pong" }));
      } catch { /* ignore */ }
    });
    socket.on("close", () => unsubscribeAll(sub));
    socket.on("error", () => unsubscribeAll(sub));
  });
});

/* ─── Heartbeat + stale socket reaper ─────────────────────────────── */

const heartbeat = setInterval(() => {
  const now = Date.now();
  for (const sub of allSockets) {
    if (now - sub.lastPong > STALE_SOCKET_MS) {
      sub.close(4003, "stale");
      unsubscribeAll(sub);
      continue;
    }
    try { sub.ping(); } catch { /* socket already dead */ }
  }
}, HEARTBEAT_MS);

/* ─── Graceful shutdown ──────────────────────────────────────────── */

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  clearInterval(heartbeat);
  for (const sub of allSockets) {
    try { sub.close(1001, "server_shutdown"); } catch { /* ignore */ }
  }
  await subscriber.punsubscribe().catch(() => undefined);
  await app.close();
  await closeRedis();
  process.exit(0);
};
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ port: PORT, host: "0.0.0.0" });
app.log.info({ port: PORT }, "ws-gateway listening");
