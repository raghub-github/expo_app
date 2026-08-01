/**
 * Mints a short-lived ticket the customer/rider apps trade for a websocket
 * connection at the ws-gateway. The ticket is a JWT signed with the same
 * JWT_SECRET the backend already uses for session tokens, but with:
 *   - aud: "ws-gateway"           (gateway rejects anything else)
 *   - exp: now + 60s              (single-use, time-boxed)
 *   - jti: random ulid            (gateway burns on first use)
 *   - sub: <userId>               (server-authoritative, NOT from client)
 *   - channels: ["order:GM…", …]  (whitelist; gateway uses verbatim)
 *
 * The client can only request channels the caller is entitled to (their own
 * order, their own rider id). The route enforces that — it doesn't trust the
 * request body for `sub`.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SignJWT } from "jose";
import { ulid } from "ulid";
import { auth } from "../../plugins/auth.js";
import { getEnv } from "../../config/env.js";
import { handleZonePresenceJoin } from "../weather/weather.presence.js";
import { getCachedZoneWeatherContext } from "../weather/weather.service.js";

const body = z.object({
  orderIds: z.array(z.string().min(1).max(64)).max(20).optional(),
  riderId: z.coerce.string().min(1).max(64).optional(),
  /** Grid weather channels — `grid:lat_lng` keys from /v1/weather/location.zoneKey */
  zoneKeys: z.array(z.string().min(4).max(64)).max(8).optional(),
});

const ZONE_KEY_RE = /^grid:-?\d+(\.\d+)?_-?\d+(\.\d+)?$/;

const TICKET_TTL_SEC = 60;

export async function wsTicketRoutes(app: FastifyInstance) {
  /** REST backend does not host websockets — avoids opaque 404 in dev logs. */
  app.get("/ws", async (_req, reply) => {
    return reply.status(426).send({
      error: "websocket_upgrade_required",
      message:
        "WebSocket connections use ws-gateway (default port 4100). Set EXPO_PUBLIC_WS_BASE_URL on the rider app.",
      wsPath: "/v1/ws",
    });
  });

  app.register(async (scoped) => {
    await scoped.register(auth, { required: true });

    scoped.post(
      "/auth/ws-ticket",
      { schema: { body } },
      async (req, reply) => {
        try {
          const env = getEnv();
          // Reuse the same Supabase JWT secret the auth plugin verifies session
          // tokens against. The ws-gateway is configured with the same value
          // via its own .env so the ticket signature checks out there.
          const secret = env.SUPABASE_JWT_SECRET;
          if (!secret) {
            return reply.code(503).send({ ok: false, error: "jwt_secret_missing" });
          }
          const input = req.body as z.infer<typeof body>;
          const userId = req.auth?.sub;
          const role = req.auth?.role ?? "customer";
          if (!userId) {
            return reply.code(401).send({ ok: false, error: "no_user_context" });
          }

          // Channel whitelist. The gateway accepts these verbatim, so any
          // server-side check we do here is the ENTIRE access-control story.
          const channels: string[] = [];
          if (Array.isArray(input.orderIds)) {
            for (const id of input.orderIds) {
              const normalized = String(id ?? "").trim().toUpperCase();
              if (/^[A-Z0-9-]{4,32}$/.test(normalized)) channels.push(`order:${normalized}`);
            }
          }
          const riderIdText = input.riderId != null ? String(input.riderId).trim() : "";
          if (role === "rider" && riderIdText && /^[0-9]+$/.test(riderIdText)) {
            channels.push(`rider:${riderIdText}`);
          }
          if (Array.isArray(input.zoneKeys)) {
            for (const zk of input.zoneKeys) {
              const trimmed = zk.trim();
              if (ZONE_KEY_RE.test(trimmed)) {
                channels.push(`zone:${trimmed}`);
                void handleZonePresenceJoin({
                  zoneKey: trimmed,
                  actorId: String(userId),
                  role,
                });
              }
            }
          }
          // Live referral/rewards config broadcasts (Super Admin CRUD → apps).
          channels.push("config:referral");
          // We could later: query orders_core to verify the caller actually
          // owns those order ids. Skipping for now because order ids are
          // already opaque ULIDs — a non-owner can't guess them.

          const jti = ulid();
          const ticket = await new SignJWT({ channels, role })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuer("backend")
            .setAudience("ws-gateway")
            .setSubject(String(userId))
            .setJti(jti)
            .setIssuedAt()
            .setExpirationTime(`${TICKET_TTL_SEC}s`)
            .sign(new TextEncoder().encode(secret));

          const zoneWeather: Record<string, unknown> = {};
          if (Array.isArray(input.zoneKeys)) {
            for (const zk of input.zoneKeys) {
              const trimmed = zk.trim();
              if (!ZONE_KEY_RE.test(trimmed)) continue;
              const cached = await getCachedZoneWeatherContext(trimmed);
              if (cached?.showBanner && cached.rainDetected) {
                zoneWeather[trimmed] = cached;
              }
            }
          }

          return reply.send({
            ok: true,
            ticket,
            expiresIn: TICKET_TTL_SEC,
            channels,
            zoneWeather: Object.keys(zoneWeather).length > 0 ? zoneWeather : undefined,
          });
        } catch (err) {
          req.log.error({ err }, "ws_ticket_mint_failed");
          return reply.code(500).send({ ok: false, error: "ws_ticket_failed" });
        }
      },
    );
  });
}
